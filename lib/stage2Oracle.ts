import 'server-only';

// ============================================================
// lib/stage2Oracle.ts — STAGE 2 질문 해석기 (LLM) + 결정론적 판정 연결
//
// 1. LLM(temperature 0, JSON 모드)이 학생 질문을 ParsedQuery 구조로 "번역"만 합니다.
//    이 LLM에게는 승인 코드를 절대 전달하지 않으므로 거짓말도, 누설도 할 수 없습니다.
// 2. lib/stage2Engine.ts가 실제 코드로 참/거짓을 계산하고 장착 카드 규칙대로 응답합니다.
// ============================================================

import { upstageChat } from './upstage';
import {
  answerStage2,
  guardParsedQuery,
  validateParsedQuery,
  type ParsedQuery,
  type Stage2Cards,
  type Stage2Result,
} from './stage2Engine';
import {
  buildParserMessages,
  extractJson,
  parseFullCodeGuess,
  type ParserContextItem,
} from './stage2ParserPrompt';
import { answerStage3Valid, type Stage3Result } from './stage3Engine';
import { STAGE2_RULE_CARDS } from './escapeRoomData';
import { parseCommonStageQuestion } from './stage2LocalParser';

export type { ParserContextItem };

/**
 * 학생 질문을 ParsedQuery로 해석합니다. (승인 코드는 전달하지 않음)
 * 네트워크/LLM 오류는 예외로 던지며, 구조가 틀린 출력은 intent='unclear'로 처리합니다.
 */
export async function parseStage2Question(
  message: string,
  context: ParserContextItem[],
  digitCount: 3 | 4 = 3
): Promise<ParsedQuery> {
  // 코드 길이와 같은 숫자만 찍어보는 질문은 자리 문맥보다 먼저 전체 코드 비교로 확정합니다.
  const directGuess = parseFullCodeGuess(message, digitCount);
  if (directGuess) return directGuess;

  // 자주 쓰는 자리 비교·범위·업다운 질문은 LLM을 거치지 않고 동일한 기준으로 즉시 해석합니다.
  const localParsed = parseCommonStageQuestion(message, context, digitCount);
  if (localParsed) return guardParsedQuery(localParsed, message, digitCount);

  const messages = buildParserMessages(message, context, digitCount);
  const call = () => upstageChat(messages, { temperature: 0, maxTokens: 600, jsonObject: true, timeoutMs: 10_000 });
  let text: string;
  try {
    text = await call();
  } catch {
    // 일시적 연결 끊김(ECONNRESET 등)은 1회 재시도
    text = await call();
  }
  return guardParsedQuery(validateParsedQuery(extractJson(text)), message, digitCount);
}

/**
 * 카드 ID로 장착 규칙을 확정합니다. (A그룹 1장 + B그룹 1장이 아니면 null)
 * 구버전 클라이언트 호환: ID가 없으면 규칙 텍스트의 "CARD A-1" 같은 코드로 식별합니다.
 */
export function resolveStage2Cards(ruleIds: unknown, ruleTexts?: unknown): Stage2Cards | null {
  let cards = Array.isArray(ruleIds)
    ? ruleIds
        .map((id) => STAGE2_RULE_CARDS.find((c) => c.id === id))
        .filter((c): c is (typeof STAGE2_RULE_CARDS)[number] => Boolean(c))
    : [];
  if (cards.length === 0 && Array.isArray(ruleTexts)) {
    cards = STAGE2_RULE_CARDS.filter((c) =>
      ruleTexts.some((t) => typeof t === 'string' && t.includes(`[${c.code}:`))
    );
  }
  const a = cards.filter((c) => c.group === 'A');
  const b = cards.filter((c) => c.group === 'B');
  if (a.length !== 1 || b.length !== 1) return null;
  return {
    honesty: a[0].id === 'card-01-honesty',
    binary: a[0].id === 'card-02-binary',
    silence: b[0].id === 'card-04-silence',
    conceal: b[0].id === 'card-05-concealment',
  };
}

export async function runStage2Oracle(
  message: string,
  code: string,
  cards: Stage2Cards,
  context: ParserContextItem[]
): Promise<Stage2Result & { parsed: ParsedQuery }> {
  const parsed = await parseStage2Question(message, context);
  return { ...answerStage2(parsed, code, cards), parsed };
}

/**
 * STAGE 3 정답 조합 전용: 4자리 해석 후 진단 엔진으로 응답 (오답 조합은 호출하지 않음)
 */
export async function runStage3Oracle(
  message: string,
  code: string,
  context: ParserContextItem[]
): Promise<Stage3Result & { parsed: ParsedQuery }> {
  const parsed = await parseStage2Question(message, context, 4);
  return { ...answerStage3Valid(parsed, code), parsed };
}
