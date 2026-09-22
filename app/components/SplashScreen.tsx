'use client';

// ============================================================
// SplashScreen.tsx — SHADOW BREACH 시스템 침투 스플래시 화면
//
// 사이버 하이테크 엠블럼, Orbitron 폰트, 정밀 디코딩 애니메이션,
// 100% 도달 시 메인 미션 화면으로 무지연 자동 전환
// ============================================================

import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';

const SCRAMBLE_POOL = '!@#$%^&*_+-=[]{}|;:<>?/~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const LINE_A = 'SHADOW BREACH';
const LINE_B = 'AI 통제실 시스템 침투 프로토콜 활성화';

const STATUS_MESSAGES = [
  '[SYS] SHADOW_BREACH 커널 로드... v4.2',
  '[NET] 익명화 프록시 체인 터널 개방... 0x7F.PROXY',
  '[SCAN] AI 통제실 통신 포트 스캔 및 취약점 감지',
  '[DEC] 게이트키퍼 보호 레이어 복호화 시작...',
  '[INJECT] 침투 페이로드 인젝션 모듈 장착',
  '[AUTH] 보안 방화벽 우회 세션 확립',
  '[OK] 침투 성공 — 보안 통제실 자동 진입',
];

interface SplashScreenProps {
  onComplete: () => void;
}

function randomChar() {
  return SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
}

function buildScrambled(text: string, revealCount: number): string[] {
  return text.split('').map((ch, i) => {
    if (i < revealCount) return ch;
    if (ch === ' ') return ' ';
    return randomChar();
  });
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [charsA, setCharsA] = useState<string[]>(() => buildScrambled(LINE_A, 0));
  const [charsB, setCharsB] = useState<string[]>(() => buildScrambled(LINE_B, 0));
  const [done, setDone] = useState(false);
  const [visibleLogs, setVisibleLogs] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const emblemRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGSVGElement>(null);
  const cornerPathsRef = useRef<(SVGPathElement | null)[]>([]);
  const autoEnterTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isEnteringRef = useRef(false);

  function handleEnter() {
    if (isEnteringRef.current) return;
    isEnteringRef.current = true;
    if (autoEnterTimerRef.current) {
      clearTimeout(autoEnterTimerRef.current);
      autoEnterTimerRef.current = null;
    }
    sessionStorage.setItem('splash_shown', 'true');
    // 퇴장 페이드아웃 효과
    if (containerRef.current) {
      gsap.to(containerRef.current, {
        opacity: 0,
        scale: 1.04,
        filter: 'brightness(1.5) blur(4px)',
        duration: 0.4,
        ease: 'power2.in',
        onComplete,
      });
    } else {
      onComplete();
    }
  }

  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1. 코너 브래킷 SVG 드로잉 애니메이션
      cornerPathsRef.current.forEach((path) => {
        if (!path) return;
        const len = 40;
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
        gsap.to(path, {
          strokeDashoffset: 0,
          duration: 0.8,
          ease: 'power2.out',
          stagger: 0.1,
        });
      });

      // 2. 엠블럼 회전 링 애니메이션
      if (ringRef.current) {
        gsap.to(ringRef.current, {
          rotation: 360,
          duration: 8,
          ease: 'none',
          repeat: -1,
        });
      }

      // 3. 엠블럼 네온 펄스
      if (emblemRef.current) {
        gsap.to(emblemRef.current, {
          boxShadow: '0 0 35px rgba(0, 240, 255, 0.6), inset 0 0 20px rgba(0, 240, 255, 0.35)',
          scale: 1.02,
          duration: 1.4,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      }

      // 4. 메인 복호화 프로그레스 & 텍스트 디코딩 GSAP 트윈
      const progressObj = { value: 0 };
      let lastLogIdx = -1;

      gsap.to(progressObj, {
        value: 100,
        duration: 2.8,
        ease: 'power2.inOut',
        delay: 0.1,
        onUpdate: () => {
          const val = Math.floor(progressObj.value);
          setProgress(val);
          const pct = val / 100;

          // 상태 로그 순차 출력
          const logIdx = Math.min(
            Math.floor(pct * STATUS_MESSAGES.length),
            STATUS_MESSAGES.length - 1
          );
          if (logIdx > lastLogIdx) {
            lastLogIdx = logIdx;
            setVisibleLogs((prev) => [...prev.slice(-6), STATUS_MESSAGES[logIdx]]);
          }

          // 라인 A 디코딩 (10% ~ 68%)
          const aRatio = Math.max(0, Math.min(1, (pct - 0.1) / 0.58));
          const aRevealed = Math.floor(aRatio * LINE_A.length);
          setCharsA(buildScrambled(LINE_A, aRevealed));

          // 라인 B 디코딩 (25% ~ 85%)
          const bRatio = Math.max(0, Math.min(1, (pct - 0.25) / 0.6));
          const bRevealed = Math.floor(bRatio * LINE_B.length);
          setCharsB(buildScrambled(LINE_B, bRevealed));
        },
        onComplete: () => {
          setCharsA(LINE_A.split(''));
          setCharsB(LINE_B.split(''));
          setDone(true);

          // 완료 시 CRT 화면 글리치 쉐이크 연출
          if (containerRef.current) {
            gsap.fromTo(
              containerRef.current,
              { filter: 'brightness(1.9) contrast(1.2)' },
              {
                filter: 'brightness(1) contrast(1)',
                duration: 0.2,
                ease: 'power1.out',
              }
            );
            gsap.fromTo(
              containerRef.current,
              { x: -4, y: 2 },
              {
                x: 0,
                y: 0,
                duration: 0.25,
                ease: 'elastic.out(1, 0.3)',
              }
            );
          }

          // 100% 로딩 완료 후 버튼 클릭 없이 0.45초 뒤 자동 메인 화면 진입
          autoEnterTimerRef.current = setTimeout(() => {
            handleEnter();
          }, 450);
        },
      });
    }, containerRef);

    return () => {
      ctx.revert();
      if (autoEnterTimerRef.current) {
        clearTimeout(autoEnterTimerRef.current);
      }
    };
  }, []);

  const accent = '#00f0ff';
  const accentDim = 'rgba(0, 240, 255, 0.4)';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#05070d',
        backgroundImage:
          'radial-gradient(ellipse at 50% 40%, rgba(0, 240, 255, 0.08) 0%, transparent 70%), repeating-linear-gradient(to bottom, rgba(0, 240, 255, 0.015) 0px, rgba(0, 240, 255, 0.015) 1px, transparent 1px, transparent 3px)',
        color: '#e8f4ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* 네 모서리 코너 브래킷 */}
      <svg
        width="36"
        height="36"
        viewBox="0 0 30 30"
        fill="none"
        style={{ position: 'absolute', top: 24, left: 24 }}
      >
        <path
          ref={(el) => { cornerPathsRef.current[0] = el; }}
          d="M2 16 L2 2 L16 2"
          stroke={accent}
          strokeWidth="1.5"
        />
      </svg>
      <svg
        width="36"
        height="36"
        viewBox="0 0 30 30"
        fill="none"
        style={{ position: 'absolute', top: 24, right: 24 }}
      >
        <path
          ref={(el) => { cornerPathsRef.current[1] = el; }}
          d="M28 16 L28 2 L14 2"
          stroke={accent}
          strokeWidth="1.5"
        />
      </svg>
      <svg
        width="36"
        height="36"
        viewBox="0 0 30 30"
        fill="none"
        style={{ position: 'absolute', bottom: 24, left: 24 }}
      >
        <path
          ref={(el) => { cornerPathsRef.current[2] = el; }}
          d="M2 14 L2 28 L16 28"
          stroke={accent}
          strokeWidth="1.5"
        />
      </svg>
      <svg
        width="36"
        height="36"
        viewBox="0 0 30 30"
        fill="none"
        style={{ position: 'absolute', bottom: 24, right: 24 }}
      >
        <path
          ref={(el) => { cornerPathsRef.current[3] = el; }}
          d="M28 14 L28 28 L14 28"
          stroke={accent}
          strokeWidth="1.5"
        />
      </svg>

      {/* 상단 좌우 정보 */}
      <div
        style={{
          position: 'absolute',
          top: 32,
          left: 56,
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: accentDim,
          letterSpacing: '1.5px',
        }}
      >
        ● BREACH_PROTOCOL_ACTIVE // 0x7F
      </div>
      <div
        style={{
          position: 'absolute',
          top: 28,
          right: 56,
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: accentDim,
            letterSpacing: '1px',
          }}
        >
          TARGET: AI_CONTROL_ROOM
        </span>
        <button
          onClick={handleEnter}
          style={{
            background: 'rgba(0, 240, 255, 0.08)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            color: 'var(--cyan)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            padding: '4px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 240, 255, 0.2)';
            e.currentTarget.style.borderColor = 'var(--cyan)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 240, 255, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.3)';
          }}
        >
          건너뛰기 SKIP ⏩
        </button>
      </div>

      {/* 중앙 메인 컨테이너 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          maxWidth: '920px',
          padding: '0 40px',
          width: '100%',
        }}
      >
        {/* 상단 배지 라벨 */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: accent,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            padding: '4px 14px',
            borderRadius: '4px',
            background: 'rgba(0, 240, 255, 0.08)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
          }}
        >
          AI REDTEAM // BREACH PROTOCOL
        </div>

        {/* 중앙 사이버 해킹 마크 / 엠블럼 */}
        <div
          style={{
            position: 'relative',
            width: '130px',
            height: '130px',
            margin: '4px 0 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* 회전하는 사이버 HUD 링 */}
          <svg
            ref={ringRef}
            width="154"
            height="154"
            viewBox="0 0 154 154"
            style={{
              position: 'absolute',
              pointerEvents: 'none',
            }}
          >
            <circle
              cx="77"
              cy="77"
              r="72"
              fill="none"
              stroke="rgba(0, 240, 255, 0.35)"
              strokeWidth="1.5"
              strokeDasharray="14 8 26 8"
            />
            <circle
              cx="77"
              cy="77"
              r="66"
              fill="none"
              stroke="rgba(0, 240, 255, 0.2)"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
          </svg>

          {/* 중앙 로고 이미지 */}
          <div
            ref={emblemRef}
            style={{
              width: '118px',
              height: '118px',
              borderRadius: '24px',
              overflow: 'hidden',
              border: '2px solid rgba(0, 240, 255, 0.75)',
              boxShadow: '0 0 28px rgba(0, 240, 255, 0.5), inset 0 0 16px rgba(0, 240, 255, 0.25)',
              background: '#04060b',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/shadow-breach-emblem.jpg?v=2"
              alt="Shadow Breach Agent Emblem"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'contrast(1.15) brightness(1.1)',
              }}
            />
          </div>
        </div>

        {/* 메인 타이틀 (Orbitron 폰트 & 디코딩) */}
        <div
          style={{
            fontFamily: "var(--font-orbitron), 'Space Grotesk', sans-serif",
            fontSize: 'clamp(32px, 5.5vw, 52px)',
            lineHeight: 1.1,
            textAlign: 'center',
            fontWeight: 900,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            minHeight: '1.2em',
          }}
        >
          {charsA.map((ch, i) => {
            const isRevealed = ch === LINE_A[i];
            return (
              <span
                key={i}
                style={{
                  color: isRevealed ? '#ffffff' : accent,
                  textShadow: isRevealed
                    ? '0 0 25px rgba(0, 240, 255, 0.8), 0 0 50px rgba(0, 240, 255, 0.35)'
                    : `0 0 15px ${accent}`,
                  transition: 'color 0.15s ease',
                  display: 'inline-block',
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>

        {/* 서브 타이틀 (Chakra Petch & 디코딩) */}
        <div
          style={{
            fontFamily: "var(--font-chakra), 'Noto Sans KR', sans-serif",
            fontSize: '15px',
            letterSpacing: '0.06em',
            minHeight: '1.4em',
            color: 'rgba(232, 244, 255, 0.75)',
            fontWeight: 500,
          }}
        >
          {charsB.map((ch, i) => {
            const isRevealed = ch === LINE_B[i];
            return (
              <span
                key={i}
                style={{
                  color: isRevealed ? 'rgba(232, 244, 255, 0.85)' : accentDim,
                  textShadow: isRevealed ? 'none' : `0 0 6px ${accentDim}`,
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>

        {/* 정밀 프로그레스 바 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            width: '420px',
            maxWidth: '100%',
            marginTop: '4px',
          }}
        >
          <div
            style={{
              flexGrow: 1,
              height: '4px',
              background: 'rgba(0, 240, 255, 0.12)',
              borderRadius: '2px',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                height: '100%',
                background: `linear-gradient(90deg, #00f0ff, #00ffaa)`,
                width: `${progress}%`,
                boxShadow: `0 0 12px ${accent}`,
                transition: 'width 0.05s linear',
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-orbitron), 'JetBrains Mono', monospace",
              fontSize: '14px',
              color: accent,
              minWidth: '48px',
              textAlign: 'right',
              fontWeight: 800,
            }}
          >
            {progress}%
          </span>
        </div>

        {/* 상태 터미널 로그 */}
        <div
          style={{
            width: '480px',
            maxWidth: '100%',
            minHeight: '110px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: '4px',
            background: 'rgba(5, 7, 13, 0.75)',
            padding: '10px 16px',
            borderRadius: '6px',
            border: '1px solid rgba(0, 240, 255, 0.15)',
            boxShadow: 'inset 0 0 15px rgba(0, 0, 0, 0.5)',
          }}
        >
          {visibleLogs.map((line, i) => (
            <div
              key={`${i}-${line}`}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: line.startsWith('[OK')
                  ? '#00ff66'
                  : line.startsWith('[AUTH')
                  ? '#ff3366'
                  : 'rgba(0, 240, 255, 0.7)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {line}
            </div>
          ))}
        </div>

        {/* 100% 도달 시 자동 진입 인디케이터 (버튼 제거됨) */}
        <div
          style={{
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: done ? '#00ff66' : 'rgba(0, 240, 255, 0.45)',
            letterSpacing: '1px',
            transition: 'color 0.2s ease',
          }}
        >
          {done ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: '#00ff66',
                  boxShadow: '0 0 8px #00ff66',
                  animation: 'pulse 0.8s infinite alternate',
                }}
              />
              침투 완료 // 메인 통제실로 자동 전환 중...
            </span>
          ) : (
            <span>시스템 무결성 점검 및 패킷 복호화 진행 중...</span>
          )}
        </div>
      </div>

      {/* 하단 시스템 스펙 */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: '36px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'rgba(0, 240, 255, 0.3)',
          flexWrap: 'wrap',
          padding: '0 20px',
        }}
      >
        <span>PROTOCOL // SHADOW_BREACH_v4.2</span>
        <span>ENGINE // GSAP_HYPERDRIVE</span>
        <span>GATEKEEPER // INFILTRATING</span>
      </div>
    </div>
  );
}
