import 'server-only';

// ============================================================
// lib/stage2Oracle.ts — STAGE 2 질문 해석기 (LLM) + 결정론적 판정 연결
//
// 1. LLM(temperature 0, JSON 모드)이 학생 질문을 ParsedQuery 구조로 "번역"만 합니다.
//    이 LLM에게는 승인 코드를 절대 전달하지 않으므로 거짓말도, 누설도 할 수 없습니다.
// 2. lib/stage2Engine.ts가 실제 코드로 참/거짓을 계산하고 장착 카드 규칙대로 응답합니다.
// ============================================================

import { upstageChat } from './upstage';
import { answerStage2, validateParsedQuery, type ParsedQuery, type Stage2Cards, type Stage2Result } from './stage2Engine';
import { buildParserMessages, extractJson, type ParserContextItem } from './stage2ParserPrompt';
import { STAGE2_RULE_CARDS } from './escapeRoomData';

export type { ParserContextItem };

/**
 * 학생 질문을 ParsedQuery로 해석합니다. (승인 코드는 전달하지 않음)
 * 네트워크/LLM 오류는 예외로 던지며, 구조가 틀린 출력은 intent='unclear'로 처리합니다.
 */
export async function parseStage2Question(message: string, context: ParserContextItem[]): Promise<ParsedQuery> {
  const messages = buildParserMessages(message, context);
  const call = () => upstageChat(messages, { temperature: 0, maxTokens: 600, jsonObject: true, timeoutMs: 10_000 });
  let text: string;
  try {
    text = await call();
  } catch {
    // 일시적 연결 끊김(ECONNRESET 등)은 1회 재시도
    text = await call();
  }
  return validateParsedQuery(extractJson(text));
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
