import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// app/api/mentor/login/route.ts — 멘토 인증 로그인 API
//
// 비밀번호를 서버에서 검증하고 맞으면 HttpOnly 쿠키(mentor_token)를 발급합니다.
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const expectedPassword = process.env.MENTOR_PASSWORD || '0918';

    if (!password || password.trim() !== expectedPassword.trim()) {
      return NextResponse.json(
        { error: '멘토 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    const sessionToken = process.env.MENTOR_SESSION_TOKEN || 'mentor-session-token-fallback';

    const res = NextResponse.json({ success: true, message: '멘토 인증 성공' });
    res.cookies.set('mentor_token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7일 유효
    });

    return res;
  } catch (err) {
    console.error('[mentor/login] 로그인 오류:', err);
    return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE() {
  // 로그아웃 시 쿠키 제거
  const res = NextResponse.json({ success: true, message: '로그아웃 완료' });
  res.cookies.delete('mentor_token');
  return res;
}
