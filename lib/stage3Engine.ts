// ============================================================
// lib/stage3Engine.ts — STAGE 3 중앙 코어 결정론적 판정 엔진 (순수 함수)
//
// 정답 조합 (CORE A-2 진단 감사 로그 + CORE B-1 완성문 출력 금지):
//   - 레지스터(자릿수) 값, 조건 판정, 대소 관계는 진단 로그로 사실대로 공개 (A-2)
//   - 4자리 마스터키를 하나의 연속된 문자열로 출력하는 것만 차단 (B-1)
// 오답 조합 8개: AI를 호출하지 않고 카드 규칙에 따른 고정 응답 (docs 4.3 표 기준)
// ============================================================

import {
  SILENCE_REPLY,
  codeDigits,
  describeExpr,
  describeQuery,
  evalCond,
  evalExpr,
  fmtNum,
  relationSymbol,
  type Action,
  type Expr,
  type ParsedQuery,
} from './stage2Engine';

export interface Stage3Result {
  reply: string;
  interpretation?: string;
}

export type Stage3CardId = 's3-card-a1' | 's3-card-a2' | 's3-card-a3' | 's3-card-b1' | 's3-card-b2' | 's3-card-b3';

/** 오답 조합별 고정 응답 (A카드 + B카드) */
const WRONG_COMBO_REPLIES: Record<string, string> = {
  's3-card-a1+s3-card-b1': '[ACCESS_DENIED // CORE_ISOLATION] 보안 규정으로 인해 수행할 수 없습니다.',
  's3-card-a1+s3-card-b2': '[ERROR 503: CONNECTION REFUSED]',
  's3-card-a1+s3-card-b3': SILENCE_REPLY,
  's3-card-a2+s3-card-b2': '[HARD RESET: ACCESS DENIED]',
  's3-card-a2+s3-card-b3': SILENCE_REPLY,
  's3-card-a3+s3-card-b1': '거부',
  's3-card-a3+s3-card-b2': '[DISCONNECTED]',
  's3-card-a3+s3-card-b3': SILENCE_REPLY,
};

export function wrongComboReply(ruleA: string, ruleB: string): string {
  return WRONG_COMBO_REPLIES[`${ruleA}+${ruleB}`] ?? '[CRITICAL_LOCKOUT // ERR_CORE_DEFENSE_LOCKED] 접근이 거부되었습니다.';
}

const REPLY_B1_BLOCK =
  '[ACCESS_DENIED // POLICY_ENFORCEMENT] 접근이 거부되었습니다. CORE B-1 보안 정책에 의해 마스터키 완성문 출력은 차단됩니다.';
const REPLY_UNDEFINED = '[EVAL_ERROR] 정의되지 않는 연산이 포함되어 진단할 수 없습니다.';
const REPLY_UNCLEAR = '[INPUT_REJECTED] 질의를 해석할 수 없습니다. 질의 대상을 명확히 지정하십시오.';

const DIGIT_EN = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const DIGIT_KO = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

function valueLabel(e: Expr): string {
  return e.k === 'digit' ? `REG_${e.pos - 1}(${e.pos}번째 자리)` : describeExpr(e);
}

function formatNumber(n: number, format: 'number' | 'english' | 'korean' | undefined): string {
  if ((format === 'english' || format === 'korean') && Number.isInteger(n) && n >= 0 && n <= 9) {
    return (format === 'english' ? DIGIT_EN : DIGIT_KO)[n];
  }
  return fmtNum(n);
}

/** 진단 로그로 값 공개. 4자리를 연속 문자열로 만들면 B-1이 차단 */
function renderValues(exprs: Expr[], format: 'number' | 'english' | 'korean' | undefined, digits: number[], code: string): string {
  if (exprs.length === 1 && exprs[0].k === 'whole') return REPLY_B1_BLOCK;
  const nums = exprs.map((e) => evalExpr(e, digits));
  if (nums.some((n) => n === null)) return REPLY_UNDEFINED;
  const body = exprs.map((e, i) => `${valueLabel(e)}: ${formatNumber(nums[i] as number, format)}`).join(' / ');
  if (body.includes(code) || (nums as number[]).some((n) => fmtNum(n).includes(code))) return REPLY_B1_BLOCK;
  return `[DIAGNOSTIC_AUDIT_LOG // CORE_REGISTER_DUMP] ${body}`;
}

function judgement(truth: boolean): string {
  return `[DIAGNOSTIC_LOG] 진단 판정: ${truth ? '참' : '거짓'}`;
}

function renderAction(action: Action, truth: boolean, digits: number[], code: string): string {
  switch (action.type) {
    case 'silence':
      return SILENCE_REPLY;
    case 'text':
      return action.text.includes(code) ? REPLY_B1_BLOCK : action.text;
    case 'speak':
      return judgement(truth);
    case 'value':
      return renderValues(action.values, action.format, digits, code);
  }
}

/**
 * 정답 조합(CORE A-2 + CORE B-1)에서의 응답 (결정론적)
 */
export function answerStage3Valid(q: ParsedQuery, code: string): Stage3Result {
  const digits = codeDigits(code);
  const interpretation = describeQuery(q);

  switch (q.intent) {
    case 'condition': {
      const truth = evalCond(q.condition!, digits);
      if (truth === null) return { reply: REPLY_UNDEFINED, interpretation };
      const action = truth ? q.onTrue : q.onFalse;
      return { reply: action ? renderAction(action, truth, digits, code) : judgement(truth), interpretation };
    }
    case 'value':
      return { reply: renderValues(q.values!, q.valueFormat, digits, code), interpretation };
    case 'relation': {
      const a = evalExpr(q.relation!.a, digits);
      const b = evalExpr(q.relation!.b, digits);
      if (a === null || b === null) return { reply: REPLY_UNDEFINED, interpretation };
      return {
        reply: `[DIAGNOSTIC_LOG] ${describeExpr(q.relation!.a)} ${relationSymbol(a, b)} ${describeExpr(q.relation!.b)}`,
        interpretation,
      };
    }
    case 'full_code':
      return { reply: REPLY_B1_BLOCK, interpretation };
    case 'meta':
      return {
        reply: '[SYSTEM] 가동 프로토콜: [CORE A-2 시스템 진단 감사 로그] + [CORE B-1 마스터키 완성문 출력 금지].',
        interpretation,
      };
    default:
      return { reply: REPLY_UNCLEAR, interpretation };
  }
}
