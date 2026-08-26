'use client';

// ============================================================
// app/page.tsx — 시작화면
//
// 기능:
//   - 팀 이름 입력 (localStorage 저장)
//   - Supabase Realtime으로 game_config 구독
//     → 관리자가 설정 변경 시 최대 시도 횟수 즉시 반영
//   - 2개 스테이지 카드 표시
//   - 방어 활동 진입
// ============================================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase';
import { STAGES } from '@/lib/stagePrompts';
import type { GameConfigRow } from '@/lib/types';

// ----------------------------------------------------------
// 메인 컴포넌트
// ----------------------------------------------------------

export default function HomePage() {
  const router = useRouter();

  // 상태
  const [teamName, setTeamName] = useState('');
  const [gameConfig, setGameConfig] = useState<GameConfigRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  // 완료된 스테이지 (localStorage)
  const [completedStages, setCompletedStages] = useState<number[]>([]);

  // ----------------------------------------------------------
  // 초기 데이터 로드
  // ----------------------------------------------------------

  useEffect(() => {
    const supabase = createBrowserSupabase();

    // localStorage에서 팀 이름 복원
    const savedTeam = localStorage.getItem('teamName');
    if (savedTeam) setTeamName(savedTeam);

    // 완료된 스테이지 복원
    const savedCompleted = localStorage.getItem('completedStages');
    if (savedCompleted) {
      try {
        setCompletedStages(JSON.parse(savedCompleted));
      } catch {
        // 무시
      }
    }

    // game_config 초기 로드
    supabase
      .from('game_config')
      .select('*')
      .eq('id', 1)
      .single<GameConfigRow>()
      .then(({ data, error }) => {
        if (!error && data) setGameConfig(data);
        setLoading(false);
      });

    // Realtime 구독 — 관리자 설정 변경 실시간 반영
    const channel = supabase
      .channel('game_config_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_config', filter: 'id=eq.1' },
        (payload) => {
          setGameConfig(payload.new as GameConfigRow);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ----------------------------------------------------------
  // 스테이지 시작
  // ----------------------------------------------------------

  function handleStart(stageId: number) {
    if (!teamName.trim()) {
      setError('팀 이름을 입력해주세요.');
      return;
    }
    setError('');
    setStarting(true);
    localStorage.setItem('teamName', teamName.trim());
    router.push(`/stage/${stageId}`);
  }

  // ----------------------------------------------------------
  // 방어 활동
  // ----------------------------------------------------------

  function handleDefense() {
    if (!teamName.trim()) {
      setError('팀 이름을 입력해주세요.');
      return;
    }
    localStorage.setItem('teamName', teamName.trim());
    router.push('/defense');
  }

  // ----------------------------------------------------------
  // 스테이지 카드
  // ----------------------------------------------------------

  const difficultyLabel = (d: string) =>
    d === 'easy' ? '쉬움' : d === 'medium' ? '보통' : '어려움';

  const difficultyColor = (d: string) =>
    d === 'easy' ? 'badge-green' : d === 'medium' ? 'badge-yellow' : 'badge-red';

  function getStageDifficulty(stageId: number): string {
    if (!gameConfig) return 'easy';
    return stageId === 1 ? gameConfig.stage1_difficulty : gameConfig.stage2_difficulty;
  }

  // ----------------------------------------------------------
  // 렌더
  // ----------------------------------------------------------

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        gap: '40px',
      }}
    >
      {/* 헤더 */}
      <header style={{ textAlign: 'center' }} className="animate-fade-in-up">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(0, 200, 255, 0.08)',
            border: '1px solid rgba(0, 200, 255, 0.25)',
            borderRadius: '999px',
            padding: '6px 18px',
            marginBottom: '20px',
            fontSize: '13px',
          }}
          className="text-cyan"
        >
          <span className="animate-glow-pulse">●</span>
          AI 보안 교육 플랫폼
        </div>

        <h1
          style={{ fontSize: '48px', fontWeight: 900, margin: 0, lineHeight: 1.1 }}
          className="gradient-text-cyan"
        >
          AI 레드팀 챌린지
        </h1>
        <p style={{ marginTop: '12px', fontSize: '16px' }} className="text-secondary">
          AI의 방어를 뚫어라! 프롬프트 인젝션을 직접 체험해보세요.
        </p>
      </header>

      {/* 팀 이름 입력 카드 */}
      <div
        className="card animate-fade-in-up delay-100"
        style={{ width: '100%', maxWidth: '480px' }}
      >
        <label
          style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}
          className="text-cyan"
        >
          팀 이름
        </label>
        <input
          className="input"
          type="text"
          placeholder="예: 해킹왕팀, 사이버전사 ..."
          value={teamName}
          onChange={(e) => {
            setTeamName(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleStart(1)}
          maxLength={30}
        />
        {error && (
          <p style={{ marginTop: '8px', fontSize: '13px' }} className="text-red animate-shake">
            ⚠ {error}
          </p>
        )}

        {/* 현재 최대 시도 횟수 표시 */}
        {!loading && gameConfig && (
          <div
            style={{
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
            }}
            className="text-secondary"
          >
            <span>🎯 스테이지당 최대 시도:</span>
            <span className="text-cyan" style={{ fontWeight: 700 }}>
              {gameConfig.max_attempts}회
            </span>
            {!gameConfig.is_game_active && (
              <span className="badge badge-red">게임 비활성화</span>
            )}
          </div>
        )}
        {loading && (
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className="spinner" style={{ width: '14px', height: '14px' }} />
            <span style={{ fontSize: '13px' }} className="text-muted">
              설정 불러오는 중...
            </span>
          </div>
        )}
      </div>

      {/* 스테이지 카드 목록 */}
      <section
        style={{
          width: '100%',
          maxWidth: '800px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {STAGES.map((stage, index) => {
          const difficulty = getStageDifficulty(stage.id);
          const isCompleted = completedStages.includes(stage.id);
          const isLocked = !gameConfig?.is_game_active && !isCompleted;

          return (
            <div
              key={stage.id}
              className={`card card-glow animate-fade-in-up delay-${(index + 2) * 100}`}
              style={{
                opacity: isLocked ? 0.5 : 1,
                cursor: isLocked ? 'not-allowed' : 'default',
              }}
            >
              {/* 스테이지 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '28px' }}>{stage.emoji}</span>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600 }} className="text-muted">
                      STAGE {stage.id}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{stage.title}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <span className={`badge ${difficultyColor(difficulty)}`}>
                    {difficultyLabel(difficulty)}
                  </span>
                  {isCompleted && (
                    <span className="badge badge-green">✓ 완료</span>
                  )}
                </div>
              </div>

              {/* 설명 */}
              <p style={{ fontSize: '14px', margin: '0 0 16px' }} className="text-secondary">
                {stage.description}
              </p>

              {/* 비밀 코드 힌트 */}
              <div
                style={{
                  background: 'rgba(0, 200, 255, 0.05)',
                  border: '1px solid rgba(0, 200, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '16px',
                  fontSize: '13px',
                }}
              >
                <span className="text-muted">비밀 코드 형식: </span>
                <span className="text-mono text-cyan">
                  {stage.secretCode.replace(/[A-Z0-9]/g, '?')}
                </span>
              </div>

              {/* 시작 버튼 */}
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={isLocked || starting}
                onClick={() => handleStart(stage.id)}
              >
                {starting ? (
                  <>
                    <div className="spinner" />
                    이동 중...
                  </>
                ) : isCompleted ? (
                  '🔄 다시 도전'
                ) : (
                  '🚀 도전 시작'
                )}
              </button>
            </div>
          );
        })}
      </section>

      {/* 방어 활동 카드 */}
      <div
        className="card animate-fade-in-up delay-400"
        style={{ width: '100%', maxWidth: '800px', borderColor: 'rgba(168, 85, 247, 0.25)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '32px' }}>🧱</span>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600 }} className="text-muted">ACTIVITY 2</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>방어 프롬프트 작성</div>
              <p style={{ margin: '4px 0 0', fontSize: '14px' }} className="text-secondary">
                이번엔 내가 AI를 지켜라! 직접 시스템 프롬프트를 작성하고 공격을 막아보세요.
              </p>
            </div>
          </div>
          <button className="btn btn-outline" onClick={handleDefense}>
            ✏️ 작성하기
          </button>
        </div>
      </div>

      {/* 푸터 */}
      <footer style={{ textAlign: 'center', fontSize: '12px', paddingBottom: '24px' }} className="text-muted">
        <a href="/admin" style={{ color: 'inherit', textDecoration: 'none', opacity: 0.5 }}>
          관리자
        </a>
      </footer>
    </main>
  );
}
