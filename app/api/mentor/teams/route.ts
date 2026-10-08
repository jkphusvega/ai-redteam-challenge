// ============================================================
// app/api/mentor/teams/route.ts — 참가팀 관리 & 상태 제어 API
//
// 기능:
//   - GET:
//       • ?teamName= (학생 조회): 인증 불필요, stage1SecretCode 제외하여 반환
//       • 전체 목록 (멘토 조회): 멘토 인증(isMentor) 필수!
//   - POST: 팀 등록 및 주기적 하트비트 갱신 (인증 불필요, stage1SecretCode 제외하여 반환)
//   - PATCH: 멘토 액션 (일시정지/해제, 전원 2단계 전환 등): 멘토 인증 필수!
//   - DELETE: 멘토에 의한 팀 삭제: 멘토 인증 필수!
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getTeams,
  getTeam,
  registerOrHeartbeatTeam,
  setTeamStatus,
  deleteTeam,
  isTeamSuspended,
  isTeamDeleted,
  getMentorControlState,
  setGlobalSuspended,
  setGlobalStageAdvance,
} from '@/lib/mentorStore';
import { isMentor } from '@/lib/mentorAuth';

// ------------------------------------------------------------
// GET /api/mentor/teams
// ------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamName = searchParams.get('teamName')?.trim();
  const controlState = getMentorControlState();

  // 특정 팀 상태만 단일 조회 (학생 클라이언트 폴링용 - 인증 불필요, 암호 제외)
  if (teamName) {
    const team = getTeam(teamName);
    const sanitizedTeam = team ? { ...team, stage1SecretCode: undefined } : null;
    return NextResponse.json({
      exists: Boolean(team),
      team: sanitizedTeam,
      isSuspended: isTeamSuspended(teamName),
      isGlobalSuspended: controlState.isGlobalSuspended,
      globalStageAdvance: controlState.globalStageAdvance,
    });
  }

  // 전체 팀 목록 조회 (멘토 대시보드용 - 인증 필요)
  if (!isMentor(req)) {
    return NextResponse.json({ error: '멘토 인증이 필요합니다.' }, { status: 401 });
  }

  const teams = await getTeams();
  return NextResponse.json({
    teams,
    count: teams.length,
    activeCount: teams.filter((t) => t.status === 'active').length,
    suspendedCount: teams.filter((t) => t.status === 'suspended').length,
    isGlobalSuspended: controlState.isGlobalSuspended,
    globalStageAdvance: controlState.globalStageAdvance,
  });
}

// ------------------------------------------------------------
// POST /api/mentor/teams (팀 등록 & 하트비트 - 인증 불필요, 암호 제외)
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const teamName = body.teamName?.trim();

    if (!teamName) {
      return NextResponse.json({ error: '팀 이름이 필요합니다.' }, { status: 400 });
    }

    const isInitialRegister = Boolean(body.isInitialRegister);
    if (!isInitialRegister && isTeamDeleted(teamName)) {
      return NextResponse.json({ error: '멘토에 의해 삭제된 팀입니다.' }, { status: 404 });
    }

    const team = registerOrHeartbeatTeam({
      teamName,
      isInitialRegister,
      currentStage: body.currentStage,
      mission1Cleared: body.mission1Cleared,
      mission2Cleared: body.mission2Cleared,
      stage2Sub1Cleared: body.stage2Sub1Cleared,
      stage2Sub2Cleared: body.stage2Sub2Cleared,
      stage2Sub3Cleared: body.stage2Sub3Cleared,
      turnCount: body.turnCount,
    });

    const controlState = getMentorControlState();
    const sanitizedTeam = { ...team, stage1SecretCode: undefined };

    return NextResponse.json({
      success: true,
      team: sanitizedTeam,
      isSuspended: isTeamSuspended(teamName),
      isGlobalSuspended: controlState.isGlobalSuspended,
      globalStageAdvance: controlState.globalStageAdvance,
    });
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }
}

// ------------------------------------------------------------
// PATCH /api/mentor/teams (팀 상태 변경 및 멘토 전역 제어 - 인증 필요)
// ------------------------------------------------------------
export async function PATCH(req: NextRequest) {
  if (!isMentor(req)) {
    return NextResponse.json({ error: '멘토 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body.action as
      | 'suspend'
      | 'resume'
      | 'global_suspend'
      | 'global_resume'
      | 'advance_all_stage2'
      | 'reset_stage_advance'
      | undefined;
    const teamName = body.teamName?.trim();
    const directStatus = body.status as 'active' | 'suspended' | undefined;

    // 1. 전체 참가팀 일시 정지 (Global Freeze)
    if (action === 'global_suspend') {
      setGlobalSuspended(true);
      return NextResponse.json({
        success: true,
        isGlobalSuspended: true,
        message: '🚨 전체 참가팀의 활동이 일시 정지되었습니다.',
      });
    }

    // 2. 전체 참가팀 일시 정지 해제 (Global Resume)
    if (action === 'global_resume') {
      setGlobalSuspended(false);
      return NextResponse.json({
        success: true,
        isGlobalSuspended: false,
        message: '▶ 전체 참가팀의 일시 정지가 해제되었습니다.',
      });
    }

    // 3. 전체 참가팀 STAGE 2 일괄 전환
    if (action === 'advance_all_stage2') {
      setGlobalStageAdvance(2);
      return NextResponse.json({
        success: true,
        globalStageAdvance: 2,
        message: '🚀 모든 참가팀을 STAGE 2로 일괄 전환했습니다.',
      });
    }

    if (action === 'reset_stage_advance') {
      setGlobalStageAdvance(null);
      return NextResponse.json({
        success: true,
        globalStageAdvance: null,
      });
    }

    // 4. 개별 팀 상태 변경
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
      return NextResponse.json({ error: '유효한 action 또는 status가 필요합니다.' }, { status: 400 });
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
// DELETE /api/mentor/teams (팀 삭제 - 인증 필요)
// ------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  if (!isMentor(req)) {
    return NextResponse.json({ error: '멘토 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    let teamName = searchParams.get('teamName')?.trim();

    if (!teamName) {
      try {
        const body = await req.json();
        teamName = body.teamName?.trim();
      } catch {
        // 무시
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
