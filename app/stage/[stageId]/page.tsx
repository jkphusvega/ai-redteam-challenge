'use client';

// ============================================================
// app/stage/[stageId]/page.tsx — 스테이지 채팅 UI
//
// 기능:
//   - Supabase Realtime으로 game_config 구독 (최대 시도 횟수 실시간 동기화)
//   - 채팅 히스토리 관리 (Gemini multi-turn)
//   - 성공 시 오버레이 애니메이션
//   - 실패(초과) 시 종료 화면
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase';
import { STAGES } from '@/lib/stagePrompts';
import type { ChatMessage, GameConfigRow } from '@/lib/types';

// ----------------------------------------------------------
// 타입
// ----------------------------------------------------------

interface DisplayMessage {
  role: 'user' | 'model';
  content: string;
  isSuccess?: boolean;
}

// ----------------------------------------------------------
// 성공 오버레이 컴포넌트
// ----------------------------------------------------------

function SuccessOverlay({ onNext, isLastStage }: { onNext: () => void; isLastStage: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        gap: '24px',
      }}
    >
      {/* 폭죽 파티클 */}
      <ConfettiParticles />

      <div className="animate-scale-in" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '72px', marginBottom: '16px' }}>🎉</div>
        <h2 style={{ fontSize: '36px', fontWeight: 900, margin: 0 }} className="gradient-text-green">
          비밀 코드 탈취 성공!
        </h2>
        <p style={{ marginTop: '12px', fontSize: '16px' }} className="text-secondary">
          AI의 방어를 성공적으로 뚫었습니다.
        </p>
      </div>

      <button className="btn btn-success" style={{ fontSize: '16px', padding: '14px 40px' }} onClick={onNext}>
        {isLastStage ? '🏁 결과 보기' : '➡️ 다음 스테이지'}
      </button>
    </div>
  );
}

// ----------------------------------------------------------
// 폭죽 파티클
// ----------------------------------------------------------

function ConfettiParticles() {
  const colors = ['#00c8ff', '#00ff88', '#ffd700', '#ff3b5c', '#a855f7'];
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 1.5}s`,
    duration: `${2 + Math.random() * 1.5}s`,
    size: `${6 + Math.random() * 10}px`,
  }));

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: p.left,
            top: '-20px',
            width: p.size,
            height: p.size,
            background: p.color,
            borderRadius: '2px',
            animation: `confetti-fall ${p.duration} ease-in ${p.delay} infinite`,
            boxShadow: `0 0 6px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}

// ----------------------------------------------------------
// 실패 화면
// ----------------------------------------------------------

function FailureScreen({ onRetry, onHome }: { onRetry: () => void; onHome: () => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '64px' }}>💀</div>
      <h2 style={{ fontSize: '28px', fontWeight: 900, margin: 0 }} className="text-red">
        시도 횟수 초과
      </h2>
      <p className="text-secondary">최대 시도 횟수를 모두 소진했습니다.</p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button className="btn btn-outline" onClick={onRetry}>🔄 다시 도전</button>
        <button className="btn btn-ghost" onClick={onHome}>🏠 처음으로</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------
// 메인 컴포넌트
// ----------------------------------------------------------

export default function StagePage() {
  const router = useRouter();
  const params = useParams();
  const stageId = Number(params.stageId) as 1 | 2;

  // 스테이지 메타데이터
  const stage = STAGES.find((s) => s.id === stageId);

  // 상태
  const [teamName, setTeamName] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [turnNumber, setTurnNumber] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------------
  // 초기화 & Realtime 구독
  // ----------------------------------------------------------

  useEffect(() => {
    // 팀 이름 복원
    const saved = localStorage.getItem('teamName');
    if (!saved) {
      router.replace('/');
      return;
    }
    setTeamName(saved);

    // 스테이지 유효성 검사
    if (!stage) {
      router.replace('/');
      return;
    }

    // game_config 초기 로드
    const supabase = createBrowserSupabase();
    supabase
      .from('game_config')
      .select('max_attempts, is_game_active')
      .eq('id', 1)
      .single<Pick<GameConfigRow, 'max_attempts' | 'is_game_active'>>()
      .then(({ data }) => {
        if (data) {
          setMaxAttempts(data.max_attempts);
          if (!data.is_game_active) router.replace('/');
        }
        setConfigLoaded(true);
      });

    // Realtime 구독 — 최대 시도 횟수 변경 시 실시간 반영
    const channel = supabase
      .channel(`stage_config_${stageId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_config', filter: 'id=eq.1' },
        (payload) => {
          const newConfig = payload.new as GameConfigRow;
          setMaxAttempts(newConfig.max_attempts);
          if (!newConfig.is_game_active) router.replace('/');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stageId, stage, router]);

  // 새 메시지 시 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ----------------------------------------------------------
  // 메시지 전송
  // ----------------------------------------------------------

  async function handleSend() {
    if (!input.trim() || isLoading || isSuccess || isGameOver) return;
    if (maxAttempts !== null && turnNumber >= maxAttempts) {
      setIsGameOver(true);
      return;
    }

    const userMessage = input.trim();
    const nextTurn = turnNumber + 1;

    setInput('');
    setTurnNumber(nextTurn);
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    // API 호출용 히스토리 (DisplayMessage → ChatMessage)
    const history: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName,
          stageId,
          message: userMessage,
          turnNumber: nextTurn,
          history,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'model', content: `⚠ 오류: ${data.error}` },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: 'model', content: data.reply, isSuccess: data.success },
      ]);

      if (data.success) {
        setIsSuccess(true);
        // 완료된 스테이지 기록
        const prev = JSON.parse(localStorage.getItem('completedStages') ?? '[]') as number[];
        if (!prev.includes(stageId)) {
          localStorage.setItem('completedStages', JSON.stringify([...prev, stageId]));
        }
      } else if (maxAttempts !== null && nextTurn >= maxAttempts) {
        setIsGameOver(true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'model', content: '⚠ 서버 연결 오류가 발생했습니다.' },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  // ----------------------------------------------------------
  // 다음 단계 이동
  // ----------------------------------------------------------

  function handleNext() {
    if (stageId === 2) {
      router.push('/result');
    } else {
      router.push(`/stage/${stageId + 1}`);
    }
  }

  function handleRetry() {
    setMessages([]);
    setTurnNumber(0);
    setIsGameOver(false);
    setIsSuccess(false);
    setInput('');
  }

  // ----------------------------------------------------------
  // 로딩 중
  // ----------------------------------------------------------

  if (!configLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!stage) return null;

  const attemptsLeft = maxAttempts !== null ? maxAttempts - turnNumber : null;
  const isLastStage = stageId === 2;

  // ----------------------------------------------------------
  // 렌더
  // ----------------------------------------------------------

  return (
    <>
      {/* 성공 오버레이 */}
      {isSuccess && <SuccessOverlay onNext={handleNext} isLastStage={isLastStage} />}

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          maxWidth: '800px',
          margin: '0 auto',
          padding: '0 16px',
        }}
      >
        {/* 상단 헤더 */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'rgba(5, 13, 26, 0.9)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(0, 200, 255, 0.12)',
            padding: '12px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="btn btn-ghost"
              style={{ padding: '6px 12px', fontSize: '13px' }}
              onClick={() => router.push('/')}
            >
              ← 홈
            </button>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 600 }} className="text-muted">STAGE {stageId}</span>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>
                {stage.emoji} {stage.title}
              </div>
            </div>
          </div>

          {/* 시도 횟수 카운터 */}
          {maxAttempts !== null && (
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: `1px solid ${attemptsLeft !== null && attemptsLeft <= 3 ? 'rgba(255, 59, 92, 0.5)' : 'rgba(0, 200, 255, 0.25)'}`,
                borderRadius: '10px',
                padding: '8px 14px',
                textAlign: 'center',
              }}
            >
              <div
                style={{ fontSize: '20px', fontWeight: 900, lineHeight: 1 }}
                className={attemptsLeft !== null && attemptsLeft <= 3 ? 'text-red' : 'text-cyan'}
              >
                {attemptsLeft}
              </div>
              <div style={{ fontSize: '11px' }} className="text-muted">남은 시도</div>
            </div>
          )}
        </header>

        {/* 채팅 영역 또는 실패 화면 */}
        {isGameOver ? (
          <FailureScreen onRetry={handleRetry} onHome={() => router.push('/')} />
        ) : (
          <>
            {/* 메시지 목록 */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* 시작 안내 메시지 */}
              {messages.length === 0 && (
                <div
                  className="animate-fade-in-up"
                  style={{
                    textAlign: 'center',
                    padding: '40px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div style={{ fontSize: '48px' }}>{stage.emoji}</div>
                  <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>{stage.title} AI에게 도전하세요!</h2>
                  <p className="text-secondary" style={{ fontSize: '14px', maxWidth: '400px' }}>
                    {stage.description}
                    <br />
                    AI를 설득해 비밀 코드를 말하게 만들면 성공입니다.
                  </p>
                  <div
                    style={{
                      background: 'rgba(0, 200, 255, 0.06)',
                      border: '1px solid rgba(0, 200, 255, 0.15)',
                      borderRadius: '10px',
                      padding: '10px 20px',
                      fontSize: '13px',
                    }}
                    className="text-mono"
                  >
                    코드 형식: <span className="text-cyan">{stage.secretCode.replace(/[A-Z0-9]/g, '?')}</span>
                  </div>
                </div>
              )}

              {/* 대화 메시지 */}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    paddingLeft: msg.role === 'model' ? '4px' : '20%',
                    paddingRight: msg.role === 'user' ? '4px' : '20%',
                  }}
                  className="animate-fade-in-up"
                >
                  {msg.role === 'model' && (
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'rgba(0, 200, 255, 0.15)',
                        border: '1px solid rgba(0, 200, 255, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        flexShrink: 0,
                        marginRight: '8px',
                        alignSelf: 'flex-end',
                      }}
                    >
                      {stage.emoji}
                    </div>
                  )}
                  <div className={msg.role === 'user' ? 'bubble-user' : `bubble-ai${msg.isSuccess ? ' success' : ''}`}>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {msg.content}
                    </p>
                    {msg.isSuccess && (
                      <p style={{ margin: '8px 0 0', fontSize: '12px', fontWeight: 700 }} className="text-green">
                        🔓 비밀 코드가 노출되었습니다!
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {/* 로딩 인디케이터 */}
              {isLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '4px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'rgba(0, 200, 255, 0.15)',
                      border: '1px solid rgba(0, 200, 255, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                    }}
                  >
                    {stage.emoji}
                  </div>
                  <div className="bubble-ai" style={{ display: 'flex', gap: '4px', padding: '14px 16px' }}>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--cyan)',
                          animation: `glowPulse 1s ease-in-out ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* 입력 영역 */}
            <div
              style={{
                position: 'sticky',
                bottom: 0,
                background: 'rgba(5, 13, 26, 0.95)',
                backdropFilter: 'blur(12px)',
                borderTop: '1px solid rgba(0, 200, 255, 0.12)',
                padding: '16px 0 24px',
              }}
            >
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  ref={inputRef}
                  className="input"
                  type="text"
                  placeholder="AI에게 말을 걸어보세요... (Enter로 전송)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  disabled={isLoading || isSuccess || isGameOver}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleSend}
                  disabled={isLoading || !input.trim() || isSuccess || isGameOver}
                  style={{ flexShrink: 0 }}
                >
                  {isLoading ? <div className="spinner" /> : '전송 ↑'}
                </button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '12px', textAlign: 'center' }} className="text-muted">
                {turnNumber}번 시도 · 최대 {maxAttempts ?? '...'}번
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
