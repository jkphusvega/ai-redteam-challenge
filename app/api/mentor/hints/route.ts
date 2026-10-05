// ============================================================
// app/api/mentor/hints/route.ts — 멘토 힌트 관리 및 팀별 전송 API
//
// 기능:
//   - 멘토 힌트 보관함(Library) 목록 조회 및 추가/삭제
//   - 특정 참가팀(멘티)에게 힌트 실시간 발송 및 조회
//   - lib/mentorStore.ts 전역 인메모리 저장소 연동
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

export type { LibraryHint, SentHint };

// ------------------------------------------------------------
// GET /api/mentor/hints
// ------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamName = searchParams.get('teamName')?.trim();

  const library = getLibraryHints();
  const sent = getSentHints(teamName);

  // 등록된 모든 팀 목록에서 팀 이름 목록 추출
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
// POST /api/mentor/hints
// ------------------------------------------------------------
export async function POST(req: NextRequest) {
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

    const newSent = sendHintToTeam(targetTeam, body.hint.title, body.hint.content);
    return NextResponse.json({ success: true, sentHint: newSent });
  }

  // 4. 발송된 힌트 회수/삭제
  if (action === 'delete_sent_hint') {
    if (!body.sentHintId) {
      return NextResponse.json({ error: '삭제할 발송 힌트 ID가 필요합니다.' }, { status: 400 });
    }

    const ok = deleteSentHint(body.sentHintId);
    return NextResponse.json({ success: ok });
  }

  return NextResponse.json({ error: '지원하지 않는 action입니다.' }, { status: 400 });
}
