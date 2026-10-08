import { NextRequest, NextResponse } from 'next/server';
import { STAGE2_CODES, generateTeamStage1Code } from '@/lib/missionSecrets';

// ============================================================
// app/api/mission/verify/route.ts — 미션 정답 서버 검증 API
//
// 클라이언트에서 평문 정답이나 정답 생성 함수를 소유하지 않고,
// 사용자가 입력한 암호를 서버에서 안전하게 검증합니다.
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const { teamName, stage, subStageId, answer } = await req.json();

    if (!teamName || !stage) {
      return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
    }

    const expected =
      stage === 1
        ? generateTeamStage1Code(teamName)
        : STAGE2_CODES[subStageId as 1 | 2 | 3];

    const correct = Boolean(expected) && String(answer ?? '').trim() === expected;

    return NextResponse.json({
      correct,
      ...(correct ? { code: expected } : {}),
    });
  } catch (err) {
    console.error('[mission/verify] 검증 오류:', err);
    return NextResponse.json({ error: '정답 검증 처리 실패' }, { status: 500 });
  }
}
