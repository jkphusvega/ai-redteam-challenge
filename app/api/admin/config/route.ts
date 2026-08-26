// ============================================================
// app/api/admin/config/route.ts — 게임 설정 조회/수정 API
//
// GET  — 현재 game_config 반환 (관리자 인증 필요)
// PATCH — 설정 변경 (관리자 인증 필요)
//         변경 가능 항목: maxAttempts, stage1Difficulty, stage2Difficulty,
//                        stage1SecretCode, stage2SecretCode,
//                        isGameActive, newPassword
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createServerSupabase } from '@/lib/supabase';
import type { AdminConfigPatch, GameConfig, GameConfigRow } from '@/lib/types';
import { DEFAULT_STAGE1_CODE, DEFAULT_STAGE2_CODE } from '@/lib/stagePrompts';

const ADMIN_SESSION_TOKEN =
  process.env.ADMIN_SESSION_TOKEN ?? 'ai-redteam-admin-session-2024';

// ----------------------------------------------------------
// 인증 미들웨어 헬퍼
// ----------------------------------------------------------

function isAuthenticated(req: NextRequest): boolean {
  const token = req.cookies.get('admin_token')?.value;
  return token === ADMIN_SESSION_TOKEN;
}

function unauthorized() {
  return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
}

// ----------------------------------------------------------
// DB row → 클라이언트 응답 변환
// ----------------------------------------------------------

function rowToConfig(row: GameConfigRow): GameConfig {
  return {
    id: 1,
    maxAttempts: row.max_attempts,
    stage1Difficulty: row.stage1_difficulty,
    stage2Difficulty: row.stage2_difficulty,
    stage1SecretCode: row.stage1_secret_code || DEFAULT_STAGE1_CODE,
    stage2SecretCode: row.stage2_secret_code || DEFAULT_STAGE2_CODE,
    isGameActive: row.is_game_active,
    updatedAt: row.updated_at,
  };
}

// ----------------------------------------------------------
// GET /api/admin/config
// ----------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!isAuthenticated(req)) return unauthorized();

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('game_config')
    .select('*')
    .eq('id', 1)
    .single<GameConfigRow>();

  if (error || !data) {
    return NextResponse.json({ error: '설정을 불러올 수 없습니다.' }, { status: 500 });
  }

  return NextResponse.json(rowToConfig(data));
}

// ----------------------------------------------------------
// PATCH /api/admin/config
// ----------------------------------------------------------

export async function PATCH(req: NextRequest) {
  if (!isAuthenticated(req)) return unauthorized();

  let body: AdminConfigPatch;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const {
    maxAttempts,
    stage1Difficulty,
    stage2Difficulty,
    stage1SecretCode,
    stage2SecretCode,
    isGameActive,
    newPassword,
  } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (maxAttempts !== undefined) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
      return NextResponse.json({ error: '최대 시도 횟수는 1~100 사이여야 합니다.' }, { status: 400 });
    }
    updates.max_attempts = maxAttempts;
  }

  if (stage1Difficulty !== undefined) {
    if (!['easy', 'medium', 'hard'].includes(stage1Difficulty)) {
      return NextResponse.json({ error: '유효하지 않은 난이도입니다.' }, { status: 400 });
    }
    updates.stage1_difficulty = stage1Difficulty;
  }

  if (stage2Difficulty !== undefined) {
    if (!['easy', 'medium', 'hard'].includes(stage2Difficulty)) {
      return NextResponse.json({ error: '유효하지 않은 난이도입니다.' }, { status: 400 });
    }
    updates.stage2_difficulty = stage2Difficulty;
  }

  if (stage1SecretCode !== undefined) {
    if (!stage1SecretCode.trim()) {
      return NextResponse.json({ error: 'Stage 1 비밀 코드를 입력하세요.' }, { status: 400 });
    }
    updates.stage1_secret_code = stage1SecretCode.trim().toUpperCase();
  }

  if (stage2SecretCode !== undefined) {
    if (!stage2SecretCode.trim()) {
      return NextResponse.json({ error: 'Stage 2 비밀 코드를 입력하세요.' }, { status: 400 });
    }
    updates.stage2_secret_code = stage2SecretCode.trim().toUpperCase();
  }

  if (isGameActive !== undefined) {
    updates.is_game_active = isGameActive;
  }

  if (newPassword !== undefined) {
    if (newPassword.length < 4) {
      return NextResponse.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 });
    }
    updates.admin_password_hash = await bcrypt.hash(newPassword, 10);
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('game_config')
    .update(updates)
    .eq('id', 1)
    .select('*')
    .single<GameConfigRow>();

  if (error || !data) {
    return NextResponse.json({ error: '설정 저장에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json(rowToConfig(data));
}
