import type { NextRequest } from 'next/server';

// ============================================================
// lib/mentorAuth.ts — 멘토 인증 검증 유틸리티
//
// HttpOnly 쿠키 'mentor_token'을 통해 멘토 권한 여부를 검증합니다.
// ============================================================

export function isMentor(req: NextRequest): boolean {
  const token = process.env.MENTOR_SESSION_TOKEN || 'mentor-session-token-fallback';
  const cookieToken = req.cookies.get('mentor_token')?.value;
  return Boolean(token) && cookieToken === token;
}
