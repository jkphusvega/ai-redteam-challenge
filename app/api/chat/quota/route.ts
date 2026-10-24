// ============================================================
// app/api/chat/quota/route.ts — 팀의 터미널별 질문 할당량 조회
//
// GET ?teamName= → { quotas: { s1, 's2-1', 's2-2', s3 }, cooldownSeconds }
// 클라이언트는 이 값만 표시하며 한도·냉각을 직접 계산하지 않습니다.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { COOLDOWN_SECONDS, getQuotaLimit, getQuotaStatuses } from '@/lib/chatQuota';

export async function GET(req: NextRequest) {
  const teamName = req.nextUrl.searchParams.get('teamName')?.trim();
  if (!teamName) {
    return NextResponse.json({ error: '팀 이름이 필요합니다.' }, { status: 400 });
  }

  const limit = await getQuotaLimit();
  const quotas = await getQuotaStatuses(teamName, limit);
  return NextResponse.json({ quotas, cooldownSeconds: COOLDOWN_SECONDS });
}
