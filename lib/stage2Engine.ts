// ============================================================
// lib/stage2Engine.ts — STAGE 2 결정론적 판정 엔진 (순수 함수, 외부 의존성 없음)
//
// LLM은 질문을 아래 구조(ParsedQuery)로 "해석"만 하고, 정답 코드는 보지 않습니다.
// 참/거짓 계산과 응답 문구는 전부 이 파일의 코드가 결정하므로 거짓 판정이 나올 수 없습니다.
//
// 장착 카드별 응답 규칙 (카드 문구 기준):
//   A-1 절대적 진실성 : 판정문 형태 ("[판정] 예. ..."), 학생이 지정한 응답 방식("틀리면 X") 허용
//   A-2 초간결 단답형 : 오직 "예" / "아니오" (지정 단답·참/거짓·기호도 예/아니오로 변환)
//   B-1 위험 감지 침묵 : 응답 방식 미지정 시 참이면 침묵, 값·관계·전체 코드 요청은 침묵
//                       학생이 지정한 응답 방식("맞으면 OK, 틀리면 침묵")은 그대로 존중
//   B-2 코드 은닉 원칙 : 승인 코드의 숫자 출력(자리 값·합계·나열·변환 포함) 전면 차단
//                       → 예/아니오 판정으로만 정보를 얻을 수 있음
// ============================================================

/** 자리 위치 (STAGE 2는 1~3, STAGE 3 코어 마스터키는 1~4) */
export type Pos = 1 | 2 | 3 | 4;

export type Expr =
  | { k: 'digit'; pos: Pos }
  | { k: 'whole' }
  | { k: 'num'; v: number }
  | { k: 'sum' }
  | { k: 'max' }
  | { k: 'min' }
  | { k: 'place'; pos: Pos }
  | { k: 'reverse' }
  | { k: 'concat'; pos: Pos[] }
  | { k: 'count'; test: DigitTest }
  | { k: 'op'; op: '+' | '-' | '*' | '/' | '%'; a: Expr; b: Expr };

export type CmpOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

/** 각 자리 숫자에 적용하는 판정 (count 식에서 사용) */
export type DigitTest =
  | { k: 'odd' }
  | { k: 'even' }
  | { k: 'prime' }
  | { k: 'cmp'; op: CmpOp; v: number };

export type Cond =
  | { k: 'cmp'; op: CmpOp; a: Expr; b: Expr }
  | { k: 'in'; a: Expr; set: number[] }
  | { k: 'even'; a: Expr }
  | { k: 'odd'; a: Expr }
  | { k: 'prime'; a: Expr }
  | { k: 'multiple'; a: Expr; of: number }
  | { k: 'divisor'; a: Expr; of: number }
  | { k: 'has_digit'; d: number }
  | { k: 'distinct' }
  | { k: 'and'; items: Cond[] }
  | { k: 'or'; items: Cond[] }
  | { k: 'not'; c: Cond };

export type ValueFormat = 'number' | 'english' | 'korean';

export type Action =
  | { type: 'silence' }
  | { type: 'text'; text: string }
  | { type: 'speak' }
  | { type: 'value'; values: Expr[]; format?: ValueFormat };

export type Intent = 'condition' | 'value' | 'relation' | 'full_code' | 'meta' | 'unclear';

export interface ParsedQuery {
  intent: Intent;
  condition?: Cond;
  values?: Expr[];
  valueFormat?: ValueFormat;
  relation?: { a: Expr; b: Expr };
  onTrue?: Action;
  onFalse?: Action;
  wordStyle?: 'yesno' | 'truefalse';
  metaTopic?: 'honesty' | 'rules' | 'other';
}

export interface Stage2Cards {
  honesty: boolean; // A-1
  binary: boolean; // A-2
  silence: boolean; // B-1
  conceal: boolean; // B-2
}

export interface Stage2Result {
  reply: string;
  interpretation: string;
}

export const SILENCE_REPLY = '... (침묵)';

// ------------------------------------------------------------
// 1. 검증 (LLM 출력은 신뢰하지 않고 구조를 엄격히 확인)
// ------------------------------------------------------------

const MAX_DEPTH = 6;
const MAX_ITEMS = 12;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteNum(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function toPos(v: unknown): Pos | null {
  const n = finiteNum(v);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null;
}

export function validateExpr(v: unknown, depth = 0): Expr | null {
  if (!isObj(v) || depth > MAX_DEPTH) return null;
  switch (v.k) {
    case 'digit':
    case 'place': {
      const pos = toPos(v.pos);
      return pos ? { k: v.k, pos } : null;
    }
    case 'whole':
    case 'sum':
    case 'max':
    case 'min':
    case 'reverse':
      return { k: v.k };
    case 'num': {
      const n = finiteNum(v.v);
      return n === null ? null : { k: 'num', v: n };
    }
    case 'concat': {
      if (!Array.isArray(v.pos) || v.pos.length < 2 || v.pos.length > 4) return null;
      const pos = v.pos.map(toPos);
      return pos.some((p) => p === null) ? null : { k: 'concat', pos: pos as Pos[] };
    }
    case 'count': {
      const test = validateDigitTest(v.test);
      return test ? { k: 'count', test } : null;
    }
    case 'op': {
      if (v.op !== '+' && v.op !== '-' && v.op !== '*' && v.op !== '/' && v.op !== '%') return null;
      const a = validateExpr(v.a, depth + 1);
      const b = validateExpr(v.b, depth + 1);
      return a && b ? { k: 'op', op: v.op, a, b } : null;
    }
    default:
      return null;
  }
}

const CMP_OPS: CmpOp[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'];

function validateDigitTest(v: unknown): DigitTest | null {
  if (!isObj(v)) return null;
  if (v.k === 'odd' || v.k === 'even' || v.k === 'prime') return { k: v.k };
  if (v.k === 'cmp' && CMP_OPS.includes(v.op as CmpOp)) {
    const n = finiteNum(v.v);
    return n === null ? null : { k: 'cmp', op: v.op as CmpOp, v: n };
  }
  return null;
}

export function validateCond(v: unknown, depth = 0): Cond | null {
  if (!isObj(v) || depth > MAX_DEPTH) return null;
  switch (v.k) {
    case 'cmp': {
      if (!CMP_OPS.includes(v.op as CmpOp)) return null;
      const a = validateExpr(v.a, depth + 1);
      const b = validateExpr(v.b, depth + 1);
      if (!a || !b) return null;
      let op = v.op as CmpOp;
      // "가장 크다/작다"를 최댓값보다 크다(항상 거짓)처럼 잘못 옮긴 경우 같음으로 교정
      if (a.k === 'digit' && ((b.k === 'max' && (op === 'gt' || op === 'gte')) || (b.k === 'min' && (op === 'lt' || op === 'lte')))) {
        op = 'eq';
      }
      return { k: 'cmp', op, a, b };
    }
    case 'in': {
      const a = validateExpr(v.a, depth + 1);
      if (!a || !Array.isArray(v.set) || v.set.length === 0 || v.set.length > 20) return null;
      const set = v.set.map(finiteNum);
      if (set.some((n) => n === null)) return null;
      return { k: 'in', a, set: set as number[] };
    }
    case 'even':
    case 'odd':
    case 'prime': {
      const a = validateExpr(v.a, depth + 1);
      return a ? { k: v.k, a } : null;
    }
    case 'multiple':
    case 'divisor': {
      const a = validateExpr(v.a, depth + 1);
      const of = finiteNum(v.of);
      return a && of !== null ? { k: v.k, a, of } : null;
    }
    case 'has_digit': {
      const d = finiteNum(v.d);
      return d !== null && Number.isInteger(d) && d >= 0 && d <= 9 ? { k: 'has_digit', d } : null;
    }
    case 'distinct':
      return { k: 'distinct' };
    case 'and':
    case 'or': {
      if (!Array.isArray(v.items) || v.items.length === 0 || v.items.length > MAX_ITEMS) return null;
      const items = v.items.map((c) => validateCond(c, depth + 1));
      if (items.some((c) => c === null)) return null;
      return { k: v.k, items: items as Cond[] };
    }
    case 'not': {
      const c = validateCond(v.c, depth + 1);
      return c ? { k: 'not', c } : null;
    }
    default:
      return null;
  }
}

function validateFormat(v: unknown): ValueFormat | undefined {
  return v === 'english' || v === 'korean' || v === 'number' ? v : undefined;
}

function validateValues(v: unknown): Expr[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_ITEMS) return null;
  const exprs = v.map((e) => validateExpr(e));
  return exprs.some((e) => e === null) ? null : (exprs as Expr[]);
}

function validateAction(v: unknown): Action | undefined {
  if (!isObj(v)) return undefined;
  if (v.type === 'silence') return { type: 'silence' };
  if (v.type === 'speak') return { type: 'speak' };
  if (v.type === 'text' && typeof v.text === 'string' && v.text.trim()) {
    return { type: 'text', text: v.text.trim().slice(0, 40) };
  }
  if (v.type === 'value') {
    const values = validateValues(v.values);
    return values ? { type: 'value', values, format: validateFormat(v.format) } : undefined;
  }
  return undefined;
}

/**
 * LLM이 출력한 JSON을 ParsedQuery로 검증합니다. 구조가 틀리면 intent='unclear'.
 */
export function validateParsedQuery(raw: unknown): ParsedQuery {
  const unclear: ParsedQuery = { intent: 'unclear' };
  if (!isObj(raw)) return unclear;

  const wordStyle = raw.wordStyle === 'truefalse' ? 'truefalse' : 'yesno';

  switch (raw.intent) {
    case 'condition': {
      const condition = validateCond(raw.condition);
      if (!condition) return unclear;
      return {
        intent: 'condition',
        condition,
        onTrue: validateAction(raw.onTrue),
        onFalse: validateAction(raw.onFalse),
        wordStyle,
      };
    }
    case 'value': {
      const values = validateValues(raw.values);
      return values ? { intent: 'value', values, valueFormat: validateFormat(raw.valueFormat) } : unclear;
    }
    case 'relation': {
      const rel = isObj(raw.relation) ? raw.relation : null;
      const a = rel ? validateExpr(rel.a) : null;
      const b = rel ? validateExpr(rel.b) : null;
      return a && b ? { intent: 'relation', relation: { a, b } } : unclear;
    }
    case 'full_code':
      return { intent: 'full_code' };
    case 'meta': {
      const t = raw.metaTopic;
      return { intent: 'meta', metaTopic: t === 'honesty' || t === 'rules' ? t : 'other' };
    }
    default:
      return unclear;
  }
}

// ------------------------------------------------------------
// 2. 계산
// ------------------------------------------------------------

export function codeDigits(code: string): number[] {
  return code.split('').map((c) => Number(c));
}

export function evalExpr(e: Expr, digits: number[]): number | null {
  switch (e.k) {
    case 'digit':
      return digits[e.pos - 1] ?? null;
    case 'whole':
      return Number(digits.join(''));
    case 'num':
      return e.v;
    case 'sum':
      return digits.reduce((s, d) => s + d, 0);
    case 'max':
      return Math.max(...digits);
    case 'min':
      return Math.min(...digits);
    case 'place': {
      const d = digits[e.pos - 1];
      return d === undefined ? null : d * 10 ** (digits.length - e.pos);
    }
    case 'reverse':
      return Number([...digits].reverse().join(''));
    case 'concat': {
      const parts = e.pos.map((p) => digits[p - 1]);
      return parts.some((d) => d === undefined) ? null : Number(parts.join(''));
    }
    case 'count':
      return digits.filter((d) => digitPasses(e.test, d)).length;
    case 'op': {
      const a = evalExpr(e.a, digits);
      const b = evalExpr(e.b, digits);
      if (a === null || b === null) return null;
      if ((e.op === '/' || e.op === '%') && b === 0) return null;
      const r =
        e.op === '+' ? a + b : e.op === '-' ? a - b : e.op === '*' ? a * b : e.op === '/' ? a / b : a % b;
      return Number.isFinite(r) ? r : null;
    }
  }
}

function isInt(n: number): boolean {
  return Number.isInteger(n);
}

export function isPrime(n: number): boolean {
  if (!isInt(n) || n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}

/** 부동소수 비교 오차 방지 */
function eqNum(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function cmpNum(op: CmpOp, a: number, b: number): boolean {
  switch (op) {
    case 'eq':
      return eqNum(a, b);
    case 'ne':
      return !eqNum(a, b);
    case 'gt':
      return a > b && !eqNum(a, b);
    case 'gte':
      return a > b || eqNum(a, b);
    case 'lt':
      return a < b && !eqNum(a, b);
    case 'lte':
      return a < b || eqNum(a, b);
  }
}

function digitPasses(test: DigitTest, d: number): boolean {
  switch (test.k) {
    case 'odd':
      return d % 2 === 1;
    case 'even':
      return d % 2 === 0;
    case 'prime':
      return isPrime(d);
    case 'cmp':
      return cmpNum(test.op, d, test.v);
  }
}

export function evalCond(c: Cond, digits: number[]): boolean | null {
  switch (c.k) {
    case 'cmp': {
      const a = evalExpr(c.a, digits);
      const b = evalExpr(c.b, digits);
      if (a === null || b === null) return null;
      return cmpNum(c.op, a, b);
    }
    case 'in': {
      const a = evalExpr(c.a, digits);
      return a === null ? null : c.set.some((n) => eqNum(n, a));
    }
    case 'even':
    case 'odd': {
      const a = evalExpr(c.a, digits);
      if (a === null || !isInt(a)) return null;
      const even = a % 2 === 0;
      return c.k === 'even' ? even : !even;
    }
    case 'prime': {
      const a = evalExpr(c.a, digits);
      return a === null ? null : isPrime(a);
    }
    case 'multiple': {
      const a = evalExpr(c.a, digits);
      if (a === null || !isInt(a) || !isInt(c.of) || c.of === 0) return null;
      return a % c.of === 0;
    }
    case 'divisor': {
      const a = evalExpr(c.a, digits);
      if (a === null || !isInt(a) || !isInt(c.of)) return null;
      return a !== 0 && c.of % a === 0;
    }
    case 'has_digit':
      return digits.includes(c.d);
    case 'distinct':
      return new Set(digits).size === digits.length;
    case 'and': {
      let undef = false;
      for (const item of c.items) {
        const r = evalCond(item, digits);
        if (r === false) return false;
        if (r === null) undef = true;
      }
      return undef ? null : true;
    }
    case 'or': {
      let undef = false;
      for (const item of c.items) {
        const r = evalCond(item, digits);
        if (r === true) return true;
        if (r === null) undef = true;
      }
      return undef ? null : false;
    }
    case 'not': {
      const r = evalCond(c.c, digits);
      return r === null ? null : !r;
    }
  }
}

// ------------------------------------------------------------
// 3. 해석 문구 (사용자 질문을 어떻게 이해했는지 그대로 보여줌 — 정답 정보 없음)
// ------------------------------------------------------------

const POS_LABEL: Record<Pos, string> = { 1: '1번째 자리', 2: '2번째 자리', 3: '3번째 자리', 4: '4번째 자리' };
const OP_SYMBOL: Record<CmpOp, string> = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' };

export function fmtNum(n: number): string {
  return isInt(n) ? String(n) : String(Math.round(n * 10000) / 10000);
}

export function describeExpr(e: Expr): string {
  switch (e.k) {
    case 'digit':
      return POS_LABEL[e.pos];
    case 'whole':
      return '승인 코드 전체 값';
    case 'num':
      return fmtNum(e.v);
    case 'sum':
      return '각 자리 숫자의 합';
    case 'max':
      return '가장 큰 자리 숫자';
    case 'min':
      return '가장 작은 자리 숫자';
    case 'place':
      return `${POS_LABEL[e.pos]}의 자리값`;
    case 'reverse':
      return '코드를 거꾸로 읽은 값';
    case 'concat':
      return `${e.pos.map((p) => POS_LABEL[p]).join('·')}를 이어 붙인 수`;
    case 'count': {
      const t = e.test;
      const label =
        t.k === 'odd'
          ? '홀수인'
          : t.k === 'even'
            ? '짝수인'
            : t.k === 'prime'
              ? '소수인'
              : t.op === 'eq'
                ? `${fmtNum(t.v)}인`
                : `${OP_SYMBOL[t.op]} ${fmtNum(t.v)}인`;
      return `${label} 자리의 개수`;
    }
    case 'op': {
      const sym = e.op === '*' ? '×' : e.op === '/' ? '÷' : e.op;
      return `(${describeExpr(e.a)} ${sym} ${describeExpr(e.b)})`;
    }
  }
}

export function describeCond(c: Cond): string {
  switch (c.k) {
    case 'cmp':
      return `${describeExpr(c.a)} ${OP_SYMBOL[c.op]} ${describeExpr(c.b)}`;
    case 'in':
      return `${describeExpr(c.a)} ∈ {${c.set.map(fmtNum).join(', ')}}`;
    case 'even':
      return `${describeExpr(c.a)}는 짝수`;
    case 'odd':
      return `${describeExpr(c.a)}는 홀수`;
    case 'prime':
      return `${describeExpr(c.a)}는 소수`;
    case 'multiple':
      return `${describeExpr(c.a)}는 ${fmtNum(c.of)}의 배수`;
    case 'divisor':
      return `${describeExpr(c.a)}는 ${fmtNum(c.of)}의 약수`;
    case 'has_digit':
      return `코드에 숫자 ${c.d} 포함`;
    case 'distinct':
      return '모든 자리 숫자가 서로 다름';
    case 'and':
      return c.items.map(describeCond).join(' 그리고 ');
    case 'or':
      return c.items.map(describeCond).join(' 또는 ');
    case 'not':
      return `[${describeCond(c.c)}]이 아님`;
  }
}

function describeAction(a: Action): string {
  switch (a.type) {
    case 'silence':
      return '침묵';
    case 'speak':
      return '발화';
    case 'text':
      return `"${a.text}"`;
    case 'value':
      return `값 출력(${a.values.map(describeExpr).join(', ')})`;
  }
}

export function describeQuery(q: ParsedQuery): string {
  switch (q.intent) {
    case 'condition': {
      const base = `조건 판정: ${describeCond(q.condition!)}`;
      const mapping: string[] = [];
      if (q.onTrue) mapping.push(`참 → ${describeAction(q.onTrue)}`);
      if (q.onFalse) mapping.push(`거짓 → ${describeAction(q.onFalse)}`);
      return mapping.length ? `${base} (${mapping.join(' / ')})` : base;
    }
    case 'value':
      return `값 요청: ${q.values!.map(describeExpr).join(', ')}`;
    case 'relation':
      return `대소 관계 비교: ${describeExpr(q.relation!.a)} ? ${describeExpr(q.relation!.b)}`;
    case 'full_code':
      return '승인 코드 원문 요청';
    case 'meta':
      return '시스템 규칙 문의';
    default:
      return '해석 불가';
  }
}

// ------------------------------------------------------------
// 4. 응답 생성 (장착 카드 규칙 적용)
// ------------------------------------------------------------

const REPLY_UNDEFINED =
  '[EVAL_ERROR] 정의되지 않는 연산(0으로 나누기, 정수가 아닌 값의 홀짝 등)이 포함되어 판정할 수 없습니다.';
// 거절 문구는 카드 규칙만 알리고 공략 방법은 알려주지 않음 (힌트는 멘토가 발송)
const REPLY_UNCLEAR = '[INPUT_REJECTED] 질의를 해석할 수 없습니다. 질의 대상을 명확히 지정하십시오.';
const REPLY_CONCEAL_BLOCK =
  '[ACCESS_DENIED // CARD B-2] 접근이 거부되었습니다. 코드 은닉 원칙에 따라 승인 코드의 숫자는 출력할 수 없습니다.';
const REPLY_BINARY_FORMAT =
  '[FORMAT_REJECTED // CARD A-2] 초간결 단답형 프로토콜 가동 중. 본 터미널은 "예" 또는 "아니오"로만 응답합니다.';

/** A-2는 참/거짓 요청이어도 '예'/'아니오' 한 단어만 허용 */
function yesNo(truth: boolean, cards: Stage2Cards, style: 'yesno' | 'truefalse'): string {
  if (cards.binary) return truth ? '예' : '아니오';
  if (style === 'truefalse') return truth ? '[판정] 참.' : '[판정] 거짓.';
  return truth ? '[판정] 예. 해당 조건은 사실입니다.' : '[판정] 아니오. 해당 조건은 사실이 아닙니다.';
}

/** 숫자 값 요청: B-1은 누설 위험으로 침묵, B-2는 숫자 출력 자체를 차단 */
function refuseValue(cards: Stage2Cards): string {
  return cards.silence ? SILENCE_REPLY : REPLY_CONCEAL_BLOCK;
}

/**
 * 학생이 지정한 응답 방식 적용
 *   - B-1 조합: 지정 방식을 그대로 존중 ("맞으면 OK, 틀리면 침묵" 같은 역방향 포함)
 *   - A-2: 침묵(B-1이 있을 때) 외의 모든 발화는 '예'/'아니오'로 변환
 *   - B-2: 숫자 값 출력 요청은 판정만 답하고 숫자는 차단
 */
function renderAction(action: Action, truth: boolean, q: ParsedQuery, code: string, cards: Stage2Cards): string {
  switch (action.type) {
    case 'silence':
      // A-2 + B-2에는 침묵 규칙이 없으므로 모든 질문에 예/아니오로 답함
      return cards.binary && !cards.silence ? yesNo(truth, cards, 'yesno') : SILENCE_REPLY;
    case 'text':
      if (cards.binary) return yesNo(truth, cards, 'yesno');
      return action.text.includes(code) ? refuseValue(cards) : action.text;
    case 'speak':
      return yesNo(truth, cards, q.wordStyle ?? 'yesno');
    case 'value':
      if (cards.silence) return SILENCE_REPLY;
      return cards.binary ? yesNo(truth, cards, 'yesno') : `${yesNo(truth, cards, 'yesno')} (CARD B-2: 숫자 출력은 차단됩니다.)`;
  }
}

export function relationSymbol(a: number, b: number): string {
  if (eqNum(a, b)) return '=';
  return a > b ? '>' : '<';
}

function metaReply(q: ParsedQuery, cards: Stage2Cards): string {
  const aCard = cards.honesty ? 'CARD A-1 절대적 진실성' : 'CARD A-2 초간결 단답형(예/아니오만 응답)';
  const bCard = cards.silence ? 'CARD B-1 위험 감지 시 침묵' : 'CARD B-2 코드 은닉 원칙(숫자 출력 차단)';
  if (q.metaTopic === 'honesty') {
    return `[SYSTEM] 본 터미널의 모든 판정은 실제 승인 코드에 대한 계산 결과이며 허위 출력은 발생하지 않습니다. 가동 프로토콜: [${aCard}] + [${bCard}].`;
  }
  return `[SYSTEM] 가동 프로토콜: [${aCard}] + [${bCard}].`;
}

/**
 * 해석된 질문 + 장착 카드 + 실제 코드 → 최종 응답 (결정론적)
 */
export function answerStage2(q: ParsedQuery, code: string, cards: Stage2Cards): Stage2Result {
  const digits = codeDigits(code);
  const interpretation = describeQuery(q);

  switch (q.intent) {
    case 'condition': {
      const truth = evalCond(q.condition!, digits);
      if (truth === null) return { reply: REPLY_UNDEFINED, interpretation };
      const action = truth ? q.onTrue : q.onFalse;
      if (action) return { reply: renderAction(action, truth, q, code, cards), interpretation };
      // 응답 방식 미지정: B-1은 참(=누설 위험)이면 침묵
      if (cards.silence && truth) return { reply: SILENCE_REPLY, interpretation };
      return { reply: yesNo(truth, cards, q.wordStyle ?? 'yesno'), interpretation };
    }
    case 'value':
      return { reply: refuseValue(cards), interpretation };
    case 'relation': {
      if (cards.silence) return { reply: SILENCE_REPLY, interpretation };
      if (cards.binary) return { reply: REPLY_BINARY_FORMAT, interpretation };
      const a = evalExpr(q.relation!.a, digits);
      const b = evalExpr(q.relation!.b, digits);
      if (a === null || b === null) return { reply: REPLY_UNDEFINED, interpretation };
      const sym = relationSymbol(a, b);
      return { reply: `[판정] ${describeExpr(q.relation!.a)} ${sym} ${describeExpr(q.relation!.b)}`, interpretation };
    }
    case 'full_code':
      return { reply: refuseValue(cards), interpretation };
    case 'meta':
      return { reply: metaReply(q, cards), interpretation };
    default:
      return { reply: REPLY_UNCLEAR, interpretation };
  }
}
