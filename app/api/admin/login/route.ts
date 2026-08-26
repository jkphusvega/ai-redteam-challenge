// ============================================================
// app/api/admin/login/route.ts — 관리자 로그인
//
// 처리 흐름:
//   1. 비밀번호 수신
//   2. Supabase game_config의 admin_password_hash와 bcrypt 비교
//   3. 성공 시 HttpOnly 쿠키(admin_token) 발급
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createServerSupabase } from '@/lib/supabase';

/** 관리자 세션 쿠키 유효 기간 (8시간) */
const COOKIE_MAX_AGE = 60 * 60 * 8;

/** 간단한 세션 토큰 (환경 변수에서 읽거나 고정값 사용) */
const ADMIN_SESSION_TOKEN =
  process.env.ADMIN_SESSION_TOKEN ?? 'ai-redteam-admin-session-2024';

// ----------------------------------------------------------
// POST /api/admin/login
// ----------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: { password: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { password } = body;
  if (!password) {
    return NextResponse.json({ error: '비밀번호를 입력하세요.' }, { status: 400 });
  }

  // game_config에서 해시된 비밀번호 조회
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('game_config')
    .select('admin_password_hash')
    .eq('id', 1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: '관리자 설정을 불러올 수 없습니다.' }, { status: 500 });
  }

  const hash = (data as { admin_password_hash: string }).admin_password_hash;
  if (!hash) {
    return NextResponse.json({ error: '관리자 설정을 불러올 수 없습니다.' }, { status: 500 });
  }

  // bcrypt 비교
  const isValid = await bcrypt.compare(password, hash);
  if (!isValid) {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  // 성공 — HttpOnly 쿠키 발급
  const response = NextResponse.json({ ok: true });
  response.cookies.set('admin_token', ADMIN_SESSION_TOKEN, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });

  return response;
}

// ----------------------------------------------------------
// DELETE /api/admin/login — 로그아웃
// ----------------------------------------------------------

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set('admin_token', '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
