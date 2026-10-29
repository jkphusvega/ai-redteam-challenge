import type { CmpOp, Expr, ParsedQuery, Pos } from './stage2Engine';
import type { ParserContextItem } from './stage2ParserPrompt';

// ============================================================
// lib/stage2LocalParser.ts — 자주 쓰는 범위/등식 질문의 결정론적 해석기
//
// LLM 해석 전에 명확한 비교 질문을 코드로 처리합니다.
// 예: "두 번째 자리가 5보다 작아?" → digit(2) < 5
//     "3이야?" (직전 질문이 두 번째 자리) → digit(2) = 3
// ============================================================

function compact(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s,._!?？。]+/g, '');
}

function explicitPosition(text: string, digitCount: 3 | 4): Pos | null {
  const value = compact(text);

  if (/(?:첫번째|첫째|1번째|맨앞|앞자리|reg0)/.test(value)) return 1;
  if (/(?:두번째|둘째|2번째|reg1)/.test(value)) return 2;
  if (/(?:세번째|셋째|3번째|reg2)/.test(value)) return 3;
  if (digitCount === 4 && /(?:네번째|넷째|4번째|마지막|끝자리|reg3)/.test(value)) return 4;

  if (digitCount === 3) {
    if (/백의자리/.test(value)) return 1;
    if (/(?:십의자리|가운데자리|중간자리)/.test(value)) return 2;
    if (/(?:일의자리|마지막자리|끝자리)/.test(value)) return 3;
  } else {
    if (/천의자리/.test(value)) return 1;
    if (/백의자리/.test(value)) return 2;
    if (/십의자리/.test(value)) return 3;
    if (/일의자리/.test(value)) return 4;
  }

  return null;
}

function targetExpression(
  message: string,
  context: ParserContextItem[],
  digitCount: 3 | 4
): Expr | null {
  const position = explicitPosition(message, digitCount);
  if (position !== null) return { k: 'digit', pos: position };

  const value = compact(message);
  if (/(?:승인코드|전체코드|암호전체|비밀번호전체)/.test(value)) return { k: 'whole' };

  // "그러면 3이야?"처럼 자리가 생략된 짧은 후속 질문은 최근 자리를 이어받습니다.
  for (let index = context.length - 1; index >= 0; index -= 1) {
    const item = context[index];
    const previousPosition =
      explicitPosition(item.question, digitCount) ??
      (item.interpretation ? explicitPosition(item.interpretation, digitCount) : null);
    if (previousPosition !== null) return { k: 'digit', pos: previousPosition };
  }

  return null;
}

function comparisonFromMessage(message: string): { op: CmpOp; value: number } | null {
  const value = compact(message).replace(/[?？。!]+$/g, '');
  let match: RegExpMatchArray | null;

  // "업다운"처럼 두 방향을 동시에 적은 표현은 기준이 모호하므로 임의로 한쪽을 선택하지 않습니다.
  if (value.includes('업') && value.includes('다운')) return null;

  match = value.match(/(-?\d+(?:\.\d+)?)보다크거나같/);
  if (match) return { op: 'gte', value: Number(match[1]) };

  match = value.match(/(-?\d+(?:\.\d+)?)보다작거나같/);
  if (match) return { op: 'lte', value: Number(match[1]) };

  match = value.match(/(-?\d+(?:\.\d+)?)(이상|이상이야|이상인가)/);
  if (match) return { op: 'gte', value: Number(match[1]) };

  match = value.match(/(-?\d+(?:\.\d+)?)(이하|이하야|이하인가)/);
  if (match) return { op: 'lte', value: Number(match[1]) };

  match = value.match(/(-?\d+(?:\.\d+)?)(초과|초과야|초과인가)/);
  if (match) return { op: 'gt', value: Number(match[1]) };

  match = value.match(/(-?\d+(?:\.\d+)?)(미만|미만이야|미만인가)/);
  if (match) return { op: 'lt', value: Number(match[1]) };

  match = value.match(/(-?\d+(?:\.\d+)?)보다(크|커|큰|높|업)/);
  if (match) return { op: 'gt', value: Number(match[1]) };

  match = value.match(/(-?\d+(?:\.\d+)?)보다(작|작아|작은|낮|다운)/);
  if (match) return { op: 'lt', value: Number(match[1]) };

  // "5 업이야?", "5 다운이야?"처럼 기준 숫자 뒤에 방향을 붙인 표현
  match = value.match(/(-?\d+(?:\.\d+)?)(업|다운)(?:이야|인가|맞아)?$/);
  if (match) return { op: match[2] === '업' ? 'gt' : 'lt', value: Number(match[1]) };

  // 단순 숫자 확인: "3이야?", "3인가?", "3 맞아?"
  match = value.match(/(-?\d+(?:\.\d+)?)(?:이야|야|인가|맞아|입니까|맞습니까|니)$/);
  if (match) return { op: 'eq', value: Number(match[1]) };

  return null;
}

/**
 * 의미가 명확한 한 자리/전체 값 비교만 처리합니다.
 * 조금이라도 모호하면 null을 반환하여 기존 LLM 해석기로 넘깁니다.
 */
export function parseCommonStageQuestion(
  message: string,
  context: ParserContextItem[],
  digitCount: 3 | 4 = 3
): ParsedQuery | null {
  const target = targetExpression(message, context, digitCount);
  const comparison = comparisonFromMessage(message);
  if (!target || !comparison || !Number.isFinite(comparison.value)) return null;

  return {
    intent: 'condition',
    condition: {
      k: 'cmp',
      op: comparison.op,
      a: target,
      b: { k: 'num', v: comparison.value },
    },
    wordStyle: 'yesno',
  };
}
