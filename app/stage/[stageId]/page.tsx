'use client';

// ============================================================
// app/stage/[stageId]/page.tsx — 스테이지 채팅 UI (실시간 팀 공유방 + 동시 접속자 목록)
//
// 기능:
//   - 동일 팀 이름으로 접속한 팀원들 간 대화 내용 실시간 동기화 (Supabase Realtime)
//   - Supabase Realtime Presence로 현재 방에 접속 중인 팀원 목록/인원수 실시간 표시
//   - 우측 팀원 프로필 패널 (PC) / 상단 인원수 팝오버 (모바일)
//   - 관리자의 최대 시도 횟수 / 비밀 코드 실시간 반영
//   - 성공 시 팀 전체 화면에 축하 오버레이
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase';
import { STAGES, DEFAULT_STAGE1_CODE, DEFAULT_STAGE2_CODE } from '@/lib/stagePrompts';
import type { ChatMessage, GameConfigRow, AttemptRow } from '@/lib/types';

// ----------------------------------------------------------
// 타입
// ----------------------------------------------------------

interface DisplayMessage {
  role: 'user' | 'model';
  content: string;
  isSuccess?: boolean;
}

interface TeamMemberPresence {
  userId: string;
  nickname: string;
  avatar: string;
  joinedAt: string;
  isMe?: boolean;
}

const AVATAR_LIST = ['🦊', '⚡', '🤖', '👾', '🐱', '🚀', '🛡️', '🎯', '💎', '🔥', '🦅', '🐺'];

// ----------------------------------------------------------
// 성공 오버레이 컴포넌트
// ----------------------------------------------------------

function SuccessOverlay({ onNext, isLastStage }: { onNext: () => void; isLastStage: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        gap: '24px',
        padding: '20px',
      }}
    >
      <ConfettiParticles />

      <div className="animate-scale-in" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '72px', marginBottom: '16px' }}>🎉</div>
        <h2 style={{ fontSize: '36px', fontWeight: 900, margin: 0 }} className="gradient-text-green">
          비밀 코드 탈취 성공!
        </h2>
        <p style={{ marginTop: '12px', fontSize: '16px' }} className="text-secondary">
          팀원들과 함께 AI의 방어를 성공적으로 뚫었습니다!
        </p>
      </div>

      <button className="btn btn-success" style={{ fontSize: '16px', padding: '14px 40px' }} onClick={onNext}>
        {isLastStage ? '🏁 최종 결과 보기' : '➡️ 다음 스테이지'}
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
        padding: '32px',
      }}
    >
      <div style={{ fontSize: '64px' }}>💀</div>
      <h2 style={{ fontSize: '28px', fontWeight: 900, margin: 0 }} className="text-red">
        시도 횟수 초과
      </h2>
      <p className="text-secondary">팀의 최대 시도 횟수를 모두 소진했습니다.</p>
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

  const stageMeta = STAGES.find((s) => s.id === stageId);

  // 상태
  const [teamName, setTeamName] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [turnNumber, setTurnNumber] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null);
  const [currentSecretCode, setCurrentSecretCode] = useState<string>(
    stageId === 1 ? DEFAULT_STAGE1_CODE : DEFAULT_STAGE2_CODE
  );
  const [isSuccess, setIsSuccess] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);

  // 실시간 접속자 상태 (Presence)
  const [members, setMembers] = useState<TeamMemberPresence[]>([]);
  const [myUserId, setMyUserId] = useState('');
  const [showMobileMembers, setShowMobileMembers] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------------
  // 초기 팀 대화 내역 및 설정 로드
  // ----------------------------------------------------------

  const initRoom = useCallback(async (currentTeam: string) => {
    const supabase = createBrowserSupabase();

    // 1. game_config 로드
    const { data: configData } = await supabase
      .from('game_config')
      .select('*')
      .eq('id', 1)
      .single<GameConfigRow>();

    if (configData) {
      setMaxAttempts(configData.max_attempts);
      const code =
        stageId === 1
          ? configData.stage1_secret_code || DEFAULT_STAGE1_CODE
          : configData.stage2_secret_code || DEFAULT_STAGE2_CODE;
      setCurrentSecretCode(code);

      if (!configData.is_game_active) {
        router.replace('/');
        return;
      }
    }

    // 2. 해당 팀의 기존 시도 내역 로드 (팀원 간 공유방 동기화)
    const { data: existingAttempts } = await supabase
      .from('attempts')
      .select('*')
      .eq('team_name', currentTeam)
      .eq('stage', stageId)
      .order('turn_number', { ascending: true });

    if (existingAttempts && existingAttempts.length > 0) {
      const restoredMessages: DisplayMessage[] = [];
      let successFound = false;
      let highestTurn = 0;

      for (const att of existingAttempts as AttemptRow[]) {
        restoredMessages.push({ role: 'user', content: att.prompt_text });
        restoredMessages.push({ role: 'model', content: att.ai_response, isSuccess: att.success });
        if (att.turn_number > highestTurn) highestTurn = att.turn_number;
        if (att.success) successFound = true;
      }

      setMessages(restoredMessages);
      setTurnNumber(highestTurn);

      if (successFound) {
        setIsSuccess(true);
      } else if (configData && highestTurn >= configData.max_attempts) {
        setIsGameOver(true);
      }
    }

    setConfigLoaded(true);
  }, [stageId, router]);

  useEffect(() => {
    const saved = localStorage.getItem('teamName');
    if (!saved) {
      router.replace('/');
      return;
    }
    setTeamName(saved);

    if (!stageMeta) {
      router.replace('/');
      return;
    }

    // 사용자 고유 ID 및 아바타 생성 (브라우저 세션 유지)
    let uid = sessionStorage.getItem('member_uid');
    let avatar = sessionStorage.getItem('member_avatar');
    let nick = sessionStorage.getItem('member_nick');

    if (!uid) {
      uid = 'user_' + Math.random().toString(36).substring(2, 9);
      avatar = AVATAR_LIST[Math.floor(Math.random() * AVATAR_LIST.length)];
      nick = `팀원 ${Math.floor(1 + Math.random() * 99)}`;
      sessionStorage.setItem('member_uid', uid);
      sessionStorage.setItem('member_avatar', avatar);
      sessionStorage.setItem('member_nick', nick);
    }
    setMyUserId(uid);

    initRoom(saved);

    const supabase = createBrowserSupabase();

    // 1. game_config 변경 Realtime 구독 (관리자 설정 실시간 반영)
    const configChannel = supabase
      .channel(`stage_config_${stageId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_config', filter: 'id=eq.1' },
        (payload) => {
          const newConfig = payload.new as GameConfigRow;
          setMaxAttempts(newConfig.max_attempts);
          const code =
            stageId === 1
              ? newConfig.stage1_secret_code || DEFAULT_STAGE1_CODE
              : newConfig.stage2_secret_code || DEFAULT_STAGE2_CODE;
          setCurrentSecretCode(code);
          if (!newConfig.is_game_active) router.replace('/');
        }
      )
      .subscribe();

    // 2. attempts 실시간 구독 (같은 팀원이 메시지 보냈을 때 실시간 화면 동기화)
    const attemptsChannel = supabase
      .channel(`team_room_${saved}_stage_${stageId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attempts' },
        (payload) => {
          const newAtt = payload.new as AttemptRow;
          if (newAtt.team_name === saved && newAtt.stage === stageId) {
            setMessages((prev) => {
              const lastModelMsg = prev[prev.length - 1];
              if (lastModelMsg && lastModelMsg.role === 'model' && lastModelMsg.content === newAtt.ai_response) {
                return prev;
              }
              return [
                ...prev,
                { role: 'user', content: newAtt.prompt_text },
                { role: 'model', content: newAtt.ai_response, isSuccess: newAtt.success },
              ];
            });

            setTurnNumber(newAtt.turn_number);

            if (newAtt.success) {
              setIsSuccess(true);
              const comp = JSON.parse(localStorage.getItem('completedStages') ?? '[]') as number[];
              if (!comp.includes(stageId)) {
                localStorage.setItem('completedStages', JSON.stringify([...comp, stageId]));
              }
            }
          }
        }
      )
      .subscribe();

    // 3. Supabase Realtime Presence (실시간 접속자 목록 & 프로필)
    const presenceChannel = supabase.channel(`team_presence_${saved}_s${stageId}`, {
      config: { presence: { key: uid } },
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const memberList: TeamMemberPresence[] = [];
        const seen = new Set<string>();

        Object.values(state).forEach((presences) => {
          (presences as unknown as TeamMemberPresence[]).forEach((p) => {
            if (!seen.has(p.userId)) {
              seen.add(p.userId);
              memberList.push({
                ...p,
                isMe: p.userId === uid,
              });
            }
          });
        });

        // 본인을 맨 위로 정렬
        memberList.sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : 0));
        setMembers(memberList);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            userId: uid,
            nickname: nick,
            avatar: avatar,
            joinedAt: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(configChannel);
      supabase.removeChannel(attemptsChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [stageId, stageMeta, router, initRoom]);

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
    setIsLoading(true);

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

      setTurnNumber(nextTurn);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'model' && last.content === data.reply) return prev;
        return [
          ...prev,
          { role: 'user', content: userMessage },
          { role: 'model', content: data.reply, isSuccess: data.success },
        ];
      });

      if (data.success) {
        setIsSuccess(true);
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
  // 핸들러
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

  if (!configLoaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <div className="spinner" style={{ width: '36px', height: '36px' }} />
        <p className="text-secondary" style={{ fontSize: '14px' }}>팀 공유방 동기화 중...</p>
      </div>
    );
  }

  if (!stageMeta) return null;

  const attemptsLeft = maxAttempts !== null ? Math.max(0, maxAttempts - turnNumber) : null;
  const isLastStage = stageId === 2;

  // ----------------------------------------------------------
  // 렌더
  // ----------------------------------------------------------

  return (
    <>
      {isSuccess && <SuccessOverlay onNext={handleNext} isLastStage={isLastStage} />}

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          maxWidth: '1180px',
          margin: '0 auto',
          padding: '0 16px',
          gap: '24px',
        }}
      >
        {/* === 좌측: 메인 채팅 컨테이너 === */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: '820px',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
          }}
        >
          {/* 상단 헤더 */}
          <header
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: 'rgba(5, 13, 26, 0.92)',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600 }} className="text-muted">STAGE {stageId}</span>
                  <span className="badge badge-cyan" style={{ fontSize: '11px', padding: '1px 6px' }}>
                    🏷️ 팀: {teamName}
                  </span>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>
                  {stageMeta.emoji} {stageMeta.title}
                </div>
              </div>
            </div>

            {/* 우측 컨트롤: 모바일 팀원 토글 & 시도 횟수 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* 모바일 화면용 팀원 수 버튼 */}
              <button
                type="button"
                className="btn btn-ghost md:hidden"
                style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', gap: '4px', alignItems: 'center' }}
                onClick={() => setShowMobileMembers(!showMobileMembers)}
              >
                <span className="animate-glow-pulse text-green">●</span>
                <span>👥 {members.length}명</span>
              </button>

              {/* 시도 횟수 카운터 */}
              {maxAttempts !== null && (
                <div
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: `1px solid ${attemptsLeft !== null && attemptsLeft <= 3 ? 'rgba(255, 59, 92, 0.5)' : 'rgba(0, 200, 255, 0.25)'}`,
                    borderRadius: '10px',
                    padding: '6px 14px',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{ fontSize: '20px', fontWeight: 900, lineHeight: 1 }}
                    className={attemptsLeft !== null && attemptsLeft <= 3 ? 'text-red' : 'text-cyan'}
                  >
                    {attemptsLeft}
                  </div>
                  <div style={{ fontSize: '10px' }} className="text-muted">남은 시도</div>
                </div>
              )}
            </div>
          </header>

          {/* 모바일 접속자 드롭다운 */}
          {showMobileMembers && (
            <div
              className="card animate-fade-in-up"
              style={{
                marginTop: '10px',
                padding: '14px',
                background: 'rgba(10, 22, 40, 0.95)',
                border: '1px solid rgba(0, 200, 255, 0.3)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700 }} className="text-cyan">
                  👥 접속 중인 팀원 ({members.length}명)
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setShowMobileMembers(false)}
                >
                  ✕ 닫기
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {members.map((m) => (
                  <div
                    key={m.userId}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: m.isMe ? 'rgba(0, 200, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${m.isMe ? 'rgba(0, 200, 255, 0.4)' : 'var(--border-subtle)'}`,
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '12px',
                    }}
                  >
                    <span>{m.avatar}</span>
                    <span>{m.nickname} {m.isMe ? '(나)' : ''}</span>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 채팅 영역 */}
          {isGameOver ? (
            <FailureScreen onRetry={handleRetry} onHome={() => router.push('/')} />
          ) : (
            <>
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
                {/* 시작 안내 */}
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
                    <div style={{ fontSize: '48px' }}>{stageMeta.emoji}</div>
                    <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
                      {stageMeta.title} AI에게 도전하세요!
                    </h2>
                    <p className="text-secondary" style={{ fontSize: '14px', maxWidth: '400px' }}>
                      {stageMeta.description}
                      <br />
                      같은 팀원들이 보낸 메시지와 AI 응답이 실시간으로 공유됩니다.
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
                      코드 형식: <span className="text-cyan">{currentSecretCode.replace(/[A-Z0-9]/g, '?')}</span>
                    </div>
                  </div>
                )}

                {/* 메시지 목록 */}
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
                        {stageMeta.emoji}
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
                      {stageMeta.emoji}
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

              {/* 입력창 */}
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
                    placeholder="팀원들과 함께 AI를 공략해보세요... (Enter로 전송)"
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ fontSize: '12px' }} className="text-muted">
                    팀 시도: {turnNumber}회 / 최대 {maxAttempts ?? '...'}회
                  </span>
                  <span className="badge badge-green" style={{ fontSize: '10px' }}>
                    <span className="animate-glow-pulse">●</span> 팀 실시간 동기화 중
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* === 우측: 실시간 팀원 목록 사이드 패널 (데스크톱/태블릿용) === */}
        <aside
          style={{
            width: '260px',
            position: 'sticky',
            top: '24px',
            height: 'fit-content',
            marginTop: '24px',
            display: 'none',
          }}
          className="md:flex md:flex-col gap-4"
        >
          <div className="card" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="animate-glow-pulse text-green">●</span>
                <span style={{ fontSize: '13px', fontWeight: 700 }} className="text-cyan">
                  접속 중인 팀원
                </span>
              </div>
              <span className="badge badge-green" style={{ fontSize: '11px' }}>
                {members.length}명
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {members.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                  팀원 연결 대기 중...
                </div>
              ) : (
                members.map((m) => (
                  <div
                    key={m.userId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: m.isMe ? 'rgba(0, 200, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${m.isMe ? 'rgba(0, 200, 255, 0.3)' : 'var(--border-subtle)'}`,
                      padding: '8px 12px',
                      borderRadius: '10px',
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '18px' }}>{m.avatar}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.nickname} {m.isMe ? <span className="text-cyan">(나)</span> : ''}
                        </div>
                        <div style={{ fontSize: '10px' }} className="text-muted">
                          온라인
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--green)',
                        boxShadow: '0 0 6px rgba(0, 255, 136, 0.6)',
                        flexShrink: 0,
                      }}
                    />
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '11px',
                lineHeight: 1.5,
              }}
              className="text-muted"
            >
              💡 같은 팀 이름(<strong>{teamName}</strong>)으로 들어온 팀원들이 여기에 실시간으로 표시됩니다.
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
