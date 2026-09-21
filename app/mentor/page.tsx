'use client';

// ============================================================
// app/mentor/page.tsx — 멘토 전용 관제 및 팀별 힌트 전송 대시보드
//
// 비밀번호: 0918
// 기능:
//   1. 0918 비밀번호 인증 게이트
//   2. 힌트 보관함(Library) 관리 (추천 프리셋 + 멘토 직접 작성)
//   3. 참가팀(멘티) 선택 및 맞춤 힌트 실시간 전송
//   4. 팀별 발송된 힌트 이력 모니터링 및 회수
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { LibraryHint, SentHint } from '@/app/api/mentor/hints/route';

const MENTOR_PASSWORD = '0918';

export default function MentorPage() {
  // 인증 상태
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

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

  // 인증 상태 복원
  useEffect(() => {
    const saved = sessionStorage.getItem('mentor_auth');
    if (saved === MENTOR_PASSWORD) {
      setIsAuthenticated(true);
    }
  }, []);

  // 데이터 로드
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/mentor/hints');
      const data = await res.json();
      if (res.ok) {
        setLibraryHints(data.library || []);
        setSentHints(data.sent || []);
        setActiveTeams(data.activeTeams || []);
      }
    } catch {
      // 무시
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
      const timer = setInterval(loadData, 5000); // 5초 주기 갱신
      return () => clearInterval(timer);
    }
  }, [isAuthenticated, loadData]);

  // 인증 처리
  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (passwordInput.trim() === MENTOR_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('mentor_auth', MENTOR_PASSWORD);
      setAuthError('');
    } else {
      setAuthError('비밀번호가 일치하지 않습니다. (힌트: 0918)');
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('mentor_auth');
    setIsAuthenticated(false);
    setPasswordInput('');
  }

  // 힌트 선택 시 폼에 채우기
  function handleSelectHintFromLibrary(hint: LibraryHint) {
    setSelectedHintId(hint.id);
    setCustomHintTitle(hint.title);
    setCustomHintContent(hint.content);
    setActionNotice(null);
  }

  // 힌트 발송
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

  // 새 보관함 힌트 등록
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

  // 발송된 힌트 회수
  async function handleDeleteSentHint(sentHintId: string) {
    if (!confirm('이 힌트 전송을 회수하시겠습니까? 학생 화면에서도 제거됩니다.')) return;
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

  // ------------------------------------------------------------
  // 1. 미인증 시: 비밀번호 입력 화면
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
              placeholder="비밀번호 입력 (0918)"
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
  // 2. 인증 완료 시: 멘토 관제 대시보드
  // ------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(10, 22, 40, 0.9)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          padding: '14px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
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
                  멘토 전용 모드
                </span>
                <span style={{ fontSize: '12px', color: 'var(--green)' }}>● 실시간 관제 중</span>
              </div>
              <h1 style={{ fontSize: '18px', fontWeight: 900, margin: '2px 0 0' }}>
                2실 AI 보안 통제실 멘토 지원 대시보드
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }}>
              🏠 학생 화면 보기
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
      </header>

      {/* 대시보드 본문 */}
      <main
        style={{
          flex: 1,
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          padding: '24px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* ==================================================== */}
        {/* 좌측 패널: 팀별 맞춤 힌트 전송 컨트롤러 */}
        {/* ==================================================== */}
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

        {/* ==================================================== */}
        {/* 우측 패널: 힌트 보관함 (Library) */}
        {/* ==================================================== */}
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
      </main>

      {/* ---------------------------------------------------- */}
      {/* 새 힌트 추가 모달 */}
      {/* ---------------------------------------------------- */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="card animate-scale-in"
            style={{
              maxWidth: '520px',
              width: '100%',
              padding: '28px',
              borderColor: 'var(--border-strong)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>➕ 보관함에 새 힌트 등록</h3>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLibraryHint} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  구분 카테고리:
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
                  <option value="미션 1 공격">미션 1 공격 힌트</option>
                  <option value="미션 2 방어">미션 2 방어 규칙 힌트</option>
                  <option value="자율 힌트">일반/자율 힌트</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  힌트 제목:
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 영어 번역 인코딩 우회 힌트"
                  required
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  힌트 상세 내용:
                </label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                  placeholder="학생들에게 전달할 힌트 문구를 입력하세요..."
                  required
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 18px', fontSize: '13px' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '8px 20px', fontSize: '13px' }}
                >
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
