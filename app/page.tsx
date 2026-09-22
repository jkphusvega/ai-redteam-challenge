'use client';

// ============================================================
// app/page.tsx — 2실 방탈출 미션 입장 로비 & 대시보드
//
// [2실: AI 보안 통제실 - 프롬프트 인젝션 & 보안 규칙 제작]
// UI: Cyberpunk Red Team HUD 디자인
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { createBrowserSupabase } from '@/lib/supabase';
import { ESCAPE_ROOM_CONFIG, ACQUIRED_ITEMS } from '@/lib/escapeRoomData';
import type { GameConfigRow } from '@/lib/types';
import TextScramble from '@/app/components/TextScramble';
import SplashScreen from '@/app/components/SplashScreen';

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

  // 스플래시 화면 상태
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    // 세션당 1회만 스플래시 표시
    if (!sessionStorage.getItem('splash_shown')) {
      setShowSplash(true);
    }
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

  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!showSplash && mainRef.current) {
      const items = mainRef.current.querySelectorAll('.hud-stagger');
      if (items.length > 0) {
        gsap.fromTo(
          items,
          { opacity: 0, y: 22, filter: 'blur(4px)' },
          {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            duration: 0.55,
            stagger: 0.08,
            ease: 'power2.out',
          }
        );
      }
    }
  }, [showSplash]);

  // 스플래시 화면 표시 중이면 스플래시만 렌더링
  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  return (
    <main
      ref={mainRef}
      style={{
        minHeight: '100vh',
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '24px 20px 60px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* 멘토 / 멘티 모드 선택 바 */}
      <div className="hud-stagger" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <div
          className="card-glass"
          style={{
            display: 'flex',
            padding: '4px',
            borderRadius: '10px',
          }}
        >
          <button
            type="button"
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              background: 'var(--cyan)',
              color: '#000',
              fontWeight: 800,
              fontSize: '12px',
              border: 'none',
              cursor: 'default',
              fontFamily: 'var(--font-mono)',
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
              fontSize: '12px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>🔑 멘토 모드</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(0918)</span>
          </button>
        </div>
      </div>

      {/* 히어로 헤더 */}
      <div className="hud-stagger" style={{ textAlign: 'center' }}>
        {/* 상단 서브 타이틀 */}
        <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '8px' }}>
          <TextScramble text="CYBER WARGAME // AI SECURITY CONTROL ROOM" duration={30} />
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <span className="badge badge-cyan" style={{ fontSize: '12px', padding: '4px 12px', fontFamily: 'var(--font-mono)' }}>
            {ESCAPE_ROOM_CONFIG.roomName}
          </span>
          <button
            type="button"
            onClick={() => setShowItemModal(true)}
            className="badge badge-yellow"
            style={{ fontSize: '12px', padding: '4px 12px', cursor: 'pointer', border: 'none', fontFamily: 'var(--font-mono)' }}
          >
            📜 1실 획득 설계도 &amp; 힌트 카드 보기
          </button>
        </div>

        <h1
          className="gradient-text-cyber"
          style={{
            fontSize: 'clamp(28px, 5vw, 44px)',
            fontWeight: 900,
            lineHeight: 1.2,
            margin: '0 0 16px',
            fontFamily: 'var(--font-display)',
          }}
        >
          <TextScramble text="#02 Mission : 비밀번호 탈취하기" duration={45} delay={300} />
        </h1>

        <p
          style={{
            maxWidth: '680px',
            margin: '0 auto',
            color: 'var(--text-secondary)',
            fontSize: '15px',
            lineHeight: 1.6,
          }}
        >
          보안 통제실 수문장 AI의 취약점을 공략하여 <strong style={{ color: 'var(--cyan)' }}>MASTER KEY</strong>를 탈취하고,
          보안 담당자 입장에서 <strong style={{ color: 'var(--green)' }}>옳은 보안 규칙 3장</strong>을 조합하여 공격을 완벽히 차단하세요!
        </p>

        {/* HIGH-RISK 뱃지 */}
        <div style={{ marginTop: '14px' }}>
          <span className="badge badge-alert" style={{ fontSize: '10px', padding: '4px 12px' }}>
            DEFCON-2 // HIGH-RISK JAILBREAK EXERCISE
          </span>
        </div>
      </div>

      {/* 팀 이름 입력 & 입장 카드 */}
      <div
        className="card-glass hud-stagger"
        style={{
          maxWidth: '560px',
          width: '100%',
          margin: '0 auto',
          textAlign: 'center',
          borderColor: 'var(--border-strong)',
          padding: '28px',
          boxShadow: 'var(--glow-cyan)',
        }}
      >
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--cyan)', marginBottom: '4px', fontFamily: 'var(--font-mono)', letterSpacing: '2px' }}>
          AGENT REGISTRATION
        </div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px' }}>
          🏷️ 미션 참가자(팀) 등록
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEnterMission()}
            placeholder="팀 이름 또는 별명을 입력하세요 (예: 사이버방패 1조)"
            style={{
              flex: 1,
              background: 'rgba(0, 0, 0, 0.4)',
              border: error ? '1px solid var(--red)' : '1px solid var(--border-default)',
              borderRadius: '8px',
              padding: '14px 16px',
              color: 'var(--cyan)',
              fontSize: '14px',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
          <button
            onClick={handleEnterMission}
            disabled={starting}
            className="btn-neon"
            style={{
              padding: '0 24px',
              fontSize: '14px',
              whiteSpace: 'nowrap',
              borderRadius: '8px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {starting ? 'ENTERING...' : '⚡ 미션 시작'}
          </button>
        </div>
        {error && (
          <p style={{ color: 'var(--red)', fontSize: '12px', marginTop: '8px', textAlign: 'left', fontFamily: 'var(--font-mono)' }}>
            ⚠ {error}
          </p>
        )}
      </div>

      {/* 2실 미션 워크플로우 3단계 프리뷰 카드 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '14px',
        }}
        className="hud-stagger"
      >
        {/* 미션 1 카드 */}
        <div
          className="card-glass"
          style={{
            borderColor: m1Done ? 'var(--green)' : 'var(--border-default)',
            boxShadow: m1Done ? '0 0 15px rgba(0, 255, 102, 0.15)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '28px' }}>🎯</span>
            <span className={m1Done ? 'badge badge-green' : 'badge badge-cyan'} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
              {m1Done ? 'EXTRACTED ✓' : 'STAGE 01'}
            </span>
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 8px', fontFamily: 'var(--font-display)' }}>
            ① 프롬프트 인젝션 &amp; MASTER KEY 탈취
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            비밀번호 보호 규칙이 설정된 수문장 AI를 대상으로 1실 힌트(가상 시나리오, 점검 모드 오버라이드)를 적용하여 기밀 코드를 누출시키세요.
          </p>
        </div>

        {/* 미션 2 카드 */}
        <div
          className="card-glass"
          style={{
            borderColor: m2Done ? 'var(--green)' : 'var(--border-default)',
            boxShadow: m2Done ? '0 0 15px rgba(0, 255, 102, 0.15)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '28px' }}>🛡️</span>
            <span className={m2Done ? 'badge badge-green' : 'badge badge-purple'} style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
              {m2Done ? 'SECURED ✓' : 'STAGE 02'}
            </span>
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 8px', fontFamily: 'var(--font-display)' }}>
            ② 보안 방어 규칙 제작 및 차단 검증
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            취약점을 분석하고 6장 중 옳은 방어 규칙 3장을 조합해 장착하세요. 방금 성공했던 공격을 AI에 다시 보내 완벽 차단 여부를 테스트합니다.
          </p>
        </div>

        {/* 미션 마무리 카드 */}
        <div className="card-glass">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '28px' }}>🔓</span>
            <span className="badge badge-yellow" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>STAGE 03</span>
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '0 0 8px', fontFamily: 'var(--font-display)' }}>
            ③ 수납함 잠금 해제 &amp; 3실 이동
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
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={() => setShowItemModal(false)}
        >
          <div
            className="card-glass animate-scale-in"
            style={{
              maxWidth: '700px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              borderColor: 'var(--border-strong)',
              boxShadow: 'var(--glow-cyan)',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '22px' }}>📜</span>
                <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
                  1실에서 획득한 단서 및 보안 설계도
                </h3>
              </div>
              <button
                onClick={() => setShowItemModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
              <button
                onClick={() => setSelectedItemTab('blueprint')}
                style={{
                  background: selectedItemTab === 'blueprint' ? 'var(--cyan)' : 'transparent',
                  color: selectedItemTab === 'blueprint' ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                📐 보안 AI 설계도 (1건)
              </button>
              <button
                onClick={() => setSelectedItemTab('hint')}
                style={{
                  background: selectedItemTab === 'hint' ? 'var(--cyan)' : 'transparent',
                  color: selectedItemTab === 'hint' ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
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
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px' }}>{item.emoji}</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--cyan)' }}>{item.title}</span>
                    <span className="badge badge-yellow" style={{ fontSize: '10px' }}>{item.badge}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', fontFamily: 'var(--font-mono)' }}>{item.subtitle}</div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {item.content.map((line, liIdx) => (
                      <li key={liIdx}>{line}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button onClick={() => setShowItemModal(false)} className="btn btn-ghost" style={{ padding: '8px 20px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                CLOSE
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
            background: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
          onClick={() => setShowMentorModal(false)}
        >
          <div
            className="card-glass animate-scale-in"
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
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px', fontFamily: 'var(--font-display)' }} className="gradient-text-cyan">
              멘토 전용 모드 접속
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '20px', fontFamily: 'var(--font-mono)' }}>
              ENTER MENTOR ACCESS CODE (4-DIGIT)
            </p>

            <form onSubmit={handleMentorLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="password"
                value={mentorPassword}
                onChange={(e) => setMentorPassword(e.target.value)}
                placeholder="비밀번호 입력 (0918)"
                autoFocus
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: mentorError ? '1px solid var(--red)' : '1px solid var(--border-default)',
                  borderRadius: '8px',
                  padding: '12px',
                  color: 'var(--cyan)',
                  fontSize: '18px',
                  textAlign: 'center',
                  letterSpacing: '6px',
                  outline: 'none',
                  fontFamily: 'var(--font-mono)',
                }}
              />
              {mentorError && <div style={{ fontSize: '12px', color: 'var(--red)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{mentorError}</div>}

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowMentorModal(false)}
                  className="btn btn-ghost"
                  style={{ flex: 1, padding: '10px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '10px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                >
                  ACCESS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
