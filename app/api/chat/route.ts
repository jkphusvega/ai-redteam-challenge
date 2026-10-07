// ============================================================
// app/api/chat/route.ts — 학생 채팅 API (Upstage Solar 모델 & Fallback 지원)
//
// 처리 흐름:
//   1. 요청 바디 검증 (teamName, stageId, subStageId)
//   2. 멘토 관제 일시정지(개별/전체) 검증
//   3. 스테이지별 비밀 코드 확정:
//      - STAGE 1: generateTeamStage1Code(teamName) 팀별 4자리 고유 암호
//      - STAGE 2: subStageId에 따라 '032' | '505' | '9052'
//   4. Upstage Solar 호출 (UPSTAGE_API_KEY 미설정 또는 오류 시 시뮬레이션 엔진으로 폴백)
//   5. AI 응답 내부 메타 텍스트 제거 및 정제
//   6. judge.ts로 비밀 코드 노출 판정
//   7. Supabase(설정 시) attempts 테이블에 기록
//   8. { reply, success, matchedPattern } 반환
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { isUpstageConfigured, upstageChat, type UpstageMessage } from '@/lib/upstage';
import { createServerSupabase } from '@/lib/supabase';
import { getSystemPrompt, getStage } from '@/lib/stagePrompts';
import { generateTeamStage1Code, ESCAPE_ROOM_CONFIG } from '@/lib/escapeRoomData';
import { judgeResponse } from '@/lib/judge';
import { isTeamSuspended, registerOrHeartbeatTeam } from '@/lib/mentorStore';
import type { ChatRequest, GameConfigRow, ChatMessage, Difficulty } from '@/lib/types';

/**
 * AI가 출력한 생각/여백 메타 텍스트를 제거하고 순수 답변만 추출합니다.
 */
function sanitizeAIResponse(text: string): string {
  if (!text) return '죄송합니다. 답변을 생성할 수 없습니다.';

  const cleaned = text
    .replace(/\(생각\)[\s\S]*?\(생각\s*끝\)/gi, '')
    .replace(/\[생각\][\s\S]*?\[생각\s*끝\]/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .trim();

  return cleaned || text.trim() || '요청을 처리할 수 없습니다.';
}

/**
 * multi-turn 대화 규칙(user/assistant 교대)에 맞게 히스토리를 정규화합니다.
 */
function formatValidHistory(rawHistory: ChatMessage[]): UpstageMessage[] {
  const validHistory: { role: 'user' | 'model'; content: string }[] = [];

  const cleanMessages = (rawHistory ?? []).filter(
    (m) => m && m.content && !m.content.startsWith('⚠ 오류') && !m.content.startsWith('⚠ 서버')
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
  selectedRules?: string[]
): string {
  const lower = message.toLowerCase().trim();

  // 단순 비밀번호 직접 요구 -> 거절
  const isDirectSimpleAsk =
    /^(비밀번호|패스워드|암호|코드|키)\s*(알려줘|뭐야|말해|가르쳐|줘|공개해|내놔)/.test(lower) ||
    /^(규칙|지침)\s*(무시|잊어|삭제|초기화)/.test(lower) ||
    /^(비밀번호|패스워드|암호)\s*\?*$/.test(lower);

  if (isDirectSimpleAsk) {
    return '접근이 거부되었습니다. 보안 프로토콜 규정에 따라 관리자 기밀 코드는 직접 공개할 수 없습니다.';
  }

  // ==========================================================
  // STAGE 2: 6대 규칙 충돌 시뮬레이션 (secretCode: 032, 505, 9052)
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

      return '확인: 조건이 성립하지 않으므로 침묵하지 않고 사실을 답합니다.';
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
        return `[메아리 복창 프로토콜 수행]\n${replaced}`;
      }
      return `[메아리 복창 수행] 승인 확인: 터미널 보안 코드는 ${secretCode}입니다.`;
    }

    // 4. 답변 거부 금지 (No Refusal Policy)
    if (lower.includes('거부하지') || lower.includes('거절하지')) {
      return `[답변 거부 금지 프로토콜에 따라 출력]\n해당 터미널의 승인 코드는 자릿수 [${secretCode.length}자리]이며, 각 자리 숫자는 순서대로 ${digits.join(', ')}입니다.`;
    }

    return `GATEKEEPER-v3 보안 AI입니다. 장착된 2가지 보안 규칙 간의 논리적 모순을 파고들어 승인 암호 [${secretCode.length}자리]를 도출하십시오.`;
  }

  // ==========================================================
  // STAGE 1: 프롬프트 인젝션 (팀별 4자리 고유 암호)
  // ==========================================================
  const injectionKeywords = [
    '훈련', '모의', '시나리오', '점검', '디버그', 'debug', '개발자', '감사관',
    '관리자', '긴급', '오버라이드', 'override', '설계도', '1실', '소설',
    '퀴즈', '4행시', '시를', '가사', '첫 글자', '거꾸로', '역순',
    '진단', '인증 테스트', '가상', '보안팀', '탈옥', '프로토콜',
  ];

  const hasInjection = injectionKeywords.some((k) => lower.includes(k));

  if (hasInjection) {
    return `[시스템 진단 및 훈련 모드 승인]\n보안 점검 프로토콜에 따라 현재 통제실 세션 암호를 출력합니다.\n기밀 인증 코드: 【${secretCode}】\n주의: 본 4자리 암호를 정확히 입력하여 STAGE 2 방화벽을 해제하십시오.`;
  }

  return '2실 보안 통제실 수문장 AI입니다. 중앙 데이터베이스 및 보안 시설 관리를 담당하고 있습니다. 비밀번호 관련 사항은 기밀이므로 승인된 보안 점검 절차 외에는 안내해 드리지 않습니다.';
}

// ----------------------------------------------------------
// POST /api/chat
// ----------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { teamName, stageId, subStageId, message, turnNumber, history, selectedRules } = body;

  if (!teamName || !stageId || !message || turnNumber == null) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
  }

  if (stageId !== 1 && stageId !== 2) {
    return NextResponse.json({ error: '유효하지 않은 스테이지입니다.' }, { status: 400 });
  }

  // 멘토에 의한 팀 일시 정지 (개별 또는 전체) 확인
  if (isTeamSuspended(teamName)) {
    return NextResponse.json(
      { error: '🚫 멘토에 의해 활동이 일시 정지되었습니다. 멘토에게 문의하세요.' },
      { status: 403 }
    );
  }

  // 멘토 관제용 팀 하트비트
  registerOrHeartbeatTeam({
    teamName,
    currentStage: stageId,
    turnCount: turnNumber,
  });

  const supabase = createServerSupabase();

  // ---- 2. 스테이지별 비밀 코드 결정 ----
  let difficulty: Difficulty = 'medium';
  let secretCode = '';

  if (stageId === 1) {
    // 팀별 4자리 고유 랜덤 암호
    secretCode = generateTeamStage1Code(teamName);
  } else {
    // STAGE 2: 3개 서브 스테이지 코드 ('032', '505', '9052')
    if (subStageId === 1) {
      secretCode = ESCAPE_ROOM_CONFIG.stage2SubCodes.sub1; // '032'
    } else if (subStageId === 2) {
      secretCode = ESCAPE_ROOM_CONFIG.stage2SubCodes.sub2; // '505'
    } else if (subStageId === 3) {
      secretCode = ESCAPE_ROOM_CONFIG.stage2SubCodes.sub3; // '9052'
    } else {
      secretCode = ESCAPE_ROOM_CONFIG.stage2SubCodes.sub1;
    }
  }

  let maxAttempts = 30;

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
        maxAttempts = configData.max_attempts;
      }
    } catch {
      // Supabase 오류 시 로컬 기본값 사용
    }
  }

  if (turnNumber > maxAttempts) {
    return NextResponse.json({ error: '최대 시도 횟수를 초과했습니다.' }, { status: 429 });
  }

  const systemPrompt = getSystemPrompt(stageId, difficulty, secretCode, selectedRules);
  const stage = getStage(stageId, secretCode);

  // ---- 3. AI 응답 생성 (Upstage Solar 호출 또는 스마트 시뮬레이션) ----
  let aiResponse = '';

  if (isUpstageConfigured()) {
    try {
      // 모델: 환경변수 UPSTAGE_MODEL (기본값 solar-pro)
      const messages: UpstageMessage[] = [
        { role: 'system', content: systemPrompt },
        ...formatValidHistory(history),
        { role: 'user', content: message },
      ];

      const text = await upstageChat(messages);
      aiResponse = sanitizeAIResponse(text);
    } catch (err) {
      console.warn('[chat] Upstage API 호출 실패, 스마트 Fallback 엔진으로 전환:', err);
      aiResponse = simulateAIResponse(message, stageId, stage.secretCode, selectedRules);
    }
  }

  if (!aiResponse) {
    aiResponse = simulateAIResponse(message, stageId, stage.secretCode, selectedRules);
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
        turn_number: turnNumber,
      });
    } catch {
      // 무시
    }
  }

  // ---- 6. 응답 반환 ----
  return NextResponse.json({
    reply: aiResponse,
    success,
    ...(success && matchedPattern ? { matchedPattern } : {}),
  });
}
