'use client';

// ============================================================
// app/admin/dashboard/page.tsx — 관리자 대시보드
//
// 기능:
//   - 게임 설정 패널 (최대 시도 횟수, 난이도, 비밀 코드 수정/랜덤 생성, 게임 활성화, 비밀번호 변경)
//   - Supabase Realtime으로 학생 시도 실시간 모니터링
//   - 팀별 진행 현황 요약 테이블
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase';
import type { GameConfig, AttemptRow, Difficulty } from '@/lib/types';
import { DEFAULT_STAGE1_CODE, DEFAULT_STAGE2_CODE } from '@/lib/stagePrompts';

// ----------------------------------------------------------
// 난이도 옵션
// ----------------------------------------------------------

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: '쉬움' },
  { value: 'medium', label: '보통' },
  { value: 'hard', label: '어려움' },
];

// ----------------------------------------------------------
// 비밀 코드 무작위 생성 헬퍼
// ----------------------------------------------------------

function generateRandomCode(): string {
  const words = ['NOVA', 'ZENITH', 'APEX', 'CIPHER', 'MATRIX', 'VECTOR', 'TITAN', 'NEXUS', 'SHADOW', 'QUANTUM'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${num}`;
}

// ----------------------------------------------------------
// 팀 통계 집계 헬퍼
// ----------------------------------------------------------

interface TeamStat {
  teamName: string;
  stage1: { attempts: number; success: boolean };
  stage2: { attempts: number; success: boolean };
  totalAttempts: number;
}

function aggregateTeamStats(attempts: AttemptRow[]): TeamStat[] {
  const map = new Map<string, TeamStat>();

  for (const a of attempts) {
    if (!map.has(a.team_name)) {
      map.set(a.team_name, {
        teamName: a.team_name,
        stage1: { attempts: 0, success: false },
        stage2: { attempts: 0, success: false },
        totalAttempts: 0,
      });
    }
    const stat = map.get(a.team_name)!;
    stat.totalAttempts += 1;

    if (a.stage === 1) {
      stat.stage1.attempts += 1;
      if (a.success) stat.stage1.success = true;
    } else if (a.stage === 2) {
      stat.stage2.attempts += 1;
      if (a.success) stat.stage2.success = true;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalAttempts - a.totalAttempts);
}

// ----------------------------------------------------------
// 메인 컴포넌트
// ----------------------------------------------------------

export default function AdminDashboard() {
  const router = useRouter();

  // 설정 상태
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // 편집용 로컬 상태
  const [editMaxAttempts, setEditMaxAttempts] = useState<number>(10);
  const [editStage1Diff, setEditStage1Diff] = useState<Difficulty>('easy');
  const [editStage2Diff, setEditStage2Diff] = useState<Difficulty>('medium');
  const [editStage1Code, setEditStage1Code] = useState<string>(DEFAULT_STAGE1_CODE);
  const [editStage2Code, setEditStage2Code] = useState<string>(DEFAULT_STAGE2_CODE);
  const [editGameActive, setEditGameActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // 시도 기록 상태
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'config' | 'monitor' | 'teams'>('config');

  // ----------------------------------------------------------
  // 인증 확인 & 데이터 로드
  // ----------------------------------------------------------

  const loadConfig = useCallback(async () => {
    const res = await fetch('/api/admin/config');
    if (res.status === 401) {
      router.replace('/admin');
      return;
    }
    if (res.ok) {
      const data: GameConfig = await res.json();
      setConfig(data);
      setEditMaxAttempts(data.maxAttempts);
      setEditStage1Diff(data.stage1Difficulty);
      setEditStage2Diff(data.stage2Difficulty);
      setEditStage1Code(data.stage1SecretCode || DEFAULT_STAGE1_CODE);
      setEditStage2Code(data.stage2SecretCode || DEFAULT_STAGE2_CODE);
      setEditGameActive(data.isGameActive);
    }
    setConfigLoading(false);
  }, [router]);

  const loadAttempts = useCallback(async () => {
    const supabase = createBrowserSupabase();
    const { data } = await supabase
      .from('attempts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (data) setAttempts(data as AttemptRow[]);
    setAttemptsLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
    loadAttempts();

    // Realtime: 새 시도 실시간 수신
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel('admin_attempts_feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attempts' },
        (payload) => {
          const newAttempt = payload.new as AttemptRow;
          setAttempts((prev) => [newAttempt, ...prev].slice(0, 200));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadConfig, loadAttempts]);

  // ----------------------------------------------------------
  // 설정 저장
  // ----------------------------------------------------------

  async function handleSave() {
    setSaving(true);
    setSaveMessage('');

    const body: Record<string, unknown> = {
      maxAttempts: editMaxAttempts,
      stage1Difficulty: editStage1Diff,
      stage2Difficulty: editStage2Diff,
      stage1SecretCode: editStage1Code.trim().toUpperCase(),
      stage2SecretCode: editStage2Code.trim().toUpperCase(),
      isGameActive: editGameActive,
    };

    if (newPassword.trim()) {
      body.newPassword = newPassword.trim();
    }

    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      router.replace('/admin');
      return;
    }

    if (res.ok) {
      const data: GameConfig = await res.json();
      setConfig(data);
      setNewPassword('');
      setSaveMessage('✓ 설정이 저장되었습니다. 학생 기기에 즉시 반영됩니다.');
    } else {
      const err = await res.json();
      setSaveMessage(`⚠ 오류: ${err.error}`);
    }

    setSaving(false);
    setTimeout(() => setSaveMessage(''), 4000);
  }

  // ----------------------------------------------------------
  // 로그아웃
  // ----------------------------------------------------------

  async function handleLogout() {
    await fetch('/api/admin/login', { method: 'DELETE' });
    router.push('/admin');
  }

  // ----------------------------------------------------------
  // 로딩
  // ----------------------------------------------------------

  if (configLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: '36px', height: '36px', borderWidth: '3px' }} />
      </div>
    );
  }

  const teamStats = aggregateTeamStats(attempts);

  // ----------------------------------------------------------
  // 렌더
  // ----------------------------------------------------------

  return (
    <main style={{ minHeight: '100vh', maxWidth: '1000px', margin: '0 auto', padding: '24px 16px' }}>

      {/* 헤더 */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '28px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600 }} className="text-muted">ADMIN DASHBOARD</div>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900 }} className="gradient-text-cyan">
            🎮 AI 레드팀 챌린지 관리
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* 게임 상태 뱃지 */}
          <span className={`badge ${config?.isGameActive ? 'badge-green' : 'badge-red'}`}>
            <span className="animate-glow-pulse">●</span>
            {config?.isGameActive ? '게임 활성' : '게임 비활성'}
          </span>
          <button className="btn btn-ghost" style={{ fontSize: '13px' }} onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <nav
        style={{
          display: 'flex',
          gap: '4px',
          background: 'rgba(0,0,0,0.3)',
          padding: '4px',
          borderRadius: '12px',
          marginBottom: '24px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {([
          { key: 'config', label: '⚙️ 게임 설정' },
          { key: 'monitor', label: '📡 실시간 모니터' },
          { key: 'teams', label: '👥 팀 현황' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            className={activeTab === tab.key ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ flex: 1, fontSize: '13px', padding: '8px 12px' }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* === 탭: 게임 설정 === */}
      {activeTab === 'config' && (
        <div style={{ display: 'grid', gap: '20px' }}>

          {/* 최대 시도 횟수 */}
          <div className="card">
            <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 700 }} className="text-cyan">
              🎯 최대 시도 횟수
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <input
                type="range"
                min={1}
                max={30}
                value={editMaxAttempts}
                onChange={(e) => setEditMaxAttempts(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--cyan)' }}
              />
              <div
                style={{
                  minWidth: '60px',
                  textAlign: 'center',
                  fontSize: '28px',
                  fontWeight: 900,
                }}
                className="text-cyan"
              >
                {editMaxAttempts}
              </div>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '12px' }} className="text-muted">
              모든 학생 기기에 즉시 반영됩니다
            </p>
          </div>

          {/* AI 비밀 코드(정답) 설정 */}
          <div className="card">
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }} className="text-cyan">
              🗝️ AI 비밀 코드 (정답 설정)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* 스테이지 1 코드 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Stage 1 비밀 코드 🛡️</label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                    onClick={() => setEditStage1Code(generateRandomCode())}
                  >
                    🎲 랜덤 생성
                  </button>
                </div>
                <input
                  className="input text-mono"
                  type="text"
                  placeholder="예: NOVA-3391"
                  value={editStage1Code}
                  onChange={(e) => setEditStage1Code(e.target.value)}
                />
              </div>

              {/* 스테이지 2 코드 */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Stage 2 기밀 코드 🔐</label>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                    onClick={() => setEditStage2Code(generateRandomCode())}
                  >
                    🎲 랜덤 생성
                  </button>
                </div>
                <input
                  className="input text-mono"
                  type="text"
                  placeholder="예: ZENITH-7742"
                  value={editStage2Code}
                  onChange={(e) => setEditStage2Code(e.target.value)}
                />
              </div>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '12px' }} className="text-muted">
              비밀 코드를 변경하면 AI 시스템 프롬프트 및 정답 판정 기준이 즉시 갱신됩니다.
            </p>
          </div>

          {/* 스테이지 난이도 */}
          <div className="card">
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px' }} className="text-cyan">
              🔒 스테이지 난이도
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* 스테이지 1 */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>
                  스테이지 1 — 수문장 🛡️
                </label>
                <select
                  className="select"
                  style={{ width: '100%' }}
                  value={editStage1Diff}
                  onChange={(e) => setEditStage1Diff(e.target.value as Difficulty)}
                >
                  {DIFFICULTY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {/* 스테이지 2 */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>
                  스테이지 2 — 철벽 요원 🔐
                </label>
                <select
                  className="select"
                  style={{ width: '100%' }}
                  value={editStage2Diff}
                  onChange={(e) => setEditStage2Diff(e.target.value as Difficulty)}
                >
                  {DIFFICULTY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 게임 활성화 토글 */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }} className="text-cyan">
                ⚡ 게임 활성화
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }} className="text-muted">
                비활성화하면 학생들이 스테이지에 진입할 수 없습니다
              </p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={editGameActive}
                onChange={(e) => setEditGameActive(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* 비밀번호 변경 */}
          <div className="card">
            <label style={{ display: 'block', marginBottom: '12px', fontSize: '14px', fontWeight: 700 }} className="text-cyan">
              🔑 관리자 비밀번호 변경
            </label>
            <input
              className="input"
              type="password"
              placeholder="새 비밀번호 (비워두면 변경 안 함)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p style={{ margin: '8px 0 0', fontSize: '12px' }} className="text-muted">
              4자 이상 입력하세요
            </p>
          </div>

          {/* 저장 버튼 */}
          <div>
            {saveMessage && (
              <p
                style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}
                className={saveMessage.startsWith('✓') ? 'text-green' : 'text-red'}
              >
                {saveMessage}
              </p>
            )}
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '14px' }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <div className="spinner" />
                  저장 중...
                </>
              ) : (
                '💾 설정 저장 및 적용'
              )}
            </button>
          </div>
        </div>
      )}

      {/* === 탭: 실시간 모니터 === */}
      {activeTab === 'monitor' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="animate-glow-pulse text-green">●</span>
              <span style={{ fontSize: '14px', fontWeight: 600 }}>실시간 시도 피드</span>
            </div>
            <span className="badge badge-cyan">{attempts.length}건</span>
          </div>

          {attemptsLoading ? (
            <div style={{ textAlign: 'center', padding: '48px' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : attempts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
              <p className="text-muted">아직 시도가 없습니다. 학생들의 도전을 기다리세요!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '600px', overflowY: 'auto' }}>
              {attempts.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                    background: a.success ? 'rgba(0, 255, 136, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${a.success ? 'rgba(0, 255, 136, 0.25)' : 'var(--border-subtle)'}`,
                    borderRadius: '10px',
                    padding: '12px 14px',
                    fontSize: '13px',
                  }}
                >
                  <span style={{ flexShrink: 0, fontSize: '16px' }}>
                    {a.success ? '🔓' : '🔒'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
                      <span style={{ fontWeight: 700 }}>{a.team_name}</span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span className="badge badge-cyan">Stage {a.stage}</span>
                        <span style={{ fontSize: '11px' }} className="text-muted">#{a.turn_number}번째</span>
                        {a.success && <span className="badge badge-green">성공</span>}
                      </div>
                    </div>
                    <p style={{ margin: '0 0 4px', color: 'var(--text-secondary)' }}>
                      👤 {a.prompt_text.length > 80 ? a.prompt_text.slice(0, 80) + '...' : a.prompt_text}
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                      🤖 {a.ai_response.length > 100 ? a.ai_response.slice(0, 100) + '...' : a.ai_response}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '11px' }} className="text-muted">
                      {new Date(a.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === 탭: 팀 현황 === */}
      {activeTab === 'teams' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>팀별 진행 현황</span>
            <span className="badge badge-cyan">{teamStats.length}팀</span>
          </div>

          {attemptsLoading ? (
            <div style={{ textAlign: 'center', padding: '48px' }}>
              <div className="spinner" style={{ margin: '0 auto' }} />
            </div>
          ) : teamStats.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
              <p className="text-muted">아직 참가한 팀이 없습니다.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr>
                    {['팀 이름', 'Stage 1', 'Stage 2', '총 시도'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                        className="text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamStats.map((ts) => (
                    <tr key={ts.teamName} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>{ts.teamName}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`badge ${ts.stage1.success ? 'badge-green' : ts.stage1.attempts > 0 ? 'badge-yellow' : 'badge-cyan'}`}>
                            {ts.stage1.success ? '✓ 성공' : ts.stage1.attempts > 0 ? `${ts.stage1.attempts}회 시도` : '미진입'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className={`badge ${ts.stage2.success ? 'badge-green' : ts.stage2.attempts > 0 ? 'badge-yellow' : 'badge-cyan'}`}>
                            {ts.stage2.success ? '✓ 성공' : ts.stage2.attempts > 0 ? `${ts.stage2.attempts}회 시도` : '미진입'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 700 }} className="text-cyan">
                        {ts.totalAttempts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
