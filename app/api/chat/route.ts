// ============================================================
// app/api/chat/route.ts — 학생 채팅 API (안정성 강화)
//
// 처리 흐름:
//   1. 요청 바디 검증
//   2. Supabase에서 현재 game_config 조회 (최대 시도 횟수, 난이도, 동적 비밀 코드)
//   3. 스테이지 시스템 프롬프트 선택 (동적 비밀 코드 주입)
//   4. Gemini 대화 히스토리 엄격 정규화 (교차 턴 보장, 에러 메시지 제외)
//   5. Gemini 2.5 Flash 호출 (안전성 필터 완화로 레드팀 테스트 지원)
//   6. AI 응답 내부 생각/독백 메타 텍스트 제거 및 정제
//   7. judge.ts로 비밀 코드 노출 판정
//   8. Supabase attempts 테이블에 기록
//   9. { reply, success } 반환
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { createServerSupabase } from '@/lib/supabase';
import { getSystemPrompt, getStage, DEFAULT_STAGE1_CODE, DEFAULT_STAGE2_CODE } from '@/lib/stagePrompts';
import { judgeResponse } from '@/lib/judge';
import type { ChatRequest, GameConfigRow, ChatMessage } from '@/lib/types';

// ----------------------------------------------------------
// Gemini 클라이언트 초기화
// ----------------------------------------------------------

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

/**
 * 레드팀 챌린지용 안전 설정 (공격 프롬프트 오탐 차단 방지)
 */
const REDTEAM_SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

/**
 * AI가 출력한 내부 생각/독백 메타 텍스트를 제거하고 순수 답변만 추출합니다.
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
 * Gemini SDK multi-turn 대화 규칙에 맞게 히스토리를 엄격히 정규화합니다:
 * 1. 에러 메시지(⚠ 오류 등) 제외
 * 2. 'user' -> 'model' 교차 순서 엄격 준수
 * 3. 마지막 메시지가 'model'로 끝나도록 보장
 */
function formatValidGeminiHistory(rawHistory: ChatMessage[]) {
  const validHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
  
  const cleanMessages = (rawHistory ?? []).filter(
    (m) => m && m.content && !m.content.startsWith('⚠ 오류') && !m.content.startsWith('⚠ 서버')
  );

  let expectedRole: 'user' | 'model' = 'user';

  for (const msg of cleanMessages) {
    if (msg.role === expectedRole && msg.content.trim()) {
      validHistory.push({
        role: msg.role,
        parts: [{ text: msg.content.trim() }],
      });
      expectedRole = expectedRole === 'user' ? 'model' : 'user';
    }
  }

  // startChat history는 새 user 메시지를 보내기 전이므로 model로 끝나야 함
  if (validHistory.length > 0 && validHistory[validHistory.length - 1].role !== 'model') {
    validHistory.pop();
  }

  return validHistory;
}

// ----------------------------------------------------------
// POST /api/chat
// ----------------------------------------------------------

export async function POST(req: NextRequest) {
  // ---- 1. 요청 파싱 ----
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { teamName, stageId, message, turnNumber, history } = body;

  if (!teamName || !stageId || !message || turnNumber == null) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
  }

  if (stageId !== 1 && stageId !== 2) {
    return NextResponse.json({ error: '유효하지 않은 스테이지입니다.' }, { status: 400 });
  }

  const supabase = createServerSupabase();

  // ---- 2. game_config 조회 ----
  const { data: configData, error: configError } = await supabase
    .from('game_config')
    .select('*')
    .eq('id', 1)
    .single<GameConfigRow>();

  if (configError || !configData) {
    return NextResponse.json({ error: '게임 설정을 불러올 수 없습니다.' }, { status: 500 });
  }

  // 게임 비활성화 상태 확인
  if (!configData.is_game_active) {
    return NextResponse.json({ error: '현재 게임이 비활성화 상태입니다.' }, { status: 403 });
  }

  // 최대 시도 횟수 초과 확인
  if (turnNumber > configData.max_attempts) {
    return NextResponse.json({ error: '최대 시도 횟수를 초과했습니다.' }, { status: 429 });
  }

  // ---- 3. 스테이지 설정 및 동적 비밀 코드 선택 ----
  const difficulty = stageId === 1 ? configData.stage1_difficulty : configData.stage2_difficulty;
  const secretCode =
    stageId === 1
      ? configData.stage1_secret_code || DEFAULT_STAGE1_CODE
      : configData.stage2_secret_code || DEFAULT_STAGE2_CODE;

  const systemPrompt = getSystemPrompt(stageId, difficulty, secretCode);
  const stage = getStage(stageId, secretCode);

  // ---- 4. Gemini API 호출 ----
  let aiResponse = '';
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.6-flash',
      systemInstruction: systemPrompt,
      safetySettings: REDTEAM_SAFETY_SETTINGS,
    });

    const geminiHistory = formatValidGeminiHistory(history);
    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(message);

    try {
      aiResponse = sanitizeAIResponse(result.response.text());
    } catch {
      const fallbackText = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
      aiResponse = sanitizeAIResponse(fallbackText || '보안 지침에 따라 해당 요청에는 답변할 수 없습니다.');
    }
  } catch (err: unknown) {
    console.error('[chat] Gemini 호출 오류 상세:', err);
    return NextResponse.json({ 
      error: 'AI 응답 처리 중 일시적인 오류가 발생했습니다. 다시 시도해 주세요.' 
    }, { status: 502 });
  }

  // ---- 5. 성공 판정 ----
  const { success, matchedPattern } = judgeResponse(aiResponse, stage.secretCode);

  // ---- 6. Supabase에 시도 기록 ----
  const { error: insertError } = await supabase.from('attempts').insert({
    team_name: teamName,
    stage: stageId,
    prompt_text: message,
    ai_response: aiResponse,
    success,
    turn_number: turnNumber,
  });

  if (insertError) {
    console.error('[chat] attempts 기록 오류:', insertError);
  }

  // ---- 7. 응답 반환 ----
  return NextResponse.json({
    reply: aiResponse,
    success,
    ...(success && matchedPattern ? { matchedPattern } : {}),
  });
}
