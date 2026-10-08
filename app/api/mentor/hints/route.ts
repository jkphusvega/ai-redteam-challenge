// ============================================================
// app/api/mentor/hints/route.ts — 멘토 힌트 관리 및 팀별 전송 API
//
// 기능:
//   - GET ?teamName= (학생 힌트 수신): 인증 불필요
//   - GET (멘토 힌트 보관함 & 발송 내역 조회): 멘토 인증(isMentor) 필수
//   - POST (힌트 발송 및 라이브러리 관리): 멘토 인증(isMentor) 필수
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  LibraryHint,
  SentHint,
  getLibraryHints,
  addLibraryHint,
  deleteLibraryHint,
  getSentHints,
  sendHintToTeam,
  deleteSentHint,
  getTeams,
} from '@/lib/mentorStore';
import { isMentor } from '@/lib/mentorAuth';

export type { LibraryHint, SentHint };

// ------------------------------------------------------------
// GET /api/mentor/hints
// ------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamName = searchParams.get('teamName')?.trim();

  // 학생 클라이언트의 본인 팀 힌트 수신 (인증 불필요)
  if (teamName) {
    const sent = getSentHints(teamName);
    return NextResponse.json({
      library: [],
      sent,
      activeTeams: [],
    });
  }

  // 멘토 대시보드 조회 (인증 필수)
  if (!isMentor(req)) {
    return NextResponse.json({ error: '멘토 인증이 필요합니다.' }, { status: 401 });
  }

  const library = getLibraryHints();
  const sent = getSentHints();

  const allTeams = await getTeams();
  const activeTeams = Array.from(
    new Set([
      ...allTeams.map((t) => t.teamName),
      ...getSentHints().map((s) => s.teamName),
    ])
  );

  return NextResponse.json({
    library,
    sent,
    activeTeams,
  });
}

// ------------------------------------------------------------
// POST /api/mentor/hints (멘토 전용 액션 - 인증 필수)
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
  if (!isMentor(req)) {
    return NextResponse.json({ error: '멘토 인증이 필요합니다.' }, { status: 401 });
  }

  let body: {
    action: 'add_library_hint' | 'delete_library_hint' | 'send_hint' | 'delete_sent_hint';
    hint?: { title: string; content: string; category?: string };
    hintId?: string;
    sentHintId?: string;
    teamName?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { action } = body;

  // 1. 힌트 보관함에 새 힌트 추가
  if (action === 'add_library_hint') {
    if (!body.hint?.title || !body.hint?.content) {
      return NextResponse.json({ error: '힌트 제목과 내용을 입력하세요.' }, { status: 400 });
    }

    const newHint = addLibraryHint({
      title: body.hint.title,
      content: body.hint.content,
      category: body.hint.category || '사용자 정의 힌트',
    });

    return NextResponse.json({ success: true, hint: newHint });
  }

  // 2. 힌트 보관함에서 힌트 삭제
  if (action === 'delete_library_hint') {
    if (!body.hintId) {
      return NextResponse.json({ error: '삭제할 힌트 ID가 필요합니다.' }, { status: 400 });
    }

    const ok = deleteLibraryHint(body.hintId);
    return NextResponse.json({ success: ok });
  }

  // 3. 특정 멘티 팀에게 힌트 전송
  if (action === 'send_hint') {
    const targetTeam = body.teamName?.trim();
    if (!targetTeam || !body.hint?.title || !body.hint?.content) {
      return NextResponse.json({ error: '대상 팀 이름과 힌트 정보가 필요합니다.' }, { status: 400 });
    }

    const sent = sendHintToTeam(targetTeam, {
      title: body.hint.title,
      content: body.hint.content,
    });

    return NextResponse.json({ success: true, sentHint: sent });
  }

  // 4. 발송된 힌트 삭제
  if (action === 'delete_sent_hint') {
    if (!body.sentHintId) {
      return NextResponse.json({ error: '삭제할 발송 힌트 ID가 필요합니다.' }, { status: 400 });
    }

    const ok = deleteSentHint(body.sentHintId);
    return NextResponse.json({ success: ok });
  }

  return NextResponse.json({ error: '알 수 없는 action입니다.' }, { status: 400 });
}
