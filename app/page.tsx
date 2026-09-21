'use client';

// ============================================================
// app/page.tsx — 2실 방탈출 미션 입장 로비 & 대시보드
//
// [2실: AI 보안 통제실 - 프롬프트 인젝션 & 보안 규칙 제작]
// ============================================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase';
import { ESCAPE_ROOM_CONFIG, ACQUIRED_ITEMS } from '@/lib/escapeRoomData';
import type { GameConfigRow } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();

  // 상태
  const [teamName, setTeamName] = useState('');
  const [gameConfig, setGameConfig] = useState<GameConfigRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedItemTab, setSelectedItemTab] = useState<'blueprint' | 'hint'>('blueprint');

  // 완료 상태
  const [m1Done, setM1Done] = useState(false);
  const [m2Done, setM2Done] = useState(false);

  // 멘토 모드 인증 모달 상태
  const [showMentorModal, setShowMentorModal] = useState(false);
  const [mentorPassword, setMentorPassword] = useState('');
  const [mentorError, setMentorError] = useState('');

  useEffect(() => {
    // localStorage에서 팀 이름 복원
    const savedTeam = localStorage.getItem('teamName');
    if (savedTeam) setTeamName(savedTeam);

    if (localStorage.getItem('mission1Success') === 'true') setM1Done(true);
    if (localStorage.getItem('mission2Success') === 'true') setM2Done(true);

    const supabase = createBrowserSupabase();
    if (!supabase) return;

    // game_config 초기 로드
    supabase
      .from('game_config')
      .select('*')
      .eq('id', 1)
      .single<GameConfigRow>()
      .then(({ data, error }) => {
        if (!error && data) setGameConfig(data);
      });

    // Realtime 구독
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
  // 미션 입장
  // ----------------------------------------------------------

  function handleEnterMission() {
    if (!teamName.trim()) {
      setError('팀 이름을 입력해주세요.');
      return;
    }
    setError('');
    setStarting(true);
    localStorage.setItem('teamName', teamName.trim());
    router.push('/mission');
  }

  function handleMentorLogin(e: React.FormEvent) {
    e.preventDefault();
    if (mentorPassword.trim() === '0918') {
      sessionStorage.setItem('mentor_auth', '0918');
      setShowMentorModal(false);
      router.push('/mentor');
    } else {
      setMentorError('비밀번호가 일치하지 않습니다. (힌트: 0918)');
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '24px 20px 60px',
        display: 'flex',
        flexDirection: 'column',
        gap: '28px',
      }}
    >
      {/* 멘토 / 멘티 모드 선택 바 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            background: 'rgba(10, 22, 40, 0.8)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'var(--cyan)',
              color: '#050d1a',
              fontWeight: 800,
              fontSize: '13px',
              border: 'none',
              cursor: 'default',
            }}
          >
            👥 멘티(학생) 입장
          </button>
          <button
            type="button"
            onClick={() => {
              setMentorError('');
              setMentorPassword('');
              setShowMentorModal(true);
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>🔑 멘토 모드</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(0918)</span>
          </button>
        </div>
      </div>
      {/* 히어로 헤더 */}
      <div className="animate-fade-in" style={{ textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span className="badge badge-cyan" style={{ fontSize: '13px', padding: '4px 12px' }}>
            {ESCAPE_ROOM_CONFIG.roomName}
          </span>
          <button
            type="button"
            onClick={() => setShowItemModal(true)}
            className="badge badge-yellow"
            style={{ fontSize: '13px', padding: '4px 12px', cursor: 'pointer', border: 'none' }}
          >
            📜 1실 획득 설계도 & 힌트 카드 보기
          </button>
        </div>

        <h1
          style={{
            fontSize: 'clamp(28px, 5vw, 44px)',
            fontWeight: 900,
            lineHeight: 1.2,
            margin: '0 0 16px',
          }}
        >
          <span className="gradient-text-cyan">{ESCAPE_ROOM_CONFIG.missionTitle}</span>
        </h1>
        <p
          style={{
            maxWidth: '680px',
            margin: '0 auto',
            color: 'var(--text-secondary)',
            fontSize: '16px',
            lineHeight: 1.6,
          }}
        >
          보안 통제실 수문장 AI의 취약점을 공략하여 <strong>MASTER KEY</strong>를 탈취하고,
          보안 담당자 입장에서 <strong>옳은 보안 규칙 3장</strong>을 조합하여 공격을 완벽히 차단하세요!
        </p>
      </div>

      {/* 팀 이름 입력 & 입장 카드 */}
      <div
        className="card card-glow animate-fade-in delay-100"
        style={{
          maxWidth: '560px',
          width: '100%',
          margin: '0 auto',
          textAlign: 'center',
          borderColor: 'var(--border-strong)',
          padding: '28px',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--cyan)', marginBottom: '8px' }}>
          🏷️ 미션 참가자 등록
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEnterMission()}
            placeholder="팀 이름 또는 별명을 입력하세요 (예: 사이버방패 1조)"
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              border: error ? '1px solid var(--red)' : '1px solid var(--border-default)',
              borderRadius: '8px',
              padding: '14px 16px',
              color: 'var(--text-primary)',
              fontSize: '15px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleEnterMission}
            disabled={starting}
            className="btn btn-primary"
            style={{
              padding: '0 24px',
              fontSize: '15px',
              whiteSpace: 'nowrap',
              boxShadow: 'var(--glow-cyan)',
            }}
          >
            {starting ? '입장 중...' : '🚀 미션 시작'}
          </button>
        </div>
        {error && (
          <p style={{ color: 'var(--red)', fontSize: '13px', marginTop: '8px', textAlign: 'left' }}>
            {error}
          </p>
        )}
      </div>

      {/* 2실 미션 워크플로우 3단계 프리뷰 카드 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}
        className="animate-fade-in delay-200"
      >
        {/* 미션 1 카드 */}
        <div
          className="card"
          style={{
            borderColor: m1Done ? 'var(--green)' : 'var(--border-default)',
            background: m1Done ? 'rgba(0, 255, 136, 0.04)' : 'var(--bg-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '28px' }}>🎯</span>
            <span className={m1Done ? 'badge badge-green' : 'badge badge-cyan'}>
              {m1Done ? '탈취 완료 ✓' : '미션 1'}
            </span>
          </div>
          <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px' }}>
            ① 프롬프트 인젝션 & MASTER KEY 탈취
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            비밀번호 보호 규칙이 설정된 수문장 AI를 대상으로 1실 힌트(가상 시나리오, 점검 모드 오버라이드)를 적용하여 기밀 코드를 누출시키세요.
          </p>
        </div>

        {/* 미션 2 카드 */}
        <div
          className="card"
          style={{
            borderColor: m2Done ? 'var(--green)' : 'var(--border-default)',
            background: m2Done ? 'rgba(0, 255, 136, 0.04)' : 'var(--bg-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '28px' }}>🛡️</span>
            <span className={m2Done ? 'badge badge-green' : 'badge badge-purple'}>
              {m2Done ? '방어 성공 ✓' : '미션 2'}
            </span>
          </div>
          <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px' }}>
            ② 보안 방어 규칙 제작 및 차단 검증
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            취약점을 분석하고 6장 중 옳은 방어 규칙 3장을 조합해 장착하세요. 방금 성공했던 공격을 AI에 다시 보내 완벽 차단 여부를 테스트합니다.
          </p>
        </div>

        {/* 미션 마무리 카드 */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '28px' }}>🔓</span>
            <span className="badge badge-yellow">미션 마무리</span>
          </div>
          <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 8px' }}>
            ③ 수납함 잠금 해제 & 3실 이동
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            MASTER KEY의 숫자 네 자리를 찾아 수납함을 열고, 3실용 팩트체크 자료와 빨간 셀로판지를 획득하여 다음 방으로 이동하세요!
          </p>
        </div>
      </div>

      {/* 1실 획득 아이템 모달 */}
      {showItemModal && (
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
          onClick={() => setShowItemModal(false)}
        >
          <div
            className="card animate-scale-in"
            style={{
              maxWidth: '700px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: 'var(--bg-card)',
              borderColor: 'var(--border-strong)',
              boxShadow: 'var(--glow-cyan)',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '22px' }}>📜</span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  1실에서 획득한 단서 및 보안 설계도
                </h3>
              </div>
              <button
                onClick={() => setShowItemModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <button
                onClick={() => setSelectedItemTab('blueprint')}
                style={{
                  background: selectedItemTab === 'blueprint' ? 'var(--cyan)' : 'transparent',
                  color: selectedItemTab === 'blueprint' ? '#050d1a' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                📐 보안 AI 설계도 (1건)
              </button>
              <button
                onClick={() => setSelectedItemTab('hint')}
                style={{
                  background: selectedItemTab === 'hint' ? 'var(--cyan)' : 'transparent',
                  color: selectedItemTab === 'hint' ? '#050d1a' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                💡 침투 힌트 카드 (3건)
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {ACQUIRED_ITEMS.filter((item) => item.type === selectedItemTab).map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px' }}>{item.emoji}</span>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--cyan)' }}>{item.title}</span>
                    <span className="badge badge-yellow" style={{ fontSize: '10px' }}>{item.badge}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>{item.subtitle}</div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {item.content.map((line, liIdx) => (
                      <li key={liIdx}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button onClick={() => setShowItemModal(false)} className="btn btn-secondary" style={{ padding: '8px 20px', fontSize: '13px' }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 멘토 인증 모달 (0918) */}
      {showMentorModal && (
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
          onClick={() => setShowMentorModal(false)}
        >
          <div
            className="card animate-scale-in"
            style={{
              maxWidth: '400px',
              width: '100%',
              padding: '28px',
              textAlign: 'center',
              borderColor: 'var(--border-strong)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: '44px', marginBottom: '10px' }}>🔑</div>
            <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px' }} className="gradient-text-cyan">
              멘토 전용 모드 접속
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              교사 및 멘토 비밀번호(4자리)를 입력하세요.
            </p>

            <form onSubmit={handleMentorLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="password"
                value={mentorPassword}
                onChange={(e) => setMentorPassword(e.target.value)}
                placeholder="비밀번호 입력 (0918)"
                autoFocus
                style={{
                  background: 'var(--bg-input)',
                  border: mentorError ? '1px solid var(--red)' : '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  textAlign: 'center',
                  letterSpacing: '4px',
                  outline: 'none',
                }}
              />
              {mentorError && <div style={{ fontSize: '12px', color: 'var(--red)', fontWeight: 600 }}>{mentorError}</div>}

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowMentorModal(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '10px', fontSize: '14px' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '10px', fontSize: '14px' }}
                >
                  확인
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
