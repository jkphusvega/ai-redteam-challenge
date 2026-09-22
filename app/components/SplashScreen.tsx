'use client';

// ============================================================
// SplashScreen.tsx — 해킹 프로그램 복호화 스플래시 화면 (GSAP Enhanced)
//
// 첫 방문 시 1회만 표시되는 보안 시스템 복호화 인트로
// GSAP Timeline 기반의 정밀 드로잉, 디코딩 이징, CRT 플리커 적용
// ============================================================

import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';

const SCRAMBLE_POOL = '!@#$%^&*_+-=[]{}|;:<>?/~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const LINE_A = '#02 Mission : 비밀번호 탈취하기';
const LINE_B = 'AI 보안 통제실 수문장 돌파 작전';

const STATUS_MESSAGES = [
  '[SYS] 암호화 레이어 감지... AES-256-GCM',
  '[NET] 보안 채널 연결 중... 0x7F.PROXY',
  '[KEY] 키스트림 역추출 진행 중...',
  '[DEC] 메모리 버퍼 복호화 시작...',
  '[AUTH] GATEKEEPER-v3 인증 우회 준비...',
  '[SYS] 방화벽 바이패스 모듈 로드 완료',
  '[OK!] 사건 파일 복호화 성공 — 접근 허가',
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
  const cornerPathsRef = useRef<(SVGPathElement | null)[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

      // 2. 메인 복호화 프로그레스 & 텍스트 디코딩 GSAP 트윈
      const progressObj = { value: 0 };
      let lastLogIdx = -1;

      gsap.to(progressObj, {
        value: 100,
        duration: 3.2,
        ease: 'power2.inOut',
        delay: 0.2,
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

          // 라인 A 디코딩 (10% ~ 70%)
          const aRatio = Math.max(0, Math.min(1, (pct - 0.1) / 0.6));
          const aRevealed = Math.floor(aRatio * LINE_A.length);
          setCharsA(buildScrambled(LINE_A, aRevealed));

          // 라인 B 디코딩 (30% ~ 88%)
          const bRatio = Math.max(0, Math.min(1, (pct - 0.3) / 0.58));
          const bRevealed = Math.floor(bRatio * LINE_B.length);
          setCharsB(buildScrambled(LINE_B, bRevealed));
        },
        onComplete: () => {
          setCharsA(LINE_A.split(''));
          setCharsB(LINE_B.split(''));
          setDone(true);

          // 3. 복호화 완료 시 CRT 화면 글리치 쉐이크 연출
          if (containerRef.current) {
            gsap.fromTo(
              containerRef.current,
              { filter: 'brightness(1.8) contrast(1.2)' },
              {
                filter: 'brightness(1) contrast(1)',
                duration: 0.25,
                ease: 'power1.out',
              }
            );
            gsap.fromTo(
              containerRef.current,
              { x: -3, y: 2 },
              {
                x: 0,
                y: 0,
                duration: 0.3,
                ease: 'elastic.out(1, 0.3)',
              }
            );
          }
        },
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // 완료 후 버튼 등장 GSAP 애니메이션
  useEffect(() => {
    if (done && buttonRef.current) {
      gsap.fromTo(
        buttonRef.current,
        { scale: 0.85, opacity: 0, y: 10 },
        {
          scale: 1,
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: 'back.out(1.7)',
        }
      );

      // 네온 브리딩 펄스
      gsap.to(buttonRef.current, {
        boxShadow: '0 0 25px rgba(0, 240, 255, 0.55), inset 0 0 10px rgba(0, 240, 255, 0.2)',
        repeat: -1,
        yoyo: true,
        duration: 1.2,
        ease: 'sine.inOut',
      });
    }
  }, [done]);

  function handleEnter() {
    sessionStorage.setItem('splash_shown', 'true');
    // 퇴장 페이드아웃 효과
    if (containerRef.current) {
      gsap.to(containerRef.current, {
        opacity: 0,
        scale: 1.03,
        duration: 0.4,
        ease: 'power2.in',
        onComplete,
      });
    } else {
      onComplete();
    }
  }

  const accent = '#00f0ff';
  const accentDim = 'rgba(0, 240, 255, 0.35)';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#070a13',
        backgroundImage:
          'repeating-linear-gradient(to bottom, rgba(0, 240, 255, 0.02) 0px, rgba(0, 240, 255, 0.02) 1px, transparent 1px, transparent 3px)',
        color: '#e8f4ff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* 네 모서리 코너 브래킷 (GSAP 드로잉 타겟) */}
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
          top: 36,
          left: 56,
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: accentDim,
          letterSpacing: '1px',
        }}
      >
        ● SEC_DECRYPT_SEQUENCE_ACTIVE
      </div>
      <div
        style={{
          position: 'absolute',
          top: 36,
          right: 56,
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: accentDim,
          letterSpacing: '1px',
        }}
      >
        CASE_FILE: GK-0918
      </div>

      {/* 중앙 메인 컨테이너 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          maxWidth: '920px',
          padding: '0 40px',
          width: '100%',
        }}
      >
        {/* 상단 배지 라벨 */}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: accent,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            padding: '4px 12px',
            borderRadius: '4px',
            background: 'rgba(0, 240, 255, 0.08)',
            border: '1px solid rgba(0, 240, 255, 0.25)',
          }}
        >
          AI REDTEAM // BREACH PROTOCOL
        </div>

        {/* 메인 타이틀 (디코딩) */}
        <div
          style={{
            fontSize: 'clamp(28px, 5vw, 44px)',
            lineHeight: 1.3,
            textAlign: 'center',
            minHeight: '1.4em',
            fontWeight: 900,
            letterSpacing: '-0.02em',
          }}
        >
          {charsA.map((ch, i) => {
            const isRevealed = ch === LINE_A[i];
            return (
              <span
                key={i}
                style={{
                  color: isRevealed ? '#e8f4ff' : accent,
                  fontFamily: 'inherit',
                  textShadow: isRevealed
                    ? '0 0 20px rgba(0, 240, 255, 0.3)'
                    : `0 0 10px ${accent}`,
                  transition: 'color 0.15s ease',
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>

        {/* 서브 타이틀 (디코딩) */}
        <div
          style={{
            fontSize: '16px',
            letterSpacing: '0.04em',
            minHeight: '1.4em',
            color: 'rgba(232, 244, 255, 0.75)',
          }}
        >
          {charsB.map((ch, i) => {
            const isRevealed = ch === LINE_B[i];
            return (
              <span
                key={i}
                style={{
                  color: isRevealed ? 'rgba(232, 244, 255, 0.85)' : accentDim,
                  fontFamily: 'inherit',
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
            width: '440px',
            maxWidth: '100%',
            marginTop: '8px',
          }}
        >
          <div
            style={{
              flexGrow: 1,
              height: '3px',
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
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: accent,
              minWidth: '42px',
              textAlign: 'right',
              fontWeight: 700,
            }}
          >
            {progress}%
          </span>
        </div>

        {/* 상태 터미널 로그 */}
        <div
          style={{
            width: '500px',
            maxWidth: '100%',
            minHeight: '120px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: '4px',
            background: 'rgba(7, 10, 19, 0.6)',
            padding: '12px 16px',
            borderRadius: '6px',
            border: '1px solid rgba(0, 240, 255, 0.12)',
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
                  : 'rgba(0, 240, 255, 0.65)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {line}
            </div>
          ))}
        </div>

        {/* 완료 시 나타나는 작전 개시/열람 버튼 */}
        <div style={{ minHeight: '48px', display: 'flex', alignItems: 'center' }}>
          {done && (
            <button
              ref={buttonRef}
              onClick={handleEnter}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                border: `1px solid ${accent}`,
                color: '#070a13',
                background: accent,
                fontFamily: 'var(--font-sans)',
                fontWeight: 800,
                fontSize: '14px',
                padding: '12px 28px',
                borderRadius: '4px',
                cursor: 'pointer',
                letterSpacing: '0.04em',
                boxShadow: '0 0 20px rgba(0, 240, 255, 0.4)',
                transition: 'transform 0.15s ease, filter 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.filter = 'brightness(1.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.filter = 'brightness(1)';
              }}
            >
              <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
                <rect x="3" y="6" width="8" height="6" stroke="#070a13" strokeWidth="1.5" />
                <path d="M5 6 V4 a2 2 0 0 1 4 0 V6" stroke="#070a13" strokeWidth="1.5" />
              </svg>
              사건 파일 열람 (통제실 입장)
            </button>
          )}
        </div>
      </div>

      {/* 하단 시스템 스펙 */}
      <div
        style={{
          position: 'absolute',
          bottom: 32,
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
        <span>PROTOCOL // REDTEAM_HUD_v4.2</span>
        <span>ENGINE // GSAP_HYPERDRIVE</span>
        <span>GATEKEEPER-v3 // MONITORING</span>
      </div>
    </div>
  );
}
