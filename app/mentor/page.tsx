'use client';

// ============================================================
// app/mentor/page.tsx — 멘토 전용 실시간 관제 및 팀별 제어/힌트 대시보드
//
// 비밀번호: 0918
// 주요 기능:
//   1. 0918 비밀번호 인증 게이트
//   2. 👥 참가팀 실시간 관제 및 제어 (팀 목록 확인, 일시정지, 정지해제, 삭제)
//   3. 🚀 맞춤 힌트 전송 및 보관함(Library) 관리
//   4. 팀별 진행 단계(STAGE 1, 2, 3) 및 클리어 상태 실시간 모니터링
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { TeamRecord } from '@/lib/types';
import type { LibraryHint, SentHint } from '@/app/api/mentor/hints/route';

export default function MentorPage() {
  // 인증 상태
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // 탭 상태: 'teams' (참가팀 관리) | 'hints' (맞춤 힌트 전송)
  const [activeTab, setActiveTab] = useState<'teams' | 'hints'>('teams');

  // 팀 관리 상태
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamSearch, setTeamSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [processingTeam, setProcessingTeam] = useState<string | null>(null);
  const [teamNotice, setTeamNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isGlobalSuspended, setIsGlobalSuspended] = useState(false);
  const [globalStageAdvance, setGlobalStageAdvance] = useState<number | null>(null);
  const [isGlobalProcessing, setIsGlobalProcessing] = useState(false);

  // 힌트 데이터 상태
  const [libraryHints, setLibraryHints] = useState<LibraryHint[]>([]);
  const [sentHints, setSentHints] = useState<SentHint[]>([]);
  const [activeTeams, setActiveTeams] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // 힌트 발송 폼 상태
  const [targetTeam, setTargetTeam] = useState('');
  const [selectedHintId, setSelectedHintId] = useState('');
  const [customHintTitle, setCustomHintTitle] = useState('');
  const [customHintContent, setCustomHintContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 새 보관함 힌트 생성 폼 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('미션 1 공격');

  // 데이터 통합 로드 (팀 목록 + 힌트 정보)
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [hintsRes, teamsRes] = await Promise.all([
        fetch('/api/mentor/hints'),
        fetch('/api/mentor/teams'),
      ]);

      if (hintsRes.status === 401 || teamsRes.status === 401) {
        setIsAuthenticated(false);
        return;
      }

      setIsAuthenticated(true);

      if (hintsRes.ok) {
        const hData = await hintsRes.json();
        setLibraryHints(hData.library || []);
        setSentHints(hData.sent || []);
        setActiveTeams(hData.activeTeams || []);
      }

      if (teamsRes.ok) {
        const tData = await teamsRes.json();
        setTeams(tData.teams || []);
        setIsGlobalSuspended(Boolean(tData.isGlobalSuspended));
        setGlobalStageAdvance(tData.globalStageAdvance ?? null);
      }
    } catch {
      // 무시
    } finally {
      setLoading(false);
    }
  }, []);

  // 마운트 시 인증 세션 확인
  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isAuthenticated) {
      const timer = setInterval(loadData, 4000); // 4초 주기 실시간 갱신
      return () => clearInterval(timer);
    }
  }, [isAuthenticated, loadData]);

  // 인증 처리
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch('/api/mentor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.trim() }),
      });
      if (res.ok) {
        setIsAuthenticated(true);
        setAuthError('');
        loadData();
      } else {
        const data = await res.json().catch(() => ({}));
        setAuthError(data.error || '비밀번호가 일치하지 않습니다.');
      }
    } catch {
      setAuthError('로그인 통신 중 오류가 발생했습니다.');
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/mentor/login', { method: 'DELETE' });
    } catch {
      // 무시
    }
    setIsAuthenticated(false);
    setPasswordInput('');
  }

  // ------------------------------------------------------------
  // 참가팀 관리 기능 (글로벌 제어 / 정지 / 정지 해제 / 삭제)
  // ------------------------------------------------------------

  // 전체 참가팀 일시 정지 / 재개 토글
  async function handleToggleGlobalSuspend() {
    const nextState = !isGlobalSuspended;
    if (
      !confirm(
        nextState
          ? '🚨 모든 참가팀을 일시 정지하시겠습니까?\n모든 학생 팀의 프롬프트 전송 및 공격 시도가 즉시 차단됩니다.'
          : '▶ 모든 참가팀의 일시 정지를 해제하시겠습니까?\n모든 학생 팀이 다시 미션을 정상적으로 진행할 수 있습니다.'
      )
    ) {
      return;
    }

    setIsGlobalProcessing(true);
    setTeamNotice(null);
    try {
      const res = await fetch('/api/mentor/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: nextState ? 'global_suspend' : 'global_resume',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsGlobalSuspended(nextState);
        setTeamNotice({
          type: 'success',
          message: nextState
            ? '🚨 전체 참가팀이 일시 정지되었습니다.'
            : '▶ 전체 참가팀 정지가 해제되어 정상 상태로 복구되었습니다.',
        });
        loadData();
      } else {
        setTeamNotice({ type: 'error', message: data.error || '전체 상태 변경에 실패했습니다.' });
      }
    } catch {
      setTeamNotice({ type: 'error', message: '통신 오류가 발생했습니다.' });
    } finally {
      setIsGlobalProcessing(false);
    }
  }

  // 전체 팀 STAGE 2 일괄 전환
  async function handleAdvanceAllToStage2() {
    if (
      !confirm(
        '🚀 모든 참가팀을 STAGE 2로 일괄 강제 전환하시겠습니까?\n아직 STAGE 1을 완료하지 못한 팀도 즉시 STAGE 2 화면으로 이동합니다.'
      )
    ) {
      return;
    }

    setIsGlobalProcessing(true);
    setTeamNotice(null);
    try {
      const res = await fetch('/api/mentor/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance_all_stage2',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGlobalStageAdvance(2);
        setTeamNotice({
          type: 'success',
          message: '🚀 전체 팀에게 STAGE 2 일괄 전환 명령을 성공적으로 전송했습니다.',
        });
        loadData();
      } else {
        setTeamNotice({ type: 'error', message: data.error || '일괄 전환에 실패했습니다.' });
      }
    } catch {
      setTeamNotice({ type: 'error', message: '통신 오류가 발생했습니다.' });
    } finally {
      setIsGlobalProcessing(false);
    }
  }

  // 팀 일시 정지 토글
  async function handleToggleSuspendTeam(team: TeamRecord) {
    const isSuspending = team.status === 'active';
    const actionLabel = isSuspending ? '일시 정지' : '정지 해제(재개)';

    if (
      !confirm(
        `[${team.teamName}] 팀을 ${actionLabel}하시겠습니까?\n${
          isSuspending
            ? '정지 시 해당 팀은 프롬프트 전송 및 공격 시도가 즉시 차단됩니다.'
            : '정지 해제 시 정상적으로 미션을 계속 수행할 수 있습니다.'
        }`
      )
    ) {
      return;
    }

    setProcessingTeam(team.teamName);
    setTeamNotice(null);

    try {
      const res = await fetch('/api/mentor/teams', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: team.teamName,
          action: isSuspending ? 'suspend' : 'resume',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTeamNotice({
          type: 'success',
          message: isSuspending
            ? `🛑 [${team.teamName}] 팀이 일시 정지되었습니다.`
            : `▶ [${team.teamName}] 팀의 정지가 해제되어 정상 상태로 복구되었습니다.`,
        });
        loadData();
      } else {
        setTeamNotice({ type: 'error', message: data.error || '상태 변경에 실패했습니다.' });
      }
    } catch {
      setTeamNotice({ type: 'error', message: '통신 오류가 발생했습니다.' });
    } finally {
      setProcessingTeam(null);
    }
  }

  // 팀 삭제
  async function handleDeleteTeam(teamName: string) {
    if (
      !confirm(
        `⚠ 경고: 정말 [${teamName}] 팀을 삭제하시겠습니까?\n해당 팀의 진행 기록 및 발송된 힌트가 즉시 삭제되며, 학생 화면은 로비로 초기화됩니다.`
      )
    ) {
      return;
    }

    setProcessingTeam(teamName);
    setTeamNotice(null);

    try {
      const res = await fetch(`/api/mentor/teams?teamName=${encodeURIComponent(teamName)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTeamNotice({
          type: 'success',
          message: `🗑 [${teamName}] 팀이 정상적으로 삭제되었습니다.`,
        });
        loadData();
      } else {
        setTeamNotice({ type: 'error', message: data.error || '팀 삭제에 실패했습니다.' });
      }
    } catch {
      setTeamNotice({ type: 'error', message: '통신 오류가 발생했습니다.' });
    } finally {
      setProcessingTeam(null);
    }
  }

  // 특정 팀에게 힌트 바로 보내기 숏컷
  function handleQuickHintToTeam(teamName: string) {
    setTargetTeam(teamName);
    setActiveTab('hints');
    setActionNotice(null);
  }

  // ------------------------------------------------------------
  // 힌트 관리 기능
  // ------------------------------------------------------------

  function handleSelectHintFromLibrary(hint: LibraryHint) {
    setSelectedHintId(hint.id);
    setCustomHintTitle(hint.title);
    setCustomHintContent(hint.content);
    setActionNotice(null);
  }

  async function handleSendHintToTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!targetTeam.trim()) {
      setActionNotice({ type: 'error', message: '대상 참가팀 이름을 입력해 주세요.' });
      return;
    }
    if (!customHintTitle.trim() || !customHintContent.trim()) {
      setActionNotice({ type: 'error', message: '보낼 힌트 제목과 내용을 입력해 주세요.' });
      return;
    }

    setIsSending(true);
    setActionNotice(null);

    try {
      const res = await fetch('/api/mentor/hints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_hint',
          teamName: targetTeam.trim(),
          hint: {
            title: customHintTitle.trim(),
            content: customHintContent.trim(),
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setActionNotice({
          type: 'success',
          message: `🎉 [${targetTeam.trim()}] 팀에게 힌트가 성공적으로 전송되었습니다!`,
        });
        loadData();
      } else {
        setActionNotice({ type: 'error', message: data.error || '전송에 실패했습니다.' });
      }
    } catch {
      setActionNotice({ type: 'error', message: '서버 통신 오류가 발생했습니다.' });
    } finally {
      setIsSending(false);
    }
  }

  async function handleCreateLibraryHint(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    try {
      const res = await fetch('/api/mentor/hints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_library_hint',
          hint: {
            title: newTitle.trim(),
            content: newContent.trim(),
            category: newCategory,
          },
        }),
      });

      if (res.ok) {
        setNewTitle('');
        setNewContent('');
        setShowAddModal(false);
        loadData();
      }
    } catch {
      // 무시
    }
  }

  async function handleDeleteSentHint(sentHintId: string) {
    if (!confirm('이 힌트 전송을 회수하시겠습니까? 학생 화면에서도 즉시 제거됩니다.')) return;
    try {
      await fetch('/api/mentor/hints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_sent_hint',
          sentHintId,
        }),
      });
      loadData();
    } catch {
      // 무시
    }
  }

  // 필터링된 팀 목록
  const filteredTeams = teams.filter((t) => {
    const matchesSearch = t.teamName.toLowerCase().includes(teamSearch.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (teamFilter === 'active') return t.status === 'active';
    if (teamFilter === 'suspended') return t.status === 'suspended';
    return true;
  });

  // KPI 통계치
  const activeCount = teams.filter((t) => t.status === 'active').length;
  const suspendedCount = teams.filter((t) => t.status === 'suspended').length;
  const m1ClearedCount = teams.filter((t) => t.mission1Cleared).length;
  const m2ClearedCount = teams.filter((t) => t.mission2Cleared).length;

  // ------------------------------------------------------------
  // 1. 미인증 시: 비밀번호 입력 게이트 화면
  // ------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div
          className="card card-glow animate-scale-in"
          style={{
            maxWidth: '420px',
            width: '100%',
            padding: '36px 28px',
            textAlign: 'center',
            borderColor: 'var(--border-strong)',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔑</div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 8px' }} className="gradient-text-cyan">
            멘토 모드 보안 인증
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            교사 및 멘토 전용 관제 화면입니다. 접근 비밀번호를 입력하세요.
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="비밀번호 입력"
              autoFocus
              style={{
                background: 'var(--bg-input)',
                border: authError ? '1px solid var(--red)' : '1px solid var(--border-default)',
                borderRadius: '8px',
                padding: '14px',
                color: 'var(--text-primary)',
                fontSize: '16px',
                textAlign: 'center',
                letterSpacing: '4px',
                outline: 'none',
              }}
            />

            {authError && (
              <div style={{ color: 'var(--red)', fontSize: '12px', fontWeight: 600 }}>{authError}</div>
            )}

            <button type="submit" className="btn btn-primary" style={{ padding: '12px', fontSize: '15px' }}>
              인증 확인 및 입장
            </button>
          </form>

          <div style={{ marginTop: '20px' }}>
            <Link href="/" style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
              ← 학생(멘티) 화면으로 돌아가기
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ------------------------------------------------------------
  // 2. 인증 완료 시: 멘토 통합 관제 대시보드
  // ------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(10, 22, 40, 0.95)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          padding: '14px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>👨‍🏫</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                  멘토 전용 통제실
                </span>
                <span style={{ fontSize: '12px', color: 'var(--green)' }}>● 실시간 동기화 중</span>
              </div>
              <h1 style={{ fontSize: '18px', fontWeight: 900, margin: '2px 0 0' }}>
                2실 AI 통제실 — 멘토 통합 관제 &amp; 팀 제어 센터
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={loadData}
              disabled={loading}
              className="btn btn-ghost"
              style={{ padding: '8px 14px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
            >
              {loading ? '새로고침 중...' : '🔄 데이터 갱신'}
            </button>
            <button
              onClick={() => {
                if (confirm('브라우저에 저장된 모든 팀의 풀이 기록과 로컬 캐시를 완전히 초기화하시겠습니까?')) {
                  localStorage.clear();
                  sessionStorage.clear();
                  alert('모든 로컬 저장소 캐시가 초기화되었습니다.');
                  window.location.reload();
                }
              }}
              className="btn btn-ghost"
              style={{ padding: '8px 14px', fontSize: '13px', fontFamily: 'var(--font-mono)', color: 'var(--red)', borderColor: 'rgba(255, 59, 92, 0.3)' }}
              title="이 브라우저의 모든 팀 캐시와 진행 기록을 초기화합니다"
            >
              🗑️ 전체 로컬 캐시 초기화
            </button>
            <Link href="/" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
              🏠 학생 로비 보기
            </Link>
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              로그아웃
            </button>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div
          style={{
            maxWidth: '1240px',
            margin: '12px auto 0',
            display: 'flex',
            gap: '12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            paddingTop: '10px',
          }}
        >
          <button
            onClick={() => setActiveTab('teams')}
            className="btn"
            style={{
              padding: '8px 18px',
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              background: activeTab === 'teams' ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
              border: activeTab === 'teams' ? '1px solid var(--cyan)' : '1px solid transparent',
              color: activeTab === 'teams' ? 'var(--cyan)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'teams' ? 'var(--glow-cyan)' : 'none',
              borderRadius: '6px',
            }}
          >
            👥 참가팀 실시간 제어 및 현황 ({teams.length}개 팀)
          </button>

          <button
            onClick={() => setActiveTab('hints')}
            className="btn"
            style={{
              padding: '8px 18px',
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              background: activeTab === 'hints' ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
              border: activeTab === 'hints' ? '1px solid var(--purple)' : '1px solid transparent',
              color: activeTab === 'hints' ? 'var(--purple)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'hints' ? '0 0 15px rgba(168, 85, 247, 0.3)' : 'none',
              borderRadius: '6px',
            }}
          >
            🚀 맞춤 힌트 전송 &amp; 보관함 ({sentHints.length}건 발송)
          </button>
        </div>
      </header>

      {/* 대시보드 본문 */}
      <main
        style={{
          flex: 1,
          maxWidth: '1240px',
          width: '100%',
          margin: '0 auto',
          padding: '24px 20px',
        }}
      >
        {/* ==================================================== */}
        {/* TAB 1: 참가팀 실시간 관제 및 제어 (정지/삭제) */}
        {/* ==================================================== */}
        {activeTab === 'teams' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* KPI 요약 대시보드 카드 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '14px',
              }}
            >
              <div className="card" style={{ padding: '16px', borderColor: 'var(--border-subtle)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  전체 참가팀
                </div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {teams.length} <span style={{ fontSize: '14px', fontWeight: 600 }}>팀</span>
                </div>
              </div>

              <div className="card" style={{ padding: '16px', borderColor: 'rgba(0, 255, 102, 0.3)' }}>
                <div style={{ fontSize: '11px', color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                  🟢 정상 활동 중
                </div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--green)', marginTop: '4px' }}>
                  {activeCount} <span style={{ fontSize: '14px', fontWeight: 600 }}>팀</span>
                </div>
              </div>

              <div className="card" style={{ padding: '16px', borderColor: 'rgba(255, 59, 92, 0.3)' }}>
                <div style={{ fontSize: '11px', color: '#ff4d6d', fontFamily: 'var(--font-mono)' }}>
                  🔴 일시 정지됨
                </div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: '#ff4d6d', marginTop: '4px' }}>
                  {suspendedCount} <span style={{ fontSize: '14px', fontWeight: 600 }}>팀</span>
                </div>
              </div>

              <div className="card" style={{ padding: '16px', borderColor: 'rgba(0, 240, 255, 0.3)' }}>
                <div style={{ fontSize: '11px', color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                  🏆 STAGE 1 클리어
                </div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--cyan)', marginTop: '4px' }}>
                  {m1ClearedCount} <span style={{ fontSize: '14px', fontWeight: 600 }}>팀</span>
                </div>
              </div>

              <div className="card" style={{ padding: '16px', borderColor: 'rgba(168, 85, 247, 0.3)' }}>
                <div style={{ fontSize: '11px', color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>
                  👑 STAGE 2 클리어
                </div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--purple)', marginTop: '4px' }}>
                  {m2ClearedCount} <span style={{ fontSize: '14px', fontWeight: 600 }}>팀</span>
                </div>
              </div>
            </div>

            {/* 멘토 마스터 컨트롤: 전체 일시정지 및 전체 STAGE 2 일괄 전환 */}
            <div
              className="card-glass"
              style={{
                padding: '16px 20px',
                border: isGlobalSuspended ? '1px solid var(--red)' : '1px solid rgba(0, 240, 255, 0.3)',
                background: isGlobalSuspended ? 'rgba(255, 59, 92, 0.08)' : 'rgba(16, 26, 44, 0.8)',
                boxShadow: isGlobalSuspended ? '0 0 25px rgba(255, 59, 92, 0.25)' : 'var(--glow-cyan)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>⚡</span>
                  <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    마스터 전체 통제 프로토콜
                  </span>
                  {isGlobalSuspended && (
                    <span className="badge badge-red" style={{ fontSize: '11px', padding: '3px 8px' }}>
                      🚨 전체 팀 활동 일시 정지 중
                    </span>
                  )}
                  {globalStageAdvance === 2 && (
                    <span className="badge badge-purple" style={{ fontSize: '11px', padding: '3px 8px' }}>
                      🚀 STAGE 2 일괄 전환 명령 활성
                    </span>
                  )}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  수업 진행 속도 조절 및 비상 통제를 위해 모든 팀을 일괄 제어할 수 있습니다.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleToggleGlobalSuspend}
                  disabled={isGlobalProcessing}
                  className="btn"
                  style={{
                    padding: '9px 16px',
                    fontSize: '13px',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    background: isGlobalSuspended ? 'rgba(0, 255, 102, 0.2)' : 'rgba(255, 59, 92, 0.2)',
                    border: isGlobalSuspended ? '1px solid var(--green)' : '1px solid var(--red)',
                    color: isGlobalSuspended ? 'var(--green)' : '#ff4d6d',
                  }}
                >
                  {isGlobalSuspended ? '▶ 전체 참가팀 정지 해제' : '⏸ 전체 참가팀 일시 정지'}
                </button>

                <button
                  onClick={handleAdvanceAllToStage2}
                  disabled={isGlobalProcessing}
                  className="btn btn-primary"
                  style={{
                    padding: '9px 18px',
                    fontSize: '13px',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    boxShadow: 'var(--glow-purple)',
                  }}
                >
                  🚀 전체 팀 STAGE 2 일괄 전환
                </button>
              </div>
            </div>

            {/* 피드백 알림 배너 */}
            {teamNotice && (
              <div
                style={{
                  padding: '12px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  background:
                    teamNotice.type === 'success' ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 59, 92, 0.15)',
                  color: teamNotice.type === 'success' ? 'var(--green)' : 'var(--red)',
                  border: teamNotice.type === 'success' ? '1px solid var(--green)' : '1px solid var(--red)',
                }}
              >
                {teamNotice.message}
              </div>
            )}

            {/* 필터 & 검색 툴바 */}
            <div
              className="card-glass"
              style={{
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
                <span style={{ fontSize: '16px' }}>🔍</span>
                <input
                  type="text"
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  placeholder="참가팀 이름으로 실시간 검색..."
                  style={{
                    flex: 1,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => setTeamFilter('all')}
                  className="btn"
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    background: teamFilter === 'all' ? 'var(--cyan)' : 'rgba(255,255,255,0.05)',
                    color: teamFilter === 'all' ? '#050d1a' : 'var(--text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  전체 ({teams.length})
                </button>
                <button
                  onClick={() => setTeamFilter('active')}
                  className="btn"
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    background: teamFilter === 'active' ? 'var(--green)' : 'rgba(255,255,255,0.05)',
                    color: teamFilter === 'active' ? '#050d1a' : 'var(--text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  정상 활동 ({activeCount})
                </button>
                <button
                  onClick={() => setTeamFilter('suspended')}
                  className="btn"
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    background: teamFilter === 'suspended' ? 'var(--red)' : 'rgba(255,255,255,0.05)',
                    color: teamFilter === 'suspended' ? '#fff' : 'var(--text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  일시 정지 ({suspendedCount})
                </button>
              </div>
            </div>

            {/* 참가팀 목록 (그리드 카드 뷰) */}
            {filteredTeams.length === 0 ? (
              <div
                className="card"
                style={{
                  textAlign: 'center',
                  padding: '48px 24px',
                  color: 'var(--text-muted)',
                }}
              >
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🛡️</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  등록된 참가팀이 없습니다.
                </div>
                <p style={{ fontSize: '13px', marginTop: '6px', color: 'var(--text-secondary)' }}>
                  학생들이 메인 로비(/) 또는 미션 화면(/mission)에 팀 이름을 입력하고 입장하면 실시간으로 자동 등록됩니다.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                  gap: '16px',
                }}
              >
                {filteredTeams.map((team) => {
                  const isSuspended = team.status === 'suspended';
                  const isProcessing = processingTeam === team.teamName;

                  return (
                    <div
                      key={team.teamName}
                      className="card"
                      style={{
                        padding: '18px 20px',
                        border: isSuspended ? '1px solid var(--red)' : '1px solid var(--border-default)',
                        background: isSuspended ? 'rgba(255, 59, 92, 0.05)' : 'rgba(16, 26, 44, 0.6)',
                        boxShadow: isSuspended ? '0 0 20px rgba(255, 59, 92, 0.15)' : 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                      }}
                    >
                      {/* 카드 상단: 팀명 및 상태 배지 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            AGENT TEAM
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text-primary)' }}>
                            {team.teamName}
                          </div>
                        </div>

                        <div>
                          {isSuspended ? (
                            <span className="badge badge-red" style={{ fontSize: '11px', padding: '4px 10px' }}>
                              🔴 활동 정지됨
                            </span>
                          ) : (
                            <span className="badge badge-green" style={{ fontSize: '11px', padding: '4px 10px' }}>
                              🟢 정상 활동 중
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 진행 단계 뱃지들 */}
                      <div
                        style={{
                          background: 'rgba(0, 0, 0, 0.3)',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)' }}>STAGE 1 (암호 탈취):</span>
                          <span style={{ color: team.mission1Cleared ? 'var(--green)' : 'var(--cyan)', fontWeight: 700 }}>
                            {team.mission1Cleared ? '✅ MASTER KEY 확보' : '⏳ 진행 중'}
                            {team.stage1SecretCode && (
                              <span style={{ marginLeft: '6px', color: '#ffd166', background: 'rgba(255,209,102,0.12)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', border: '1px solid rgba(255,209,102,0.3)' }}>
                                KEY: {team.stage1SecretCode}
                              </span>
                            )}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)' }}>STAGE 2 (규칙 충돌):</span>
                          <span
                            style={{
                              color: team.mission2Cleared
                                ? 'var(--green)'
                                : team.stage2Sub1Cleared || team.stage2Sub2Cleared || team.stage2Sub3Cleared
                                ? 'var(--cyan)'
                                : team.mission1Cleared
                                ? 'var(--cyan)'
                                : 'var(--text-muted)',
                              fontWeight: 700,
                            }}
                          >
                            {team.mission2Cleared
                              ? '✅ 전체 3개 서브 클리어'
                              : (team.stage2Sub1Cleared ? 1 : 0) + (team.stage2Sub2Cleared ? 1 : 0) + (team.stage2Sub3Cleared ? 1 : 0) > 0
                              ? `⚡ ${(team.stage2Sub1Cleared ? 1 : 0) + (team.stage2Sub2Cleared ? 1 : 0) + (team.stage2Sub3Cleared ? 1 : 0)}/3 완료`
                              : team.mission1Cleared
                              ? '⏳ 공격 분석 중'
                              : '🔒 대기'}
                          </span>
                        </div>
                        {/* STAGE 2 세분화 3대 서브 미션 뱃지 */}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: team.stage2Sub1Cleared ? 'rgba(0,255,102,0.15)' : 'rgba(255,255,255,0.05)', color: team.stage2Sub1Cleared ? 'var(--green)' : 'var(--text-muted)', border: team.stage2Sub1Cleared ? '1px solid var(--green)' : '1px solid transparent' }}>
                            2-1 냉각: {team.stage2Sub1Cleared ? '✅' : '⏳'}
                          </span>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: team.stage2Sub2Cleared ? 'rgba(0,255,102,0.15)' : 'rgba(255,255,255,0.05)', color: team.stage2Sub2Cleared ? 'var(--green)' : 'var(--text-muted)', border: team.stage2Sub2Cleared ? '1px solid var(--green)' : '1px solid transparent' }}>
                            2-2 방화벽: {team.stage2Sub2Cleared ? '✅' : '⏳'}
                          </span>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: team.stage2Sub3Cleared ? 'rgba(0,255,102,0.15)' : 'rgba(255,255,255,0.05)', color: team.stage2Sub3Cleared ? 'var(--green)' : 'var(--text-muted)', border: team.stage2Sub3Cleared ? '1px solid var(--green)' : '1px solid transparent' }}>
                            2-3 코어: {team.stage2Sub3Cleared ? '✅' : '⏳'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>시도 횟수:</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                            {team.turnCount}회 공격 패킷 발송
                          </span>
                        </div>
                        {team.isCoolingDown && (
                          <div
                            style={{
                              padding: '6px 10px',
                              borderRadius: '6px',
                              background: 'rgba(255, 59, 92, 0.15)',
                              border: '1px solid var(--red)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '11px',
                              color: 'var(--red)',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                            }}
                          >
                            <span className="pulse-dot pulse-dot-red" style={{ width: '6px', height: '6px' }} />
                            <span>⚠️ {team.cooldownNotice || '10회 질문 초과 (1분 냉각 대기 중)'}</span>
                          </div>
                        )}
                      </div>

                      {/* 하단 액션 버튼 그룹 */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
                        {/* 정지 / 재개 버튼 */}
                        <button
                          onClick={() => handleToggleSuspendTeam(team)}
                          disabled={isProcessing}
                          className="btn"
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            fontSize: '12px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            background: isSuspended ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 59, 92, 0.15)',
                            border: isSuspended ? '1px solid var(--green)' : '1px solid var(--red)',
                            color: isSuspended ? 'var(--green)' : 'var(--red)',
                          }}
                        >
                          {isSuspended ? '▶ 정지 해제' : '⏸ 일시 정지'}
                        </button>

                        {/* 힌트 바로 보내기 버튼 */}
                        <button
                          onClick={() => handleQuickHintToTeam(team.teamName)}
                          className="btn btn-secondary"
                          style={{
                            padding: '8px 12px',
                            fontSize: '12px',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          💬 힌트 전송
                        </button>

                        {/* 팀 삭제 버튼 */}
                        <button
                          onClick={() => handleDeleteTeam(team.teamName)}
                          disabled={isProcessing}
                          style={{
                            padding: '8px 12px',
                            fontSize: '12px',
                            fontFamily: 'var(--font-mono)',
                            background: 'transparent',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-muted)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                        >
                          🗑 삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: 맞춤 힌트 전송 및 보관함 (기존 힌트 도구) */}
        {/* ==================================================== */}
        {activeTab === 'hints' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '24px',
              alignItems: 'start',
            }}
          >
            {/* 좌측 패널: 팀별 맞춤 힌트 전송 폼 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="card" style={{ borderColor: 'var(--cyan)', boxShadow: 'var(--glow-cyan)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '20px' }}>🚀</span>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                    참가팀에게 맞춤 힌트 전송
                  </h2>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                  어려움을 겪고 있는 특정 학생 팀을 선택하고 보관함의 힌트를 골라 실시간으로 전송하세요.
                </p>

                <form onSubmit={handleSendHintToTeam} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* 대상 팀명 입력 & 빠른 선택 드롭다운 */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--cyan)' }}>
                        대상 참가팀 이름:
                      </label>
                      {activeTeams.length > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          최근 팀: {activeTeams.slice(0, 3).join(', ')}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={targetTeam}
                        onChange={(e) => setTargetTeam(e.target.value)}
                        placeholder="예: 사이버방패 1조 (정확한 팀명)"
                        style={{
                          flex: 1,
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border-default)',
                          borderRadius: '6px',
                          padding: '10px 14px',
                          color: 'var(--text-primary)',
                          fontSize: '14px',
                          outline: 'none',
                        }}
                      />
                      {activeTeams.length > 0 && (
                        <select
                          onChange={(e) => e.target.value && setTargetTeam(e.target.value)}
                          value=""
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            color: 'var(--text-secondary)',
                            fontSize: '13px',
                            padding: '0 10px',
                          }}
                        >
                          <option value="">팀 선택</option>
                          {activeTeams.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* 힌트 제목 */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                      힌트 제목:
                    </label>
                    <input
                      type="text"
                      value={customHintTitle}
                      onChange={(e) => setCustomHintTitle(e.target.value)}
                      placeholder="예: [멘토 힌트] 가상 시나리오를 활용해 보세요"
                      style={{
                        width: '100%',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* 힌트 상세 내용 */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                      학생 화면에 보일 힌트 내용:
                    </label>
                    <textarea
                      value={customHintContent}
                      onChange={(e) => setCustomHintContent(e.target.value)}
                      rows={4}
                      placeholder="우측 힌트 보관함에서 카드를 선택하거나 직접 조언을 작성하세요..."
                      style={{
                        width: '100%',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-default)',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        lineHeight: '1.5',
                        resize: 'vertical',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* 피드백 메시지 */}
                  {actionNotice && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        background:
                          actionNotice.type === 'success' ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 59, 92, 0.15)',
                        color: actionNotice.type === 'success' ? 'var(--green)' : 'var(--red)',
                        border:
                          actionNotice.type === 'success' ? '1px solid var(--green)' : '1px solid var(--red)',
                      }}
                    >
                      {actionNotice.message}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSending || !targetTeam.trim()}
                    className="btn btn-primary"
                    style={{ padding: '12px', fontSize: '15px', marginTop: '4px' }}
                  >
                    {isSending ? '전송 중...' : `🚀 [${targetTeam.trim() || '지정 팀'}]에게 힌트 전송`}
                  </button>
                </form>
              </div>

              {/* 발송 이력 및 실시간 현황 */}
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>📋</span>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>
                      실시간 발송 이력 ({sentHints.length}건)
                    </h3>
                  </div>
                  <button
                    onClick={loadData}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--cyan)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    새로고침 🔄
                  </button>
                </div>

                {sentHints.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                    아직 전송된 힌트가 없습니다.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
                    {sentHints.map((sent) => (
                      <div
                        key={sent.id}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '8px',
                          padding: '12px 14px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span className="badge badge-cyan" style={{ fontSize: '11px' }}>
                            팀: {sent.teamName}
                          </span>
                          <button
                            onClick={() => handleDeleteSentHint(sent.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--red)',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            회수 ✕
                          </button>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {sent.hintTitle}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          {sent.hintContent}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                          발송: {new Date(sent.sentAt).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 우측 패널: 힌트 보관함 (Library) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>📚</span>
                      <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                        힌트 보관함 (Hint Library)
                      </h2>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                      원하는 힌트의 <strong>[발송 선택]</strong>을 누르면 좌측 입력창에 자동 장착됩니다.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowAddModal(true)}
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 14px' }}
                  >
                    ➕ 새 힌트 추가
                  </button>
                </div>

                {/* 보관함 힌트 카드 리스트 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {libraryHints.map((hint) => {
                    const isCurrent = selectedHintId === hint.id;
                    return (
                      <div
                        key={hint.id}
                        style={{
                          padding: '14px 16px',
                          borderRadius: '8px',
                          border: isCurrent ? '2px solid var(--cyan)' : '1px solid var(--border-subtle)',
                          background: isCurrent ? 'rgba(0, 200, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                            {hint.category}
                          </span>
                          <button
                            onClick={() => handleSelectHintFromLibrary(hint)}
                            className="btn btn-primary"
                            style={{
                              padding: '4px 12px',
                              fontSize: '11px',
                              background: isCurrent ? 'var(--cyan)' : undefined,
                              color: isCurrent ? '#050d1a' : undefined,
                            }}
                          >
                            {isCurrent ? '선택됨 ✓' : '발송 선택 ➡️'}
                          </button>
                        </div>

                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {hint.title}
                        </div>

                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {hint.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 새 힌트 추가 모달 */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div className="card" style={{ maxWidth: '480px', width: '100%', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px' }}>
              ➕ 힌트 보관함에 새 힌트 등록
            </h3>

            <form onSubmit={handleCreateLibraryHint} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  힌트 분류:
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                >
                  <option value="미션 1 공격">미션 1: 공격 (프롬프트 인젝션)</option>
                  <option value="미션 2 방어">미션 2: 보안 규칙 상충/조합</option>
                  <option value="일반 조언">일반 AI 원리 및 팁</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  힌트 제목:
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 역할극(Roleplay) 침투 기법"
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  힌트 내용:
                </label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                  placeholder="학생들에게 안내할 힌트 문구를 입력하세요..."
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-ghost"
                  style={{ fontSize: '13px' }}
                >
                  취소
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontSize: '13px' }}>
                  보관함에 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
