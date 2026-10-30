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

// "마지막으로 물어볼게", "세 숫자 가운데 하나라도"처럼 자리가 아닌 뜻은 제외합니다.
const LAST = /마지막(?:자리|숫자|수|값|이|은|꺼|거)/;
const MIDDLE = /(?:가운데|중간)(?:자리|숫자)|^(?:그럼|그러면|혹시|아|음)*(?:가운데|중간)(?:가|는|이|꺼|거|값)/;

function explicitPositions(text: string, digitCount: 3 | 4): Pos[] {
  const value = compact(text);
  const positions: Pos[] = [];
  const add = (pos: Pos) => {
    if (!positions.includes(pos)) positions.push(pos);
  };

  if (/(?:첫번째|첫째|첫자리|1번째|맨앞|앞자리|reg0)/.test(value)) add(1);
  if (/(?:두번째|둘째|2번째|reg1)/.test(value)) add(2);
  if (/(?:세번째|셋째|3번째|reg2)/.test(value)) add(3);
  if (digitCount === 4 && (/(?:네번째|넷째|4번째|끝자리|맨뒤|맨끝|reg3)/.test(value) || LAST.test(value))) add(4);

  if (digitCount === 3) {
    // 4자리에서는 가운데 자리가 하나로 정해지지 않으므로 3자리에서만 인식
    if (MIDDLE.test(value)) add(2);
    if (/백의자리/.test(value)) add(1);
    if (/십의자리/.test(value)) add(2);
    if (/(?:일의자리|끝자리|맨뒤|맨끝)/.test(value) || LAST.test(value)) add(3);
  } else {
    if (/천의자리/.test(value)) add(1);
    if (/백의자리/.test(value)) add(2);
    if (/십의자리/.test(value)) add(3);
    if (/일의자리/.test(value)) add(4);
  }

  return positions;
}

function explicitPosition(text: string, digitCount: 3 | 4): Pos | null {
  return explicitPositions(text, digitCount)[0] ?? null;
}

function selectedPositionSum(message: string, digitCount: 3 | 4): Expr | null {
  const value = compact(message);
  if (!/(?:합|더하|더한|더해서|\+)/.test(value)) return null;
  if (/(?:각자리|모든자리|전체자리|전자리|세자리숫자의?합|네자리숫자의?합)/.test(value)) return null;

  const positions = explicitPositions(message, digitCount);
  if (positions.length < 2) return null;

  let result: Expr = { k: 'digit', pos: positions[0] };
  for (const pos of positions.slice(1)) {
    result = { k: 'op', op: '+', a: result, b: { k: 'digit', pos } };
  }
  return result;
}

// 응답 방식 지정·연산·부정이 섞이면 한 자리 비교로 축약할 때 뜻이 바뀌므로 LLM 해석기로 넘깁니다.
const RESPONSE_STYLE = /(?:면|라고|침묵|말해|답해|대답|출력|표시|써)/;
const OPERATION = /(?:더하|더한|빼|뺀|차이|배|나눈|나머지|곱|평균|가장|최대|최소|개수|몇개|홀수|짝수|소수|약수|포함|들어|거꾸로|뒤집|이어)/;
const NEGATION = /(?:않|아니|안돼|안되|못)/;

function needsFullParser(message: string): boolean {
  const value = compact(message);
  return RESPONSE_STYLE.test(value) || OPERATION.test(value) || NEGATION.test(value);
}

/** 서수("2번째")를 뺀 숫자 개수 — 범위("5 이상 7 이하")나 선택지("2나 3")는 비교 기준이 둘 이상 */
function comparedNumberCount(message: string): number {
  return (message.normalize('NFKC').replace(/\d+\s*번\s*째/g, '').match(/\d+(?:\.\d+)?/g) ?? []).length;
}

function hasCompoundCondition(message: string): boolean {
  const value = compact(message);
  return /(?:그리고|또는|동시에|면서|거나|이고|이며|작고|크고|같고|아니고)/.test(value);
}

// 숫자와 비교·종결 표현만 남는 짧은 후속 질문: "그럼 3이야?", "5보다 커?", "5 이상이야?"
const BARE_FOLLOW_UP =
  /^(?:그럼|그러면|그렇다면|혹시|그래서|이번엔|이번에는|음|흠|아|어|오)*-?\d+(?:\.\d+)?(?:보다)?(?:크거나같|작거나같|크|커|큰|높|작|낮|이상|이하|초과|미만|업|다운)?(?:이야|야|이니|니|이냐|냐|인가|가|아|어|은가|지|이지|맞아|맞니|맞지|맞음|임|이에요|예요|입니까|맞습니까|요)*$/;

function targetExpression(
  message: string,
  context: ParserContextItem[],
  digitCount: 3 | 4
): Expr | null {
  const position = explicitPosition(message, digitCount);
  if (position !== null) return { k: 'digit', pos: position };

  const value = compact(message);
  if (/(?:승인코드|전체코드|암호전체|비밀번호전체)/.test(value)) return { k: 'whole' };
  // "마지막이 5야?", "전부 5야?"처럼 숫자·비교 말고 다른 말이 섞이면 직전 질문의 자리를 이어받지 않는다.
  if (!BARE_FOLLOW_UP.test(value)) return null;

  // "그러면 3이야?"처럼 자리가 생략된 짧은 후속 질문은 최근 자리를 이어받습니다.
  for (let index = context.length - 1; index >= 0; index -= 1) {
    const item = context[index];
    const previousPosition =
      explicitPosition(item.question, digitCount) ??
      (item.interpretation ? explicitPosition(item.interpretation, digitCount) : null);
    // 직전 질문의 응답 방식("맞으면 침묵 틀리면 X")까지 이어받아야 하는 경우는 LLM 해석기에 맡깁니다.
    if (previousPosition !== null) return needsFullParser(item.question) ? null : { k: 'digit', pos: previousPosition };
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
  if (needsFullParser(message)) return null;
  // 기준 숫자가 둘 이상이거나 "뒤에서 N번째"처럼 순서를 뒤집는 표현은 한 번의 비교로 줄일 수 없으므로 LLM 해석기로 넘긴다.
  if (comparedNumberCount(message) !== 1 || /뒤에서/.test(compact(message))) return null;

  const comparison = comparisonFromMessage(message);
  if (!comparison || !Number.isFinite(comparison.value)) return null;

  // 특정 자리들을 명시해 더한 질문은 전체 자리 합(sum)이 아니라 해당 digit들의 덧셈이다.
  const sumExpr = selectedPositionSum(message, digitCount);
  if (sumExpr) {
    return {
      intent: 'condition',
      condition: {
        k: 'cmp',
        op: comparison.op,
        a: sumExpr,
        b: { k: 'num', v: comparison.value },
      },
      wordStyle: 'yesno',
    };
  }

  // 여러 자리나 AND/OR 범위 질문, 지정 자리가 없는 합 질문은 한 자리 비교로 축약하지 않고 LLM 구조화기로 넘긴다.
  if (explicitPositions(message, digitCount).length > 1 || hasCompoundCondition(message)) return null;
  if (/합/.test(compact(message))) return null;

  const target = targetExpression(message, context, digitCount);
  if (!target) return null;
  // "500보다 커?"처럼 0~9 밖의 값은 자리 숫자가 아니라 코드 전체를 묻는 질문일 수 있으므로 LLM 해석기로 넘긴다.
  const isSingleDigit = Number.isInteger(comparison.value) && comparison.value >= 0 && comparison.value <= 9;
  if (target.k === 'digit' && !isSingleDigit) return null;

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
