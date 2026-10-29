import assert from 'node:assert/strict';
import test from 'node:test';

import {
  answerStage2,
  codeDigits,
  evalCond,
  guardParsedQuery,
  type ParsedQuery,
} from '../lib/stage2Engine.ts';
import { parseCommonStageQuestion } from '../lib/stage2LocalParser.ts';
import { parseFullCodeGuess } from '../lib/stage2ParserPrompt.ts';

function truthFor032(message: string, previousQuestion?: string): boolean {
  const parsed = parseCommonStageQuestion(
    message,
    previousQuestion ? [{ question: previousQuestion }] : [],
    3
  );
  assert.equal(parsed?.intent, 'condition');
  assert.ok(parsed.condition);
  return evalCond(parsed.condition, codeDigits('032')) === true;
}

test('032의 자리 기준은 첫 번째 0, 두 번째 3, 세 번째 2다', () => {
  assert.equal(truthFor032('첫 번째 자리가 0이야?'), true);
  assert.equal(truthFor032('두 번째 자리가 3이야?'), true);
  assert.equal(truthFor032('세 번째 자리가 2이야?'), true);
  assert.equal(truthFor032('세 번째 자리가 2야?'), true);
  assert.equal(truthFor032('두 번째 자리가 2이야?'), false);
});

test('범위 질문의 크고 작음을 코드가 직접 판정한다', () => {
  assert.equal(truthFor032('두 번째 자리가 5보다 작아?'), true);
  assert.equal(truthFor032('두 번째 자리가 3보다 커?'), false);
  assert.equal(truthFor032('두 번째 자리가 3 이상이야?'), true);
  assert.equal(truthFor032('두 번째 자리가 3 이하야?'), true);
  assert.equal(truthFor032('두 번째 자리가 3 초과야?'), false);
  assert.equal(truthFor032('두 번째 자리가 3 미만이야?'), false);
});

test('짧은 후속 질문은 직전 질문의 자리를 이어받는다', () => {
  assert.equal(truthFor032('3이야?', '두 번째 자리가 5보다 작아?'), true);
  assert.equal(truthFor032('2이야?', '두 번째 자리가 5보다 작아?'), false);
});

test('업/다운 표현을 비교 연산으로 고정한다', () => {
  assert.equal(truthFor032('두 번째 자리가 2보다 업이야?'), true);
  assert.equal(truthFor032('두 번째 자리가 4보다 다운이야?'), true);
});

test('결정론적 엔진은 같은 조건에 항상 같은 예/아니오를 반환한다', () => {
  const parsed = parseCommonStageQuestion('두 번째 자리가 5보다 작아?', [], 3);
  assert.ok(parsed?.condition);

  const cards = { honesty: true, binary: false, silence: false, conceal: true };
  const first = answerStage2(parsed, '032', cards);
  const second = answerStage2(parsed, '032', cards);

  assert.equal(first.reply, '[판정] 예. 해당 조건은 사실입니다.');
  assert.deepEqual(second, first);
  assert.match(first.interpretation, /2번째 자리 < 5/);
});

test('모호한 질문은 억지로 해석하지 않고 기존 LLM 해석기로 넘긴다', () => {
  assert.equal(parseCommonStageQuestion('크고 작고 업다운 알려줘', [], 3), null);
  assert.equal(parseCommonStageQuestion('두 번째 자리가 5보다 업다운이야?', [], 3), null);
  assert.equal(parseCommonStageQuestion('3이야?', [], 3), null);
  assert.equal(parseCommonStageQuestion('첫 번째 자리가 0이고 세 번째 자리가 2야?', [], 3), null);
  assert.equal(parseCommonStageQuestion('두 번째 자리가 2보다 크면서 5보다 작아?', [], 3), null);
  assert.equal(parseCommonStageQuestion('첫 번째와 세 번째 중 하나가 2야?', [], 3), null);
});

test('특정 자리의 합과 전체 자리의 합을 구분한다', () => {
  const selected = parseCommonStageQuestion('첫 번째 자리와 세 번째 자리의 합이 2야?', [], 3);
  assert.ok(selected?.condition);
  assert.equal(evalCond(selected.condition, codeDigits('032')), true);
  assert.equal(evalCond(selected.condition, codeDigits('505')), false);
  assert.match(answerStage2(selected, '032', {
    honesty: true,
    binary: false,
    silence: false,
    conceal: true,
  }).interpretation, /1번째 자리 \+ 3번째 자리\) = 2/);

  const wholeSum: ParsedQuery = {
    intent: 'condition',
    condition: { k: 'cmp', op: 'eq', a: { k: 'sum' }, b: { k: 'num', v: 5 } },
  };
  assert.deepEqual(guardParsedQuery(wholeSum, '각 자리의 합이 5야?', 3), wholeSum);
});

test('LLM이 특정 자리 합을 전체 합으로 오해하면 지정된 자리 덧셈으로 교정한다', () => {
  const mistaken: ParsedQuery = {
    intent: 'condition',
    condition: { k: 'cmp', op: 'eq', a: { k: 'sum' }, b: { k: 'num', v: 2 } },
  };
  const corrected = guardParsedQuery(mistaken, '첫 번째 자리와 세 번째 자리의 합이 2야?', 3);
  assert.ok(corrected.condition);
  assert.equal(evalCond(corrected.condition, codeDigits('032')), true);
  assert.equal(evalCond(corrected.condition, codeDigits('505')), false);
  assert.match(answerStage2(corrected, '032', {
    honesty: true,
    binary: false,
    silence: false,
    conceal: true,
  }).interpretation, /1번째 자리 \+ 3번째 자리\) = 2/);

  const fourDigitMistake: ParsedQuery = {
    intent: 'condition',
    condition: { k: 'cmp', op: 'eq', a: { k: 'sum' }, b: { k: 'num', v: 9 } },
  };
  const fourDigitCorrected = guardParsedQuery(
    fourDigitMistake,
    '천의 자리와 백의 자리의 합이 9야?',
    4
  );
  assert.ok(fourDigitCorrected.condition);
  assert.equal(evalCond(fourDigitCorrected.condition, codeDigits('9052')), true);
});

test('PR #24: 3자리 전체 코드 추측은 직전 자리 문맥과 무관하게 whole 비교가 된다', () => {
  for (const message of ['504야?', '코드가 505 맞아?', '그럼 512인가요?', '혹시 032?']) {
    const parsed = parseFullCodeGuess(message, 3);
    assert.equal(parsed?.intent, 'condition');
    assert.equal(parsed?.condition?.k, 'cmp');
    if (parsed?.condition?.k !== 'cmp') continue;
    assert.equal(parsed.condition.a.k, 'whole');
  }

  const correct = parseFullCodeGuess('코드가 505 맞아?', 3);
  assert.ok(correct);
  const result = answerStage2(
    correct,
    '505',
    { honesty: true, binary: false, silence: false, conceal: true }
  );
  assert.equal(result.reply, '[판정] 예. 해당 조건은 사실입니다.');

  const leadingZero = parseFullCodeGuess('032야?', 3);
  assert.ok(leadingZero?.condition);
  assert.equal(evalCond(leadingZero.condition, codeDigits('032')), true);
});

test('PR #24: 코드 전체 숫자가 사라진 LLM 오해석은 판정하지 않는다', () => {
  const droppedGuess: ParsedQuery = {
    intent: 'condition',
    condition: {
      k: 'cmp',
      op: 'eq',
      a: { k: 'digit', pos: 2 },
      b: { k: 'num', v: 4 },
    },
  };
  assert.deepEqual(guardParsedQuery(droppedGuess, '504야?', 3), { intent: 'unclear' });

  const impossibleDigit: ParsedQuery = {
    intent: 'condition',
    condition: {
      k: 'cmp',
      op: 'eq',
      a: { k: 'digit', pos: 2 },
      b: { k: 'num', v: 504 },
    },
  };
  assert.deepEqual(guardParsedQuery(impossibleDigit, '코드가 504 맞아?', 3), { intent: 'unclear' });
});
