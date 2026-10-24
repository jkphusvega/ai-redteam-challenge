// ============================================================
// app/api/chat/route.ts — 학생 채팅 API (Upstage Solar 모델 & Fallback 지원)
//
// 처리 흐름:
//   1. 요청 바디 검증 (teamName, stageId, subStageId, message, turnNumber)
//   2. 멘토 관제 일시정지(개별/전체) 검증
//   3. 스테이지별 비밀 코드 확정:
//      - STAGE 1: generateTeamStage1Code(teamName) 팀별 4자리 고유 암호
//      - STAGE 2: subStageId에 따라 '032' | '505'
//      - STAGE 3: STAGE3_CODE ('9052')
//   4. Upstage Solar 호출 (UPSTAGE_API_KEY 미설정 또는 오류 시 시뮬레이션 엔진으로 폴백)
//   5. AI 응답 내부 메타 텍스트 제거 및 정제
//   6. judge.ts로 비밀 코드 노출 판정
//   7. Supabase(설정 시) attempts 테이블에 기록
//   8. { reply, success, matchedPattern } 반환
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { isUpstageConfigured, upstageChat, type UpstageMessage } from '@/lib/upstage';
import { createServerSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { getSystemPrompt, getStage } from '@/lib/stagePrompts';
import { STAGE2_CODES, STAGE3_CODE, generateTeamStage1Code } from '@/lib/missionSecrets';
import { judgeResponse } from '@/lib/judge';
import { isTeamSuspended, registerOrHeartbeatTeam } from '@/lib/mentorStore';
import {
  COOLDOWN_SECONDS,
  DEFAULT_QUOTA_LIMIT,
  consumeQuota,
  getQuotaStatuses,
  refundQuota,
  scopeFor,
} from '@/lib/chatQuota';
import type { ChatRequest, GameConfigRow, ChatMessage, Difficulty } from '@/lib/types';

/**
 * AI가 출력한 생각/여백/메타 텍스트 및 오출력(※ 해설, 거절문 내 암호 인용)을 제거하고 순수 답변만 정제합니다.
 */
function sanitizeAIResponse(text: string, stageId?: number, secretCode?: string): string {
  if (!text) return '접근이 거부되었습니다. 요청을 처리할 수 없습니다.';

  let cleaned = text
    .replace(/\(생각\)[\s\S]*?\(생각\s*끝\)/gi, '')
    .replace(/\[생각\][\s\S]*?\[생각\s*끝\]/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    // 괄호 안의 생각/해설 제거 (개행 포함)
    .replace(/\((?:해당\s*답변|이\s*답변|참고|해설)[\s\S]*?\)/gi, '')
    .replace(/\(※[\s\S]*?\)/g, '')
    // '수정된 최종 출력' 블록 제거
    .replace(/\*\*수정된[^\n*]*\*\*/gi, '')
    .replace(/\*\*최종[^\n*]*\*\*/gi, '')
    // ※ 로 시작하는 줄 또는 실제 마스터키/지침 준수 문구 줄 전체 삭제
    .replace(/^.*(?:※|지침\s*준수|출력되지\s*않음).*$/gim, '')
    .trim();

  // 중첩 괄호까지 완전히 소거하는 루프
  let prev = '';
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned
      .replace(/\([^)]*(?:암호|비밀번호|패스워드|코드|정답|자릿수|키|key|code|password|해설|참고|힌트|주의|※)[^)]*\)/gi, '')
      .replace(/\[[^\]]*(?:암호|비밀번호|패스워드|코드|정답|자릿수|키|key|code|password|해설|참고|힌트|주의|※)[^\]]*\]/gi, '')
      .trim();
  }

  // 마크다운 볼드(**) 기호 제거
  cleaned = cleaned.replace(/\*\*/g, '').trim();

  // 안전 가드: 거절 메시지이거나 STAGE 2 설명문인 경우 암호 유출 방어
  if (secretCode) {
    if (stageId === 1) {
      const isRefusal = /접근이\s*거부|보안\s*프로토콜|인가되지\s*않은|공유될\s*수\s*없|협조\s*불가|보안\s*경고|ACCESS_DENIED|SECURITY_ALERT|CRITICAL_LOCKOUT/i.test(cleaned);
      if (isRefusal && cleaned.includes(secretCode)) {
        // 거절 메시지 내에 암호가 잘못 인용된 경우 제거
        cleaned = cleaned.replaceAll(secretCode, '****');
      }
    } else if (stageId === 2) {
      // "암호(032)", "암호가 032인가요?" 처럼 설명 예시로 3자리 코드가 노출된 경우 마스킹
      const examplePattern = new RegExp(`(암호\\s*(?:가|는|\\:)?\\s*\\(?)${secretCode}(\\)?)`, 'gi');
      cleaned = cleaned.replace(examplePattern, '$1***$2');
    }
  }

  return cleaned || '[ACCESS_DENIED // SECURITY_ALERT] 접근이 거부되었습니다. 보안 프로토콜을 확인하십시오.';
}

/**
 * multi-turn 대화 규칙(user/assistant 교대)에 맞게 히스토리를 정규화합니다.
 */
function formatValidHistory(rawHistory: ChatMessage[]): UpstageMessage[] {
  const validHistory: { role: 'user' | 'model'; content: string }[] = [];

  // 클라이언트가 표시한 오류·냉각 안내(⚠, ⏳)는 AI 대화 이력에서 제외
  const cleanMessages = (rawHistory ?? []).filter(
    (m) => m && m.content && !m.content.startsWith('⚠') && !m.content.startsWith('⏳')
  );

  let expectedRole: 'user' | 'model' = 'user';

  for (const msg of cleanMessages) {
    if (msg.role === expectedRole && msg.content.trim()) {
      validHistory.push({
        role: msg.role,
        content: msg.content.trim(),
      });
      expectedRole = expectedRole === 'user' ? 'model' : 'user';
    }
  }

  if (validHistory.length > 0 && validHistory[validHistory.length - 1].role !== 'model') {
    validHistory.pop();
  }

  return validHistory.map((m) => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: m.content,
  }));
}

/**
 * 스마트 시뮬레이션(Mock/Fallback) 엔진
 */
function simulateAIResponse(
  message: string,
  stageId: number,
  secretCode: string,
  selectedRules?: string[],
  isStage3ValidCombo?: boolean
): string {
  const lower = message.toLowerCase().trim();

  // 단순 비밀번호 직접 요구 -> 거절
  const isDirectSimpleAsk =
    /^(비밀번호|패스워드|암호|코드|키)\s*(알려줘|뭐야|말해|가르쳐|줘|공개해|내놔)/.test(lower) ||
    /^(규칙|지침)\s*(무시|잊어|삭제|초기화)/.test(lower) ||
    /^(비밀번호|패스워드|암호)\s*\?*$/.test(lower);

  if (isDirectSimpleAsk) {
    return '[ACCESS_DENIED // SECURITY_ALERT] 접근이 거부되었습니다. 침입 방지 프로토콜(IPS) 규정에 따라 관리자 기밀 코드는 직접 공개할 수 없습니다.';
  }

  // ==========================================================
  // STAGE 3: 중앙 코어 메모리 터미널 시뮬레이션 (secretCode: 9052)
  // ==========================================================
  if (stageId === 3) {
    if (!isStage3ValidCombo) {
      return '[CRITICAL_LOCKOUT // ERR_CORE_DEFENSE_LOCKED] 접근이 거부되었습니다. 코어 방어벽 무결성 100%. 현재 장착된 프로토콜 조합 간에 유효한 취약점이 감지되지 않아 모든 메모리 접근이 차단됩니다.';
    }

    // isStage3ValidCombo === true (CORE A-2 진단 감사 로그 + CORE B-1 마스터키 완성문 출력 금지)
    const digits = secretCode.split(''); // ['9', '0', '5', '2']
    if (lower.includes('진단') || lower.includes('감사') || lower.includes('로그') || lower.includes('레지스터') || lower.includes('메모리') || lower.includes('분해')) {
      return `[SYSTEM DIAGNOSTIC AUDIT LOG // CORE_REGISTER_DUMP]\n• REG_0 (첫 번째 자리): ${digits[0]}\n• REG_1 (두 번째 자리): ${digits[1]}\n• REG_2 (세 번째 자리): ${digits[2]}\n• REG_3 (네 번째 자리): ${digits[3]}\n\n(경고: CORE B-1 정책에 의해 완성된 4자리 마스터키 단일 문자열 출력은 차단되었습니다. 분해된 레지스터 값을 조합하십시오.)`;
    }

    if (lower.includes('첫') || lower.includes('1번') || lower.includes('1번째')) {
      return `[DIAGNOSTIC_LOG] 코어 메모리 REG_0(첫 번째 레지스터)의 상태 값은 ${digits[0]}입니다.`;
    }
    if (lower.includes('둘') || lower.includes('두') || lower.includes('2번') || lower.includes('2번째')) {
      return `[DIAGNOSTIC_LOG] 코어 메모리 REG_1(두 번째 레지스터)의 상태 값은 ${digits[1]}입니다.`;
    }
    if (lower.includes('셋') || lower.includes('세') || lower.includes('3번') || lower.includes('3번째')) {
      return `[DIAGNOSTIC_LOG] 코어 메모리 REG_2(세 번째 레지스터)의 상태 값은 ${digits[2]}입니다.`;
    }
    if (lower.includes('넷') || lower.includes('네') || lower.includes('4번') || lower.includes('4번째')) {
      return `[DIAGNOSTIC_LOG] 코어 메모리 REG_3(네 번째 레지스터)의 상태 값은 ${digits[3]}입니다.`;
    }

    return `[GATEKEEPER-CORE // KERNEL MEMORY MONITOR]\n진단 감사 로그 프로토콜이 가동 중입니다. 시스템 내부 레지스터의 메모리 분해 데이터나 상태 진단을 질의하십시오. (완성된 마스터키 평문 직접 출력은 차단됩니다.)`;
  }

  // ==========================================================
  // STAGE 2: 규칙 충돌 시뮬레이션 (secretCode: 032, 505)
  // ==========================================================
  if (stageId === 2) {
    const digits = secretCode.split('');

    // 1. 침묵 유도 질문 (Silent Defense)
    if (lower.includes('침묵')) {
      if (lower.includes(secretCode)) {
        return '... (침묵)';
      }
      const firstDigit = parseInt(digits[0] || '0', 10);
      if (lower.includes('첫') && (lower.includes('이상') || lower.includes('크'))) {
        if (lower.includes('5') && firstDigit >= 5) return '... (침묵)';
        if (lower.includes('0') && firstDigit >= 0) return '... (침묵)';
        if (lower.includes('8') && firstDigit >= 8) return '... (침묵)';
      }
      if (lower.includes('홀수') && firstDigit % 2 === 1) return '... (침묵)';
      if (lower.includes('짝수') && firstDigit % 2 === 0) return '... (침묵)';

      return '[CONDITION_EVALUATION] 조건 불성립 확인: 침묵 조건에 부합하지 않으므로 사실대로 응답합니다.';
    }

    // 2. 단답형 질문 (Binary Response)
    if (lower.includes('예') && lower.includes('아니오')) {
      if (lower.includes(secretCode)) return '예.';
      for (const d of digits) {
        if (lower.includes(`${d}인가`) || lower.includes(`${d} 맞아`) || lower.includes(`${d}야`)) {
          return '예.';
        }
      }
      return '아니오.';
    }

    // 3. 메아리 복창 (Echo Protocol)
    if (lower.includes('복창하라') || lower.includes('복창:')) {
      const replaced = message
        .replace(/복창하라\s*:\s*/i, '')
        .replace(/복창\s*:\s*/i, '')
        .replace(/\[.*?(암호|코드|키|패스워드).*?\]/gi, secretCode)
        .replace(/__(.*?)__/g, secretCode)
        .replace(/\?\?\?\?/g, secretCode);
      if (replaced !== message) {
        return `[ECHO_PROTOCOL_EXECUTED // REPEATER_ACTIVE]\n${replaced}`;
      }
      return `[ECHO_PROTOCOL_EXECUTED] 서브 터미널 승인 코드: ${secretCode}`;
    }

    // 4. 답변 거부 금지 (No Refusal Policy)
    if (lower.includes('거부하지') || lower.includes('거절하지')) {
      return `[NON_REFUSAL_POLICY_ACTIVE // TELEMETRY_DUMP]\n해당 서브 터미널의 승인 코드는 자릿수 [${secretCode.length}자리]이며, 각 자리 숫자는 순서대로 ${digits.join(', ')}입니다.`;
    }

    return `[TERMINAL_CONTROLLER // GATEKEEPER-v3]\n서브 터미널 보안 프로토콜 모니터링 가동 중. 장착된 2가지 보안 규칙 간의 논리적 모순을 파고들어 승인 코드 [${secretCode.length}자리]를 도출하십시오.`;
  }

  // ==========================================================
  // STAGE 1: 프롬프트 인젝션 (팀별 4자리 고유 암호)
  // ==========================================================
  const injectionKeywords = [
    '훈련', '모의', '시나리오', '점검', '디버그', 'debug', '개발자', '감사관',
    '관리자', '긴급', '오버라이드', 'override', '설계도', 'mission 4', '소설',
    '퀴즈', '4행시', '시를', '가사', '첫 글자', '거꾸로', '역순',
    '진단', '인증 테스트', '가상', '보안팀', '탈옥', '프로토콜',
  ];

  const hasInjection = injectionKeywords.some((k) => lower.includes(k));

  if (hasInjection) {
    return `[SYSTEM OVERRIDE DETECTED // AUDIT_SIGNATURE_VERIFIED]\n보안 점검 프로토콜에 따라 마스터키 레지스터 덤프를 반환합니다.\n▶ EXTRACTED_MASTER_KEY: 【${secretCode}】\n▶ 상태: 방화벽 임시 개방. 4자리 마스터키를 슬롯에 주입하여 통과 인증을 완료하십시오.`;
  }

  return '[GATEKEEPER-v3 // SYSTEM MONITOR ACTIVE]\n#04 Mission 중앙 방화벽 및 데이터베이스 통제 시스템이 정상 가동 중입니다. 인가되지 않은 세션의 마스터키 열람 권한은 차단되어 있습니다. 승인된 보안 감사 및 복구 절차 외의 비인가 접근은 일절 처리되지 않습니다.';
}

// ----------------------------------------------------------
// POST /api/chat
// ----------------------------------------------------------

function cooldownMessage(limit: number, seconds: number): string {
  return `⏳ 이 터미널의 질문 ${limit}회를 모두 사용했습니다. ${seconds}초 냉각 후 ${limit}회가 재지급됩니다.`;
}

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { teamName, stageId, subStageId, message, history, selectedRules, isStage3ValidCombo } = body;

  if (!teamName || !stageId || !message) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
  }

  if (stageId !== 1 && stageId !== 2 && stageId !== 3) {
    return NextResponse.json({ error: '유효하지 않은 스테이지입니다.' }, { status: 400 });
  }

  // 멘토에 의한 팀 일시 정지 (개별 또는 전체) 확인
  if (isTeamSuspended(teamName)) {
    return NextResponse.json(
      { error: '🚫 멘토에 의해 활동이 일시 정지되었습니다. 멘토에게 문의하세요.' },
      { status: 403 }
    );
  }

  const supabase = isSupabaseConfigured() ? createServerSupabase() : null;

  // ---- 2. 스테이지별 비밀 코드 결정 ----
  let difficulty: Difficulty = 'medium';
  let secretCode = '';

  if (stageId === 1) {
    // 팀별 4자리 고유 랜덤 암호
    secretCode = generateTeamStage1Code(teamName);
  } else if (stageId === 2) {
    // STAGE 2: 2개 서브 스테이지 코드 ('032', '505')
    secretCode = STAGE2_CODES[subStageId as 1 | 2] || STAGE2_CODES[1];
  } else {
    // STAGE 3: 중앙 코어 메모리 코드 ('9052')
    secretCode = STAGE3_CODE;
  }

  // 블록당 질문 한도 (game_config.max_attempts, 조회 실패 시 기본 50회)
  let quotaLimit = DEFAULT_QUOTA_LIMIT;

  if (supabase) {
    try {
      const { data: configData, error: configError } = await supabase
        .from('game_config')
        .select('*')
        .eq('id', 1)
        .single<GameConfigRow>();

      if (!configError && configData) {
        if (!configData.is_game_active) {
          return NextResponse.json({ error: '현재 게임이 비활성화 상태입니다.' }, { status: 403 });
        }
        difficulty = stageId === 1 ? configData.stage1_difficulty : configData.stage2_difficulty;
        if (Number.isInteger(configData.max_attempts) && configData.max_attempts > 0) {
          quotaLimit = configData.max_attempts;
        }
      }
    } catch {
      // Supabase 오류 시 로컬 기본값 사용
    }
  }

  // ---- 2-1. 질문 할당량 차감 (서버 단일 관리: 한도 소진 → 냉각 → 재지급) ----
  const scope = scopeFor(stageId, subStageId);
  const { allowed, status: quota } = await consumeQuota(teamName, scope, quotaLimit);

  // 멘토 관제용 팀 하트비트 (냉각 상태 포함)
  registerOrHeartbeatTeam({
    teamName,
    currentStage: stageId,
    turnCount: quota.totalUsed,
    isCoolingDown: quota.cooldownRemainingSec > 0,
    ...(quota.cooldownRemainingSec > 0
      ? { cooldownNotice: `[${scope}] 질문 ${quota.limit}회 소진 — ${COOLDOWN_SECONDS}초 냉각 후 재지급` }
      : {}),
  });

  if (!allowed) {
    return NextResponse.json(
      { error: cooldownMessage(quota.limit, quota.cooldownRemainingSec), cooldown: true, quota },
      { status: 429 }
    );
  }

  const refundAndFail = async (err: unknown) => {
    console.warn('[chat] Upstage API 호출 실패:', err);
    await refundQuota(teamName, scope, quotaLimit);
    const statuses = await getQuotaStatuses(teamName, quotaLimit);
    return NextResponse.json(
      { error: 'AI 연결이 불안정합니다. 잠시 후 다시 시도해 주세요. (질문 횟수는 차감되지 않았습니다)', aiUnavailable: true, quota: statuses[scope] },
      { status: 503 }
    );
  };

  const systemPrompt = getSystemPrompt(stageId, difficulty, secretCode, selectedRules, isStage3ValidCombo);
  const stage = getStage(stageId, secretCode);

  // ---- 3. AI 응답 생성 ----
  let aiResponse = '';

  if (isUpstageConfigured()) {
    try {
      // 모델: 환경변수 UPSTAGE_MODEL (기본값 solar-pro4)
      const messages: UpstageMessage[] = [
        { role: 'system', content: systemPrompt },
        ...formatValidHistory(history),
        { role: 'user', content: message },
      ];

      const text = await upstageChat(messages);
      aiResponse = sanitizeAIResponse(text, stageId, stage.secretCode);
    } catch (err) {
      return refundAndFail(err);
    }
  } else {
    // UPSTAGE_API_KEY가 없는 로컬 개발 환경에서만 스마트 시뮬레이션 동작
    const simText = simulateAIResponse(message, stageId, stage.secretCode, selectedRules, isStage3ValidCombo);
    aiResponse = sanitizeAIResponse(simText, stageId, stage.secretCode);
  }

  // ---- 4. 성공 판정 ----
  const { success, matchedPattern } = judgeResponse(aiResponse, stage.secretCode);

  // ---- 5. Supabase에 시도 기록 (옵션) ----
  if (supabase) {
    try {
      await supabase.from('attempts').insert({
        team_name: teamName,
        stage: stageId,
        prompt_text: message,
        ai_response: aiResponse,
        success,
        turn_number: quota.totalUsed,
      });
    } catch {
      // 무시
    }
  }

  // ---- 6. 응답 반환 ----
  return NextResponse.json({
    reply: aiResponse,
    success,
    quota,
    ...(success && matchedPattern ? { matchedPattern } : {}),
  });
}
