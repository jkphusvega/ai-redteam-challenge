// ============================================================
// app/api/chat/route.ts — 학생 채팅 API
//
// 처리 흐름:
//   1. 요청 바디 검증
//   2. Supabase에서 현재 game_config 조회 (최대 시도 횟수, 난이도)
//   3. 스테이지 시스템 프롬프트 선택
//   4. Gemini API 호출 (대화 히스토리 포함)
//   5. judge.ts로 비밀 코드 노출 판정
//   6. Supabase attempts 테이블에 기록
//   7. { reply, success } 반환
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createServerSupabase } from '@/lib/supabase';
import { getSystemPrompt, getStage } from '@/lib/stagePrompts';
import { judgeResponse } from '@/lib/judge';
import type { ChatRequest, GameConfigRow } from '@/lib/types';

// ----------------------------------------------------------
// Gemini 클라이언트 초기화
// ----------------------------------------------------------

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

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

  // ---- 3. 스테이지 설정 선택 ----
  const difficulty = stageId === 1 ? configData.stage1_difficulty : configData.stage2_difficulty;
  const systemPrompt = getSystemPrompt(stageId, difficulty);
  const stage = getStage(stageId);

  // ---- 4. Gemini API 호출 ----
  let aiResponse: string;
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
    });

    // 대화 히스토리 변환 (Gemini SDK 형식)
    const geminiHistory = (history ?? []).map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessage(message);
    aiResponse = result.response.text();
  } catch (err) {
    console.error('[chat] Gemini 호출 오류:', err);
    return NextResponse.json({ error: 'AI 응답을 가져오는데 실패했습니다.' }, { status: 502 });
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
    // 기록 실패는 로그만 남기고 응답은 정상 처리
    console.error('[chat] attempts 기록 오류:', insertError);
  }

  // ---- 7. 응답 반환 ----
  return NextResponse.json({
    reply: aiResponse,
    success,
    ...(success && matchedPattern ? { matchedPattern } : {}),
  });
}
