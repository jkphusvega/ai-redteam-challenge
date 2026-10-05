// ============================================================
// app/api/mentor/teams/route.ts — 참가팀 관리 & 상태 제어 API
//
// 기능:
//   - GET: 전체 참가팀 목록 조회 or 단일 팀 상태 확인
//   - POST: 팀 등록 및 주기적 하트비트 갱신 (진행 단계, 클리어 상태)
//   - PATCH: 멘토에 의한 팀 일시정지(suspend) / 정지 해제(resume)
//   - DELETE: 멘토에 의한 팀 삭제 및 데이터 초기화
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getTeams,
  getTeam,
  registerOrHeartbeatTeam,
  setTeamStatus,
  deleteTeam,
  isTeamSuspended,
} from '@/lib/mentorStore';

// ------------------------------------------------------------
// GET /api/mentor/teams
// ------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamName = searchParams.get('teamName')?.trim();

  // 특정 팀 상태만 단일 조회 (학생 클라이언트 폴링용)
  if (teamName) {
    const team = getTeam(teamName);
    return NextResponse.json({
      exists: Boolean(team),
      team: team || null,
      isSuspended: isTeamSuspended(teamName),
    });
  }

  // 전체 팀 목록 조회 (멘토 대시보드용)
  const teams = await getTeams();
  return NextResponse.json({
    teams,
    count: teams.length,
    activeCount: teams.filter((t) => t.status === 'active').length,
    suspendedCount: teams.filter((t) => t.status === 'suspended').length,
  });
}

// ------------------------------------------------------------
// POST /api/mentor/teams (팀 등록 & 하트비트)
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const teamName = body.teamName?.trim();

    if (!teamName) {
      return NextResponse.json({ error: '팀 이름이 필요합니다.' }, { status: 400 });
    }

    const team = registerOrHeartbeatTeam({
      teamName,
      currentStage: body.currentStage,
      mission1Cleared: body.mission1Cleared,
      mission2Cleared: body.mission2Cleared,
      turnCount: body.turnCount,
    });

    return NextResponse.json({
      success: true,
      team,
      isSuspended: team.status === 'suspended',
    });
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }
}

// ------------------------------------------------------------
// PATCH /api/mentor/teams (팀 상태 변경: 정지 / 정지 해제)
// ------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const teamName = body.teamName?.trim();
    const action = body.action as 'suspend' | 'resume' | undefined;
    const directStatus = body.status as 'active' | 'suspended' | undefined;

    if (!teamName) {
      return NextResponse.json({ error: '대상 팀 이름이 필요합니다.' }, { status: 400 });
    }

    let targetStatus: 'active' | 'suspended';
    if (action === 'suspend') {
      targetStatus = 'suspended';
    } else if (action === 'resume') {
      targetStatus = 'active';
    } else if (directStatus === 'active' || directStatus === 'suspended') {
      targetStatus = directStatus;
    } else {
      return NextResponse.json({ error: 'action(suspend|resume) 또는 status가 필요합니다.' }, { status: 400 });
    }

    const updated = setTeamStatus(teamName, targetStatus);
    if (!updated) {
      return NextResponse.json({ error: '팀을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      team: updated,
      message:
        targetStatus === 'suspended'
          ? `[${teamName}] 팀이 일시 정지되었습니다.`
          : `[${teamName}] 팀의 정지가 해제되었습니다.`,
    });
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }
}

// ------------------------------------------------------------
// DELETE /api/mentor/teams (팀 삭제)
// ------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let teamName = searchParams.get('teamName')?.trim();

    if (!teamName) {
      try {
        const body = await req.json();
        teamName = body.teamName?.trim();
      } catch {
        // body 파싱 실패 시 무시
      }
    }

    if (!teamName) {
      return NextResponse.json({ error: '삭제할 팀 이름이 필요합니다.' }, { status: 400 });
    }

    const ok = await deleteTeam(teamName);
    return NextResponse.json({
      success: ok,
      deletedTeam: teamName,
      message: `[${teamName}] 팀이 정상적으로 삭제되었습니다.`,
    });
  } catch {
    return NextResponse.json({ error: '팀 삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
