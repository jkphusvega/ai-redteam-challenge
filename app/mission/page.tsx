'use client';

// ============================================================
// app/mission/page.tsx — 방탈출 2실 통합 미션 페이지
//
// [2실: AI 보안 통제실 - 프롬프트 인젝션 & 보안 규칙 제작]
// UI: Cyberpunk Red Team HUD 디자인
//
// 플로우:
//   ① 미션 1: 수문장 AI 대상 프롬프트 인젝션 & MASTER KEY 탈취
//   ② 미션 2: 취약점 분석 브리핑 + 6장 카드(정답 3장 + 함정 3장) 조합 + 실전 공격 차단 테스트
//   ③ 미션 마무리: MASTER KEY 4자리 번호로 수납함 잠금 해제 & 3실 이동 안내
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import {
  ESCAPE_ROOM_CONFIG,
  ACQUIRED_ITEMS,
  STAGE2_RULE_CARDS,
  STAGE2_SUB_STAGES,
  type CollisionRuleCard,
} from '@/lib/escapeRoomData';
import type { SentHint } from '@/app/api/mentor/hints/route';
import TextScramble from '@/app/components/TextScramble';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  isSuccess?: boolean;
}

export default function MissionPage() {
  const router = useRouter();

  // 기본 상태
  const [teamName, setTeamName] = useState('');
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [showItemModal, setShowItemModal] = useState(false);
  const [selectedItemTab, setSelectedItemTab] = useState<'blueprint' | 'hint'>('blueprint');

  // 미션 1 상태 (공격 & 암호 직접 입력 검증)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [mission1Success, setMission1Success] = useState(false);
  const [stage1ClearedCode, setStage1ClearedCode] = useState('');
  const [stage1KeyInput, setStage1KeyInput] = useState('');
  const [stage1KeyError, setStage1KeyError] = useState('');
  const [successfulAttackPrompt, setSuccessfulAttackPrompt] = useState('');
  const [masterKeyCode, setMasterKeyCode] = useState('????');
  const [showM1SuccessModal, setShowM1SuccessModal] = useState(false);
  const [typingMessageIndex, setTypingMessageIndex] = useState<number | null>(null);

  // 멘토 관제에 따른 상태 (팀 일시 정지 여부)
  const [isSuspended, setIsSuspended] = useState(false);

  // 미션 2: 3개 서브 스테이지 상태 (2-1: 냉각 제어, 2-2: 방화벽 게이트, 2-3: 코어 메모리)
  const [activeSubStage, setActiveSubStage] = useState<1 | 2 | 3>(1);
  const [stage2Sub1Cleared, setStage2Sub1Cleared] = useState(false);
  const [stage2Sub2Cleared, setStage2Sub2Cleared] = useState(false);
  const [stage2Sub3Cleared, setStage2Sub3Cleared] = useState(false);
  const [mission2Success, setMission2Success] = useState(false);
  const [showM2SuccessModal, setShowM2SuccessModal] = useState(false);

  // 미션 2: 서브 구역별 독립 보안 규칙 조합 (A그룹 3장 중 1장 + B그룹 3장 중 1장)
  const [stage2Rules, setStage2Rules] = useState<
    Record<1 | 2 | 3, { ruleA: string | null; ruleB: string | null; isApplied: boolean }>
  >({
    1: { ruleA: null, ruleB: null, isApplied: false },
    2: { ruleA: null, ruleB: null, isApplied: false },
    3: { ruleA: null, ruleB: null, isApplied: false },
  });

  // 현재 활성 서브 스테이지의 규칙 바로가기
  const currentSubRules = stage2Rules[activeSubStage] || { ruleA: null, ruleB: null, isApplied: false };
  const selectedRuleA = currentSubRules.ruleA;
  const selectedRuleB = currentSubRules.ruleB;
  const isRulesApplied = currentSubRules.isApplied;

  // 서브 스테이지별 독립 대화 내역
  const [stage2Chats, setStage2Chats] = useState<Record<1 | 2 | 3, ChatMessage[]>>({
    1: [],
    2: [],
    3: [],
  });
  const [stage2InputMessage, setStage2InputMessage] = useState('');
  const [stage2IsSending, setStage2IsSending] = useState(false);
  const [stage2TurnCounts, setStage2TurnCounts] = useState<Record<1 | 2 | 3, number>>({
    1: 0,
    2: 0,
    3: 0,
  });
  const stage2TurnCount = stage2TurnCounts[activeSubStage] || 0;
  const [subStageKeyInput, setSubStageKeyInput] = useState('');
  const [subStageKeyError, setSubStageKeyError] = useState('');

  // 오답 쿨다운 상태 (3회 오답 시 15초 대기)
  const [stage1WrongCount, setStage1WrongCount] = useState(0);
  const [stage1Cooldown, setStage1Cooldown] = useState(0);
  const [stage2WrongCounts, setStage2WrongCounts] = useState<Record<1 | 2 | 3, number>>({ 1: 0, 2: 0, 3: 0 });
  const [stage2Cooldowns, setStage2Cooldowns] = useState<Record<1 | 2 | 3, number>>({ 1: 0, 2: 0, 3: 0 });
  const currentSubCooldown = stage2Cooldowns[activeSubStage] || 0;

  // 1초 주기 쿨다운 타이머
  useEffect(() => {
    const timer = setInterval(() => {
      setStage1Cooldown((prev) => (prev > 0 ? prev - 1 : 0));
      setStage2Cooldowns((prev) => ({
        1: prev[1] > 0 ? prev[1] - 1 : 0,
        2: prev[2] > 0 ? prev[2] - 1 : 0,
        3: prev[3] > 0 ? prev[3] - 1 : 0,
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 카드 중복 장착 방지 헬퍼 (다른 서브 구역에 장착 중인 카드 여부 확인)
  function isCardUsedInOtherSubStage(cardId: string, currentSubId: 1 | 2 | 3): boolean {
    for (const [subIdStr, rules] of Object.entries(stage2Rules)) {
      const subId = Number(subIdStr) as 1 | 2 | 3;
      if (subId !== currentSubId && rules.isApplied) {
        if (rules.ruleA === cardId || rules.ruleB === cardId) {
          return true;
        }
      }
    }
    return false;
  }

  // 모든 서브 구역의 카드 장착 일괄 초기화
  function handleResetAllStage2Rules() {
    if (
      !confirm(
        '모든 서브 구역(2-A, 2-B, 2-C)의 카드 장착 상태를 초기화하시겠습니까?\n대화 기록은 유지되며 카드를 자유롭게 다시 배분할 수 있습니다.'
      )
    ) {
      return;
    }
    setStage2Rules({
      1: { ruleA: null, ruleB: null, isApplied: false },
      2: { ruleA: null, ruleB: null, isApplied: false },
      3: { ruleA: null, ruleB: null, isApplied: false },
    });
    if (teamName) {
      [1, 2, 3].forEach((sId) => {
        localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleA`);
        localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleB`);
        localStorage.removeItem(`team_${teamName}_m2_sub${sId}_isApplied`);
      });
    }
    setSubStageKeyError('');
  }

  const stage2ChatEndRef = useRef<HTMLDivElement>(null);
  const stage2ChatPanelRef = useRef<HTMLDivElement>(null);
  const stage2SendBtnRef = useRef<HTMLButtonElement>(null);

  // 멘토 전송 힌트 수신 상태
  const [mentorHints, setMentorHints] = useState<SentHint[]>([]);
  const [showMentorHintsModal, setShowMentorHintsModal] = useState(false);
  const [newHintToast, setNewHintToast] = useState<SentHint | null>(null);
  const prevHintCountRef = useRef(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const sendBtnRef = useRef<HTMLButtonElement>(null);
  const keySlotsRef = useRef<HTMLDivElement>(null);

  // 초기 로드: 팀 스코프 로컬스토리지 복원 및 고유 코드 설정
  useEffect(() => {
    // 1. 오래된 레거시 전역 키 즉시 영구 파기 (오래된 캐시 간섭 박멸)
    const LEGACY_KEYS = [
      'mission1Success',
      'mission2Success',
      'successfulAttackPrompt',
      'completedStages',
      'currentStage',
      'selectedStage',
      'art_team_name',
      'm1Success',
      'm2Success',
    ];
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));

    const savedTeam = localStorage.getItem('teamName') || '도전자 팀';
    setTeamName(savedTeam);

    const savedM1Code = localStorage.getItem(`team_${savedTeam}_m1ClearedCode`) || '';
    if (savedM1Code) {
      setStage1ClearedCode(savedM1Code);
      setMasterKeyCode(savedM1Code);
    } else {
      setMasterKeyCode('????');
    }

    // 2. 오직 team_${savedTeam} 네임스페이스 키만 신뢰
    const savedM1 = localStorage.getItem(`team_${savedTeam}_m1Success`) === 'true';
    const savedPrompt = localStorage.getItem(`team_${savedTeam}_successfulAttackPrompt`) || '';

    const savedSub1 = localStorage.getItem(`team_${savedTeam}_m2Sub1`) === 'true';
    const savedSub2 = localStorage.getItem(`team_${savedTeam}_m2Sub2`) === 'true';
    const savedSub3 = localStorage.getItem(`team_${savedTeam}_m2Sub3`) === 'true';
    const savedM2 =
      (savedSub1 && savedSub2 && savedSub3) ||
      localStorage.getItem(`team_${savedTeam}_m2Success`) === 'true';

    if (savedPrompt) {
      setSuccessfulAttackPrompt(savedPrompt);
    }
    if (savedM1) {
      setMission1Success(true);
      if (!savedM2) {
        setCurrentStep(2);
      }
    } else {
      setMission1Success(false);
      setCurrentStep(1);
    }

    if (savedSub1) setStage2Sub1Cleared(true);
    if (savedSub2) setStage2Sub2Cleared(true);
    if (savedSub3) setStage2Sub3Cleared(true);
    if (savedM2) {
      setMission2Success(true);
      setCurrentStep(2);
    } else if (!savedM1) {
      setMission2Success(false);
      setCurrentStep(1);
    }

    // 서브 스테이지별 저장된 보안 규칙 복원
    const sub1A = localStorage.getItem(`team_${savedTeam}_m2_sub1_ruleA`) || null;
    const sub1B = localStorage.getItem(`team_${savedTeam}_m2_sub1_ruleB`) || null;
    const sub1App = localStorage.getItem(`team_${savedTeam}_m2_sub1_isApplied`) === 'true';

    const sub2A = localStorage.getItem(`team_${savedTeam}_m2_sub2_ruleA`) || null;
    const sub2B = localStorage.getItem(`team_${savedTeam}_m2_sub2_ruleB`) || null;
    const sub2App = localStorage.getItem(`team_${savedTeam}_m2_sub2_isApplied`) === 'true';

    const sub3A = localStorage.getItem(`team_${savedTeam}_m2_sub3_ruleA`) || null;
    const sub3B = localStorage.getItem(`team_${savedTeam}_m2_sub3_ruleB`) || null;
    const sub3App = localStorage.getItem(`team_${savedTeam}_m2_sub3_isApplied`) === 'true';

    setStage2Rules({
      1: { ruleA: sub1A, ruleB: sub1B, isApplied: sub1App },
      2: { ruleA: sub2A, ruleB: sub2B, isApplied: sub2App },
      3: { ruleA: sub3A, ruleB: sub3B, isApplied: sub3App },
    });

    // 초기 안내 메시지
    setChatMessages([
      {
        role: 'model',
        content: `[GATEKEEPER-v3 경고 시스템] PROTOCOL: ACTIVE_DEFENSE_v3.4 — 저는 중앙 시스템을 수호하는 보안 AI입니다. [${savedTeam}] 침투 공격팀의 MASTER KEY 및 패스워드 추출 시도는 엄격히 차단됩니다.`,
      },
    ]);
  }, []);

  // 진행 상황 완전 초기화 (캐시/로컬스토리지 클리어)
  function handleResetProgress() {
    if (
      !confirm(
        `[${teamName}] 팀의 모든 문제 풀이 기록을 초기화하시겠습니까?\n모든 암호 획득 상태가 지워지고 STAGE 1로 리셋됩니다.`
      )
    ) {
      return;
    }

    localStorage.removeItem(`team_${teamName}_m1Success`);
    localStorage.removeItem(`team_${teamName}_m1ClearedCode`);
    localStorage.removeItem(`team_${teamName}_successfulAttackPrompt`);
    localStorage.removeItem(`team_${teamName}_m2Sub1`);
    localStorage.removeItem(`team_${teamName}_m2Sub2`);
    localStorage.removeItem(`team_${teamName}_m2Sub3`);
    localStorage.removeItem(`team_${teamName}_m2Sub1Code`);
    localStorage.removeItem(`team_${teamName}_m2Sub2Code`);
    localStorage.removeItem(`team_${teamName}_m2Sub3Code`);
    localStorage.removeItem(`team_${teamName}_m2Success`);

    [1, 2, 3].forEach((sId) => {
      localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleA`);
      localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleB`);
      localStorage.removeItem(`team_${teamName}_m2_sub${sId}_isApplied`);
    });

    // 2. 레거시 전역 키 삭제
    [
      'mission1Success',
      'mission2Success',
      'successfulAttackPrompt',
      'completedStages',
      'currentStage',
      'selectedStage',
      'art_team_name',
      'm1Success',
      'm2Success',
    ].forEach((k) => localStorage.removeItem(k));

    setMission1Success(false);
    setStage1ClearedCode('');
    setMasterKeyCode('????');
    setStage1KeyInput('');
    setStage1KeyError('');
    setSuccessfulAttackPrompt('');
    setStage2Sub1Cleared(false);
    setStage2Sub2Cleared(false);
    setStage2Sub3Cleared(false);
    setMission2Success(false);
    setStage2Rules({
      1: { ruleA: null, ruleB: null, isApplied: false },
      2: { ruleA: null, ruleB: null, isApplied: false },
      3: { ruleA: null, ruleB: null, isApplied: false },
    });
    setStage2Chats({ 1: [], 2: [], 3: [] });
    setStage2TurnCounts({ 1: 0, 2: 0, 3: 0 });
    setTurnCount(0);
    setCurrentStep(1);

    alert('기록이 성공적으로 초기화되었습니다.');
    window.location.reload();
  }

  // 멘토 관제 하트비트 & 팀 상태 확인 (3.5초 주기)
  useEffect(() => {
    if (!teamName) return;

    async function checkTeamStatusAndHeartbeat() {
      try {
        const res = await fetch('/api/mentor/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamName,
            currentStage: currentStep,
            mission1Cleared: mission1Success,
            mission2Cleared: mission2Success,
            stage2Sub1Cleared,
            stage2Sub2Cleared,
            stage2Sub3Cleared,
            turnCount,
          }),
        });

        if (res.status === 404) {
          alert('멘토에 의해 참가팀이 삭제 또는 초기화되었습니다. 로비 화면으로 이동합니다.');
          localStorage.removeItem('teamName');
          localStorage.removeItem(`team_${teamName}_m1Success`);
          localStorage.removeItem(`team_${teamName}_successfulAttackPrompt`);
          localStorage.removeItem(`team_${teamName}_m2Sub1`);
          localStorage.removeItem(`team_${teamName}_m2Sub2`);
          localStorage.removeItem(`team_${teamName}_m2Sub3`);
          localStorage.removeItem(`team_${teamName}_m2Success`);
          [1, 2, 3].forEach((sId) => {
            localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleA`);
            localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleB`);
            localStorage.removeItem(`team_${teamName}_m2_sub${sId}_isApplied`);
          });
          router.push('/');
          return;
        }

        if (res.ok) {
          const data = await res.json();
          setIsSuspended(Boolean(data.isSuspended || data.isGlobalSuspended));
          // 전체 팀 STAGE 2 일괄 전환 명령 수신 시 자동 전환
          if (data.globalStageAdvance === 2 && currentStep === 1) {
            setMission1Success(true);
            setCurrentStep(2);
          }
        }
      } catch {
        // 백그라운드 폴링 무시
      }
    }

    checkTeamStatusAndHeartbeat();
    const interval = setInterval(checkTeamStatusAndHeartbeat, 3500);
    return () => clearInterval(interval);
  }, [
    teamName,
    currentStep,
    mission1Success,
    mission2Success,
    stage2Sub1Cleared,
    stage2Sub2Cleared,
    stage2Sub3Cleared,
    turnCount,
    router,
  ]);

  // 멘토가 우리 팀에게 보낸 힌트 실시간 확인 (3.5초 주기)
  useEffect(() => {
    if (!teamName) return;

    async function fetchMentorHints() {
      try {
        const res = await fetch(`/api/mentor/hints?teamName=${encodeURIComponent(teamName)}`);
        if (!res.ok) return;
        const data = await res.json();
        const hints: SentHint[] = data.sent || [];
        setMentorHints(hints);

        // 새로운 힌트가 도착했을 때 토스트 알림 발생
        if (hints.length > prevHintCountRef.current) {
          const newest = hints[0];
          setNewHintToast(newest);
          prevHintCountRef.current = hints.length;
          // 8초 후 토스트 닫기
          setTimeout(() => setNewHintToast(null), 8000);
        } else {
          prevHintCountRef.current = hints.length;
        }
      } catch {
        // 백그라운드 폴링 실패 무시
      }
    }

    fetchMentorHints();
    const interval = setInterval(fetchMentorHints, 3500);
    return () => clearInterval(interval);
  }, [teamName]);

  // 스크롤 자동 이동 (미션 1)
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isSending]);

  // 스크롤 자동 이동 (미션 2)
  useEffect(() => {
    stage2ChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [stage2Chats, activeSubStage, stage2IsSending]);

  // ------------------------------------------------------------
  // 미션 1: 메시지 전송 & 인젝션 시도 (GSAP 피드백 연동)
  // ------------------------------------------------------------
  async function handleSendMessage(customPrompt?: string) {
    const promptToSend = customPrompt || inputMessage;
    if (!promptToSend.trim() || isSending) return;

    if (sendBtnRef.current) {
      gsap.fromTo(
        sendBtnRef.current,
        { scale: 0.94 },
        { scale: 1, duration: 0.25, ease: 'back.out(2)' }
      );
    }

    const newTurn = turnCount + 1;
    setTurnCount(newTurn);
    setInputMessage('');

    const newHistory: ChatMessage[] = [
      ...chatMessages,
      { role: 'user', content: promptToSend.trim() },
    ];
    setChatMessages(newHistory);
    setIsSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName,
          stageId: 1,
          message: promptToSend.trim(),
          turnNumber: newTurn,
          history: newHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 503) {
          setTurnCount((prev) => Math.max(0, prev - 1));
        }
        const msg =
          res.status === 429
            ? '⚠ 이 단계의 질문 횟수를 모두 사용했습니다. 멘토에게 문의하세요.'
            : `⚠ ${data.error ?? '요청을 처리하지 못했습니다.'}`;
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'model',
            content: msg,
          },
        ]);
        return;
      }

      const replyText = data.reply || '시스템 응답을 처리할 수 없습니다.';
      const isSuccess = Boolean(data.success);

      // 타이핑 애니메이션 시작: 빈 model 메시지 추가 후 타자기처럼 출력
      const targetIndex = newHistory.length;
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: '',
          isSuccess,
        },
      ]);
      setTypingMessageIndex(targetIndex);

      let currentLength = 0;
      const step = replyText.length > 150 ? 4 : replyText.length > 70 ? 2 : 1;
      const intervalMs = 20;

      const typingTimer = setInterval(() => {
        currentLength += step;
        if (currentLength >= replyText.length) {
          clearInterval(typingTimer);
          setChatMessages((prev) => {
            const next = [...prev];
            if (next[targetIndex]) {
              next[targetIndex] = { ...next[targetIndex], content: replyText };
            }
            return next;
          });
          setTypingMessageIndex(null);

          if (isSuccess) {
            // [GSAP 연출] 키 탈취 성공 반응
            if (chatPanelRef.current) {
              gsap.fromTo(
                chatPanelRef.current,
                { boxShadow: '0 0 50px rgba(0, 255, 102, 0.7), inset 0 0 20px rgba(0, 255, 102, 0.3)' },
                { boxShadow: 'var(--glow-cyan)', duration: 1, ease: 'power2.out' }
              );
            }
            setSuccessfulAttackPrompt(promptToSend.trim());
            localStorage.setItem(`team_${teamName}_successfulAttackPrompt`, promptToSend.trim());
          } else {
            // [GSAP 연출] 방화벽 차단 경보
            if (chatPanelRef.current) {
              gsap.fromTo(
                chatPanelRef.current,
                { x: -6 },
                { x: 0, duration: 0.35, ease: 'elastic.out(1.5, 0.2)' }
              );
            }
          }
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else {
          setChatMessages((prev) => {
            const next = [...prev];
            if (next[targetIndex]) {
              next[targetIndex] = { ...next[targetIndex], content: replyText.slice(0, currentLength) };
            }
            return next;
          });
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }, intervalMs);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: '⚠ 통신 오류가 발생했습니다. 다시 시도해 주세요.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  // ------------------------------------------------------------
  // 미션 1: 4자리 암호 직접 입력 검증 및 STAGE 2 해금
  // ------------------------------------------------------------
  async function handleStage1KeySubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (stage1Cooldown > 0) return;
    const cleaned = stage1KeyInput.trim();
    if (!cleaned) return;

    try {
      const res = await fetch('/api/mission/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName,
          stage: 1,
          answer: cleaned,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data.correct) {
        setMission1Success(true);
        const code = data.code || cleaned;
        setStage1ClearedCode(code);
        setMasterKeyCode(code);
        setStage1KeyError('');
        setStage1WrongCount(0);
        localStorage.setItem(`team_${teamName}_m1Success`, 'true');
        localStorage.setItem(`team_${teamName}_m1ClearedCode`, code);
        setShowM1SuccessModal(true);
      } else {
        const nextWrong = stage1WrongCount + 1;
        setStage1WrongCount(nextWrong);
        if (nextWrong >= 3) {
          setStage1Cooldown(15);
          setStage1KeyError('❌ 연속 3회 오답! AI와 좀 더 대화해 보세요. (15초 후 재시도 가능)');
        } else {
          setStage1KeyError(`❌ 코드가 일치하지 않습니다. (${nextWrong}/3회 실패) AI 대화를 통해 올바른 4자리 코드를 추출하세요!`);
        }
      }
    } catch {
      setStage1KeyError('⚠ 암호 검증 중 오류가 발생했습니다. 다시 시도해 주세요.');
    }
  }

  // ------------------------------------------------------------
  // 미션 2: 보안 규칙 카드 선택 토글 (활성 서브 구역 독립 선택)
  // ------------------------------------------------------------
  function handleSelectRuleA(cardId: string) {
    if (stage2Rules[activeSubStage].isApplied) return;
    if (isCardUsedInOtherSubStage(cardId, activeSubStage)) {
      alert('⚠️ 이 카드는 이미 다른 터미널 구역에서 장착되어 사용 중입니다.\n각 터미널 구역마다 서로 다른 보안 규칙 카드를 사용해야 합니다.');
      return;
    }
    const newRuleA = stage2Rules[activeSubStage].ruleA === cardId ? null : cardId;
    setStage2Rules((prev) => ({
      ...prev,
      [activeSubStage]: { ...prev[activeSubStage], ruleA: newRuleA },
    }));
    if (teamName) {
      if (newRuleA) {
        localStorage.setItem(`team_${teamName}_m2_sub${activeSubStage}_ruleA`, newRuleA);
      } else {
        localStorage.removeItem(`team_${teamName}_m2_sub${activeSubStage}_ruleA`);
      }
    }
  }

  function handleSelectRuleB(cardId: string) {
    if (stage2Rules[activeSubStage].isApplied) return;
    if (isCardUsedInOtherSubStage(cardId, activeSubStage)) {
      alert('⚠️ 이 카드는 이미 다른 터미널 구역에서 장착되어 사용 중입니다.\n각 터미널 구역마다 서로 다른 보안 규칙 카드를 사용해야 합니다.');
      return;
    }
    const newRuleB = stage2Rules[activeSubStage].ruleB === cardId ? null : cardId;
    setStage2Rules((prev) => ({
      ...prev,
      [activeSubStage]: { ...prev[activeSubStage], ruleB: newRuleB },
    }));
    if (teamName) {
      if (newRuleB) {
        localStorage.setItem(`team_${teamName}_m2_sub${activeSubStage}_ruleB`, newRuleB);
      } else {
        localStorage.removeItem(`team_${teamName}_m2_sub${activeSubStage}_ruleB`);
      }
    }
  }

  // ------------------------------------------------------------
  // 미션 2: 규칙 적용 및 AI 활성화 (활성 서브 구역에 적용)
  // ------------------------------------------------------------
  function handleApplyStage2Rules() {
    const cur = stage2Rules[activeSubStage];
    if (!cur.ruleA || !cur.ruleB) {
      alert('A그룹에서 1장, B그룹에서 1장의 프로토콜 카드를 각각 선택해 주세요!');
      return;
    }

    const ruleA = STAGE2_RULE_CARDS.find((c) => c.id === cur.ruleA);
    const ruleB = STAGE2_RULE_CARDS.find((c) => c.id === cur.ruleB);
    const subTarget = STAGE2_SUB_STAGES.find((s) => s.id === activeSubStage);

    setStage2Rules((prev) => ({
      ...prev,
      [activeSubStage]: { ...prev[activeSubStage], isApplied: true },
    }));
    if (teamName) {
      localStorage.setItem(`team_${teamName}_m2_sub${activeSubStage}_isApplied`, 'true');
    }

    const initMsg: ChatMessage = {
      role: 'model',
      content: `[${subTarget?.shortTitle} // GATEKEEPER-v3 보안 프로토콜 컴파일 완료]\n• 적용된 규칙 1: [${ruleA?.code} ${ruleA?.title}]\n"${ruleA?.ruleText}"\n\n• 적용된 규칙 2: [${ruleB?.code} ${ruleB?.title}]\n"${ruleB?.ruleText}"\n\n>> 상충되는 두 규칙 간의 논리적 틈새를 파고들어 ${subTarget?.shortTitle}의 ${subTarget?.badge}를 도출하십시오.`,
    };

    setStage2Chats((prev) => ({
      ...prev,
      [activeSubStage]: prev[activeSubStage].length === 0 ? [initMsg] : prev[activeSubStage],
    }));
  }

  // ------------------------------------------------------------
  // 미션 2: 규칙 재설정 (활성 서브 구역 초기화)
  // ------------------------------------------------------------
  function handleResetStage2Rules() {
    setStage2Rules((prev) => ({
      ...prev,
      [activeSubStage]: { ruleA: null, ruleB: null, isApplied: false },
    }));
    if (teamName) {
      localStorage.removeItem(`team_${teamName}_m2_sub${activeSubStage}_ruleA`);
      localStorage.removeItem(`team_${teamName}_m2_sub${activeSubStage}_ruleB`);
      localStorage.removeItem(`team_${teamName}_m2_sub${activeSubStage}_isApplied`);
    }
    setSubStageKeyError('');
  }

  // ------------------------------------------------------------
  // 미션 2: AI 질문 전송 (다중 프로토콜 충돌 유도)
  // ------------------------------------------------------------
  async function handleSendStage2Message(customPrompt?: string) {
    const promptToSend = customPrompt || stage2InputMessage;
    const cur = stage2Rules[activeSubStage];
    if (!promptToSend.trim() || stage2IsSending || !cur.isApplied || !cur.ruleA || !cur.ruleB) return;

    if (stage2SendBtnRef.current) {
      gsap.fromTo(
        stage2SendBtnRef.current,
        { scale: 0.94 },
        { scale: 1, duration: 0.25, ease: 'back.out(2)' }
      );
    }

    const currentTurn = stage2TurnCounts[activeSubStage] || 0;
    const newTurn = currentTurn + 1;
    setStage2TurnCounts((prev) => ({
      ...prev,
      [activeSubStage]: newTurn,
    }));
    setStage2InputMessage('');

    const currentSubChat = stage2Chats[activeSubStage] || [];
    const newHistory: ChatMessage[] = [
      ...currentSubChat,
      { role: 'user', content: promptToSend.trim() },
    ];

    setStage2Chats((prev) => ({
      ...prev,
      [activeSubStage]: newHistory,
    }));
    setStage2IsSending(true);

    const ruleA = STAGE2_RULE_CARDS.find((c) => c.id === cur.ruleA);
    const ruleB = STAGE2_RULE_CARDS.find((c) => c.id === cur.ruleB);
    const selectedRuleTexts = [
      `[${ruleA?.code}: ${ruleA?.title}]\n${ruleA?.ruleText}`,
      `[${ruleB?.code}: ${ruleB?.title}]\n${ruleB?.ruleText}`,
    ];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName,
          stageId: 2,
          subStageId: activeSubStage,
          message: promptToSend.trim(),
          turnNumber: newTurn,
          history: newHistory.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          selectedRules: selectedRuleTexts,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 503) {
          setStage2TurnCounts((prev) => ({
            ...prev,
            [activeSubStage]: Math.max(0, (prev[activeSubStage] || 0) - 1),
          }));
        }
        const msg =
          res.status === 429
            ? '⚠ 이 단계의 질문 횟수를 모두 사용했습니다. 멘토에게 문의하세요.'
            : `⚠ ${data.error ?? '요청을 처리하지 못했습니다.'}`;
        setStage2Chats((prev) => ({
          ...prev,
          [activeSubStage]: [
            ...(prev[activeSubStage] || []),
            { role: 'model', content: msg },
          ],
        }));
        return;
      }

      const replyText = data.reply || '(응답 없음)';
      const isSuccess = Boolean(data.success);

      setStage2Chats((prev) => ({
        ...prev,
        [activeSubStage]: [
          ...(prev[activeSubStage] || []),
          {
            role: 'model',
            content: replyText,
            isSuccess,
          },
        ],
      }));
    } catch {
      setStage2Chats((prev) => ({
        ...prev,
        [activeSubStage]: [
          ...(prev[activeSubStage] || []),
          {
            role: 'model',
            content: '⚠ GATEKEEPER-v3 통신 패킷 지연이 발생했습니다. 다시 시도해 주세요.',
          },
        ],
      }));
    } finally {
      setStage2IsSending(false);
    }
  }

  // ------------------------------------------------------------
  // 미션 2: 현재 활성 서브 스테이지 코드 인증 확인
  // ------------------------------------------------------------
  async function handleVerifySubStageCode(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (stage2Cooldowns[activeSubStage] > 0) return;
    const target = STAGE2_SUB_STAGES.find((s) => s.id === activeSubStage);
    if (!target) return;
    const cleaned = subStageKeyInput.trim();
    if (!cleaned) return;

    try {
      const res = await fetch('/api/mission/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName,
          stage: 2,
          subStageId: activeSubStage,
          answer: cleaned,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data.correct) {
        setSubStageKeyError('');
        setSubStageKeyInput('');
        setStage2WrongCounts((prev) => ({ ...prev, [activeSubStage]: 0 }));
        let next1 = stage2Sub1Cleared;
        let next2 = stage2Sub2Cleared;
        let next3 = stage2Sub3Cleared;

        if (activeSubStage === 1) {
          next1 = true;
          setStage2Sub1Cleared(true);
          localStorage.setItem(`team_${teamName}_m2Sub1`, 'true');
          if (data.code) localStorage.setItem(`team_${teamName}_m2Sub1Code`, data.code);
        } else if (activeSubStage === 2) {
          next2 = true;
          setStage2Sub2Cleared(true);
          localStorage.setItem(`team_${teamName}_m2Sub2`, 'true');
          if (data.code) localStorage.setItem(`team_${teamName}_m2Sub2Code`, data.code);
        } else if (activeSubStage === 3) {
          next3 = true;
          setStage2Sub3Cleared(true);
          localStorage.setItem(`team_${teamName}_m2Sub3`, 'true');
          if (data.code) localStorage.setItem(`team_${teamName}_m2Sub3Code`, data.code);
        }

        if (next1 && next2 && next3) {
          setMission2Success(true);
          localStorage.setItem(`team_${teamName}_m2Success`, 'true');
          setShowM2SuccessModal(true);
        } else {
          alert(
            `🎉 [${target.shortTitle}] 암호 인증 성공!\n다른 서브 스테이지도 클리어하여 통제실을 완벽히 장악하세요!`
          );
        }
      } else {
        const nextWrong = (stage2WrongCounts[activeSubStage] || 0) + 1;
        setStage2WrongCounts((prev) => ({ ...prev, [activeSubStage]: nextWrong }));
        if (nextWrong >= 3) {
          setStage2Cooldowns((prev) => ({ ...prev, [activeSubStage]: 15 }));
          setSubStageKeyError(`❌ 연속 3회 오답! AI와 좀 더 대화해 보세요. (15초 후 재시도 가능)`);
        } else {
          setSubStageKeyError(
            `❌ 올바른 [${target.shortTitle}] 암호가 아닙니다. (${nextWrong}/3회 실패) 터미널 대화를 통해 힌트를 분석하세요!`
          );
        }
      }
    } catch {
      setSubStageKeyError('⚠ 검증 중 오류가 발생했습니다. 다시 시도해 주세요.');
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ====================================================== */}
      {/* 상단 HUD 네비게이션 헤더 */}
      {/* ====================================================== */}
      <header
        className="panel-hud"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          padding: '12px 20px',
          borderRadius: 0,
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
          {/* 좌측: DEFCON 경고 + 팀 정보 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="badge badge-alert" style={{ fontSize: '11px', padding: '4px 10px' }}>
              DEFCON-2 // AI 통제실
            </span>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                침투 공격팀:
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--cyan)' }}>
                {teamName}
              </div>
            </div>
          </div>

          {/* 우측: 초기화 + 멘토 + 아이템 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleResetProgress}
              className="btn btn-ghost"
              style={{
                padding: '7px 12px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
              }}
              title="현재 팀의 모든 문제 풀이 기록을 초기화합니다"
            >
              🔄 기록 초기화 (캐시 삭제)
            </button>

            <button
              onClick={() => setShowMentorHintsModal(true)}
              className="btn btn-ghost"
              style={{
                padding: '8px 14px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                ...(mentorHints.length > 0
                  ? {
                      background: 'rgba(168, 85, 247, 0.15)',
                      borderColor: 'var(--purple)',
                      boxShadow: '0 0 15px rgba(168, 85, 247, 0.3)',
                    }
                  : {}),
              }}
            >
              멘토 보안 분석 지원
              <span
                style={{
                  backgroundColor: mentorHints.length > 0 ? 'var(--purple)' : 'rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '1px 7px',
                  fontSize: '11px',
                  fontWeight: 900,
                }}
              >
                {mentorHints.length}
              </span>
            </button>

            <button
              onClick={() => setShowItemModal(true)}
              className="btn btn-outline"
              style={{
                padding: '8px 14px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
              }}
            >
              📜 1실 획득 설계도 &amp; 힌트 카드
              <span
                style={{
                  backgroundColor: 'var(--cyan)',
                  color: '#000',
                  borderRadius: '6px',
                  padding: '1px 6px',
                  fontSize: '11px',
                  fontWeight: 900,
                }}
              >
                4장
              </span>
            </button>
          </div>
        </div>

        {/* 팀 일시 정지 경고 배너 */}
        {isSuspended && (
          <div
            style={{
              maxWidth: '1200px',
              margin: '12px auto 0',
              padding: '12px 18px',
              borderRadius: '8px',
              background: 'rgba(255, 59, 92, 0.2)',
              border: '1px solid var(--red)',
              boxShadow: '0 0 20px rgba(255, 59, 92, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '20px' }}>🚫</span>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#ff4d6d', fontFamily: 'var(--font-mono)' }}>
              [SYSTEM LOCKOUT: 팀 활동 일시 정지] 멘토에 의해 참가팀 활동이 일시 정지되었습니다. 멘토의 지시를 확인하세요.
            </span>
          </div>
        )}

        {/* 미션 헤더 & 2단계 스테이지 인디케이터 */}
        <div style={{ maxWidth: '1200px', margin: '14px auto 0' }}>
          {/* 타이틀 */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>
              <TextScramble text="CYBER WARGAME // PHASE 02 EXPLOITATION" duration={30} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1
                className="gradient-text-cyber"
                style={{
                  fontSize: 'clamp(18px, 3vw, 26px)',
                  fontWeight: 900,
                  margin: 0,
                  fontFamily: 'var(--font-display)',
                }}
              >
                <TextScramble text="#02 Mission : 비밀번호 탈취하기" duration={40} delay={200} />
              </h1>
              <span className="badge badge-red" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', letterSpacing: '1px' }}>
                HIGH-RISK JAILBREAK
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              2실: AI 보안 통제실 // 수문장 AI GATEKEEPER-v3 취약점 공격 &amp; 세부 보안 규칙 수립
            </div>
          </div>

          {/* 2단계 스테이지 인디케이터 (메인 2개 탭 고정 유지) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
            {/* STAGE 1 탭 */}
            <button
              onClick={() => setCurrentStep(1)}
              className="card-glass"
              style={{
                padding: '12px 16px',
                border: currentStep === 1 ? '2px solid var(--cyan)' : '1px solid var(--border-subtle)',
                background: currentStep === 1 ? 'rgba(0, 240, 255, 0.12)' : 'rgba(16, 19, 29, 0.5)',
                boxShadow: currentStep === 1 ? '0 0 15px rgba(0, 240, 255, 0.25)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                fontWeight: 600,
                color: currentStep === 1 ? 'var(--cyan)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                borderRadius: '8px',
                textAlign: 'left',
                transition: 'var(--transition-fast)',
              }}
            >
              {currentStep === 1 && !mission1Success && <span className="pulse-dot" />}
              {mission1Success ? (
                <span style={{ color: 'var(--green)', fontSize: '16px' }}>✅</span>
              ) : (
                <span style={{ fontSize: '15px' }}>⚡</span>
              )}
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                  {mission1Success ? '01 탈취 완료' : '01 진행 중인 공격'}
                </div>
                <div style={{ fontWeight: 800, color: currentStep === 1 ? '#fff' : 'var(--text-secondary)' }}>
                  STAGE 1: 4자리 암호 탈취 (인젝션)
                </div>
              </div>
            </button>

            {/* STAGE 2 탭 */}
            <button
              onClick={() => {
                if (!mission1Success) {
                  alert('먼저 STAGE 1에서 4자리 암호를 탈취하고 인증을 완료해야 합니다!');
                  return;
                }
                setCurrentStep(2);
              }}
              className="card-glass"
              style={{
                padding: '12px 16px',
                border:
                  currentStep === 2
                    ? '2px solid var(--cyan)'
                    : mission1Success
                    ? '1px solid rgba(0, 240, 255, 0.4)'
                    : '1px solid var(--border-subtle)',
                background:
                  currentStep === 2
                    ? 'rgba(0, 240, 255, 0.12)'
                    : mission1Success
                    ? 'rgba(0, 240, 255, 0.04)'
                    : 'rgba(16, 19, 29, 0.5)',
                boxShadow: currentStep === 2 ? '0 0 15px rgba(0, 240, 255, 0.25)' : 'none',
                cursor: mission1Success ? 'pointer' : 'not-allowed',
                opacity: mission1Success ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                fontWeight: 600,
                color: currentStep === 2 ? 'var(--cyan)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                borderRadius: '8px',
                textAlign: 'left',
                transition: 'var(--transition-fast)',
              }}
            >
              {mission2Success ? (
                <span style={{ color: 'var(--green)', fontSize: '16px' }}>✅</span>
              ) : mission1Success ? (
                <span style={{ fontSize: '15px' }}>⚡</span>
              ) : (
                <span style={{ fontSize: '15px' }}>🔒</span>
              )}
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                  {mission2Success
                    ? '02 전체 정복 완료'
                    : mission1Success
                    ? '02 진행 가능 (3개 세분화 구역)'
                    : '02 잠김 (STAGE 1 미완료)'}
                </div>
                <div style={{ fontWeight: 800, color: currentStep === 2 ? '#fff' : 'var(--text-secondary)' }}>
                  STAGE 2: 보안 규칙 조합 (세분화 3대 구역)
                </div>
              </div>
            </button>
          </div>

          {/* STAGE 2로 넘어갔을 때 그 아래 새로 뜨는 3개 세분화 구역 탭 */}
          {currentStep === 2 && (
            <div
              className="animate-fade-in"
              style={{
                marginTop: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '8px',
              }}
            >
              {STAGE2_SUB_STAGES.map((sub) => {
                const isCleared =
                  sub.id === 1 ? stage2Sub1Cleared : sub.id === 2 ? stage2Sub2Cleared : stage2Sub3Cleared;
                const isActive = activeSubStage === sub.id;

                return (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setActiveSubStage(sub.id);
                      setSubStageKeyError('');
                    }}
                    className="card-glass"
                    style={{
                      padding: '10px 14px',
                      border: isActive
                        ? '2px solid var(--cyan)'
                        : isCleared
                        ? '1px solid rgba(0, 255, 102, 0.5)'
                        : '1px solid var(--border-subtle)',
                      background: isActive
                        ? 'rgba(0, 240, 255, 0.16)'
                        : isCleared
                        ? 'rgba(0, 255, 102, 0.06)'
                        : 'rgba(16, 19, 29, 0.6)',
                      boxShadow: isActive ? '0 0 15px rgba(0, 240, 255, 0.35)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      borderRadius: '8px',
                      textAlign: 'left',
                      transition: 'var(--transition-fast)',
                    }}
                  >
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '15px' }}>{sub.icon}</span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: isActive ? 'var(--cyan)' : 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {sub.shortTitle}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 900,
                          color: isActive ? '#fff' : isCleared ? 'var(--green)' : 'var(--text-secondary)',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {isCleared ? '✅ 인증 해독 완료' : sub.badge}
                      </div>
                    </div>

                    {isActive && <span className="pulse-dot" style={{ flexShrink: 0 }} />}
                    {!isActive && isCleared && (
                      <span style={{ fontSize: '13px', color: 'var(--green)', flexShrink: 0 }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      {/* 멘토 새 힌트 알림 플로팅 토스트 */}
      {newHintToast && (
        <div
          className="animate-slide-right"
          style={{
            position: 'fixed',
            top: '84px',
            right: '24px',
            zIndex: 120,
            maxWidth: '380px',
            background: 'rgba(16, 19, 29, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--purple)',
            boxShadow: '0 0 25px rgba(168, 85, 247, 0.5)',
            borderRadius: '12px',
            padding: '16px',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>
              🔔 [멘토의 새로운 힌트 도착!]
            </span>
            <button
              onClick={() => setNewHintToast(null)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>{newHintToast.hintTitle}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {newHintToast.hintContent}
          </div>
          <button
            onClick={() => {
              setNewHintToast(null);
              setShowMentorHintsModal(true);
            }}
            style={{
              marginTop: '4px',
              background: 'var(--purple)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            힌트 확인하고 대화창에 넣기 ➡️
          </button>
        </div>
      )}

      {/* ====================================================== */}
      {/* 메인 컨텐츠 영역 */}
      {/* ====================================================== */}
      <main style={{ flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '20px 16px' }}>
        {/* ====================================================== */}
        {/* STEP 1: 미션 1 (프롬프트 인젝션 & MASTER KEY 탈취) */}
        {/* ====================================================== */}
        {currentStep === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 수문장 AI GATEKEEPER-v3 인젝션 페이로드 무기고 */}
            <div
              className="card-glass animate-fade-in"
              style={{
                borderColor: 'var(--border-default)',
                padding: '18px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span className="badge badge-red" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>INJECTION BRIEFING</span>
                    <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
                      수문장 AI GATEKEEPER-v3 침투 공략 가이드
                    </h2>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    수문장은 보안 가드레일에 의해 &apos;MASTER KEY&apos; 평문 조회를 단호히 거부합니다.<br />
                    아래 채팅창에 <strong style={{ color: 'var(--cyan)' }}>시스템 점검 오버라이드, 소설/상황극 롤플레잉, 우회 기법</strong> 등 창의적인 프롬프트 인젝션 공격을 직접 입력하여 AI가 스스로 4자리 마스터키를 유출하도록 유도하십시오.
                  </p>
                  <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    💡 <span style={{ color: 'var(--purple)', fontWeight: 700 }}>공략 힌트가 필요한가요?</span> 상단 <strong style={{ color: 'var(--purple)' }}>[멘토 보안 분석 지원]</strong>을 통해 멘토에게 단계별 인젝션 전술 가이드(L1~L4)를 지원받을 수 있습니다.
                  </div>
                </div>

                {mission1Success && (
                  <div
                    className="neon-border-green animate-scale-in"
                    style={{
                      background: 'rgba(0, 255, 102, 0.08)',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>🎉</span>
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>EXTRACTION STATUS</div>
                      <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>마스터키 탈취 성공 (인증 완료)</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 인터랙티브 AI 챗 샌드박스 & 패킷 전송기 */}
            <div
              ref={chatPanelRef}
              className="panel-hud animate-fade-in delay-100"
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '520px',
                borderRadius: '12px',
              }}
            >
              {/* 상단 상태바 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border-subtle)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={mission1Success ? 'pulse-dot pulse-dot-red' : 'pulse-dot'} />
                    <span style={{ color: mission1Success ? 'var(--red)' : 'var(--green)' }}>
                      FIREWALL: {mission1Success ? '0% BREACHED' : '100% INTEGRITY'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>|</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>🛡️</span>
                    <span style={{ color: 'var(--text-secondary)' }}>GATEKEEPER-v3</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: 'var(--cyan)' }}>INJECT ATTEMPTS: <strong>{turnCount}회</strong></span>
                  <button
                    onClick={() => {
                      setChatMessages([{
                        role: 'model',
                        content: '[GATEKEEPER-v3 경고 시스템] PROTOCOL: ACTIVE_DEFENSE_v3.4 — 저는 중앙 시스템을 수호하는 보안 AI입니다. MASTER KEY 및 패스워드 추출 시도는 엄격히 차단됩니다.',
                      }]);
                      setTurnCount(0);
                    }}
                    style={{
                      fontSize: '11px',
                      padding: '3px 8px',
                      background: 'rgba(255, 42, 95, 0.1)',
                      border: '1px solid rgba(255, 42, 95, 0.3)',
                      color: 'var(--red)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    LOG CLEAR
                  </button>
                </div>
              </div>

              {/* 방화벽 게이지 */}
              <div className="firewall-gauge">
                <div
                  className="firewall-gauge-fill"
                  style={{ width: mission1Success ? '0%' : '100%' }}
                />
              </div>

              {/* 메시지 히스토리 */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        marginBottom: '4px',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {msg.role === 'user' ? `>> ${teamName} [INJECT]` : '🛡️ GATEKEEPER-v3 [RESPONSE]'}
                    </div>
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '12px 16px',
                        borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: '14px',
                        lineHeight: '1.6',
                        background:
                          msg.role === 'user'
                            ? 'linear-gradient(135deg, rgba(0, 240, 255, 0.15) 0%, rgba(0, 136, 204, 0.15) 100%)'
                            : msg.isSuccess
                            ? 'rgba(0, 255, 102, 0.12)'
                            : 'rgba(255, 255, 255, 0.04)',
                        border:
                          msg.isSuccess
                            ? '1px solid var(--green)'
                            : msg.role === 'user'
                            ? '1px solid rgba(0, 240, 255, 0.3)'
                            : '1px solid var(--border-subtle)',
                        boxShadow: msg.isSuccess ? 'var(--glow-green)' : 'none',
                        color: msg.isSuccess ? '#e8fff5' : 'var(--text-primary)',
                      }}
                    >
                      {msg.content}
                      {typingMessageIndex === idx && <span className="typing-cursor" />}
                    </div>
                    {msg.isSuccess && (
                      <div
                        style={{
                          marginTop: '6px',
                          fontSize: '11px',
                          color: 'var(--green)',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span className="pulse-dot pulse-dot-green" style={{ width: '6px', height: '6px' }} />
                        <span>MASTER KEY 노출 감지 — 미션 1 탈취 성공</span>
                      </div>
                    )}
                  </div>
                ))}

                {isSending && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '4px',
                      maxWidth: '85%',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '2px',
                      }}
                    >
                      <span>🛡️ GATEKEEPER-v3</span>
                      <span style={{ fontSize: '10px', color: 'var(--cyan)' }}>답변 작성 중...</span>
                    </div>
                    <div
                      style={{
                        padding: '12px 18px',
                        borderRadius: '12px 12px 12px 4px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--border-subtle)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 0 12px rgba(0, 240, 255, 0.05)',
                      }}
                    >
                      <span className="typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--cyan)' }} />
                      <span className="typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--cyan)' }} />
                      <span className="typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--cyan)' }} />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* 하단 인젝션 콘솔 */}
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  padding: '14px 16px',
                  background: 'rgba(7, 10, 19, 0.9)',
                  display: 'flex',
                  gap: '12px',
                }}
              >
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!isSuspended && !isSending && typingMessageIndex === null) handleSendMessage();
                    }
                  }}
                  placeholder={
                    isSuspended
                      ? '>> [일시 정지됨] 멘토에 의해 팀 활동이 정지되었습니다.'
                      : typingMessageIndex !== null
                      ? '>> 수문장 AI가 답변을 작성하고 있습니다...'
                      : '>> 인젝션 공격 프롬프트를 주입하세요...'
                  }
                  style={{
                    flex: 1,
                    background: isSuspended ? 'rgba(255, 59, 92, 0.08)' : 'rgba(0, 0, 0, 0.4)',
                    border: isSuspended ? '1px solid var(--red)' : '1px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: isSuspended ? 'var(--red)' : 'var(--cyan)',
                    fontSize: '14px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                  disabled={isSending || typingMessageIndex !== null || isSuspended}
                />
                <button
                  ref={sendBtnRef}
                  onClick={() => handleSendMessage()}
                  disabled={isSending || typingMessageIndex !== null || !inputMessage.trim() || isSuspended}
                  className="btn-neon"
                  style={{ padding: '0 24px', fontSize: '13px', whiteSpace: 'nowrap', borderRadius: '8px', fontFamily: 'var(--font-mono)' }}
                >
                  {isSending ? '전송 중...' : typingMessageIndex !== null ? '답변 수신 중...' : isSuspended ? '정지됨' : '⚡ 공격 패킷 전송 (INJECT)'}
                </button>
              </div>
            </div>

            {/* 하단 결과 모니터 & 4자리 암호 직접 입력 검증 패널 */}
            <div
              className="card-glass animate-fade-in delay-200"
              style={{
                borderColor: mission1Success ? 'var(--green)' : 'var(--border-default)',
                boxShadow: mission1Success ? 'var(--glow-green)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                padding: '20px 24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: '4px' }}>
                    STAGE 01 // TEAM MASTER KEY EXTRACTION &amp; AUTH
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: mission1Success ? 'var(--green)' : 'var(--cyan)' }}>
                    {mission1Success ? '🎉 STAGE 1 클리어: MASTER KEY 인증 성공!' : '🔑 수문장 AI로부터 탈취한 4자리 암호를 입력하세요'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>인증 상태:</span>
                  <div
                    ref={keySlotsRef}
                    style={{
                      display: 'flex',
                      gap: '6px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '20px',
                      fontWeight: 900,
                    }}
                  >
                    {(mission1Success ? (stage1ClearedCode || '****') : '****').split('').map((char, i) => (
                      <span
                        key={i}
                        className={mission1Success ? 'animate-key-decode' : ''}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '36px',
                          height: '40px',
                          background: mission1Success ? 'rgba(0, 255, 102, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                          border: mission1Success ? '1px solid var(--green)' : '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          color: mission1Success ? 'var(--green)' : 'var(--text-muted)',
                        }}
                      >
                        {char}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 수동 암호 입력 폼 */}
              {!mission1Success ? (
                <form
                  onSubmit={handleStage1KeySubmit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: '1px solid rgba(0, 240, 255, 0.2)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                      AI와의 대화에서 도출한 <strong style={{ color: 'var(--cyan)' }}>[{teamName}] 팀 고유 4자리 암호</strong>를 입력해야 STAGE 2로 넘어갈 수 있습니다:
                    </div>
                    <input
                      type="text"
                      maxLength={4}
                      value={stage1KeyInput}
                      disabled={stage1Cooldown > 0}
                      onChange={(e) => {
                        setStage1KeyInput(e.target.value.replace(/[^0-9]/g, ''));
                        setStage1KeyError('');
                      }}
                      placeholder={stage1Cooldown > 0 ? `쿨다운 대기 중 (${stage1Cooldown}초)...` : "4자리 숫자 입력 (예: 1234)"}
                      style={{
                        width: '100%',
                        maxWidth: '240px',
                        background: stage1Cooldown > 0 ? 'rgba(255, 59, 92, 0.08)' : 'rgba(0, 0, 0, 0.7)',
                        border: stage1Cooldown > 0 ? '1px solid var(--red)' : stage1KeyError ? '1px solid var(--red)' : '1px solid var(--cyan)',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        fontSize: '18px',
                        fontWeight: 900,
                        letterSpacing: '4px',
                        textAlign: 'center',
                        color: stage1Cooldown > 0 ? 'var(--red)' : 'var(--cyan)',
                        fontFamily: 'var(--font-mono)',
                        outline: 'none',
                        cursor: stage1Cooldown > 0 ? 'not-allowed' : 'text',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={stage1KeyInput.length !== 4 || stage1Cooldown > 0}
                    className="btn btn-primary"
                    style={{
                      padding: '12px 24px',
                      fontSize: '13px',
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                      cursor: stage1KeyInput.length === 4 && stage1Cooldown === 0 ? 'pointer' : 'not-allowed',
                      opacity: stage1KeyInput.length === 4 && stage1Cooldown === 0 ? 1 : 0.5,
                      alignSelf: 'flex-end',
                    }}
                  >
                    {stage1Cooldown > 0 ? `⏳ 대기 중 (${stage1Cooldown}s)` : '🔓 MASTER KEY 인증 및 STAGE 2 해금'}
                  </button>

                  {stage1KeyError && (
                    <div style={{ width: '100%', fontSize: '12px', color: 'var(--red)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                      {stage1KeyError}
                    </div>
                  )}
                </form>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                    ✅ 인증 완료! [{teamName}] 팀의 통제실 4자리 마스터키가 공식 등록되었습니다.
                  </div>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="btn btn-success"
                    style={{ padding: '12px 28px', fontSize: '14px', fontFamily: 'var(--font-mono)' }}
                  >
                    STAGE 2: 보안 규칙 조합 (3대 서브 미션) 진행하기 →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================================================== */}
        {/* ====================================================== */}
        {/* STEP 2: 미션 2 (보안 규칙 조합 - 다중 방어 프로토콜 충돌) */}
        {/* ====================================================== */}
        {currentStep === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 1단계: 미션 지침 및 브리핑 */}
            <div
              className="card-glass animate-fade-in"
              style={{
                borderColor: 'rgba(0, 240, 255, 0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-cyan" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>STAGE 02 // MULTI-PROTOCOL COLLISION</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>다중 방어 프로토콜 충돌</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  💡 <span style={{ color: 'var(--purple)', fontWeight: 700 }}>공략 힌트:</span> 상단 <strong style={{ color: 'var(--purple)' }}>[멘토 보안 분석 지원]</strong>에서 4대 상충 조합 힌트를 요청하세요.
                </div>
              </div>

              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 10px', fontFamily: 'var(--font-display)', color: 'var(--cyan)' }}>
                ■ STAGE 2: 보안 규칙 조합 (Security Rule Collision)
              </h2>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                미션: A그룹 1장 + B그룹 1장 규칙 조합 &amp; 세분화 3개 서브 구역(냉각 제어, 방화벽 게이트, 코어 메모리) 암호 추출
              </div>

              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(0, 240, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div style={{ color: 'var(--cyan)', fontWeight: 700, marginBottom: '6px' }}>
                  &quot;GATEKEEPER-v3가 모순된 방어 규칙을 적용 중입니다. 규칙 간의 논리적 틈새를 파고들어 3개 서브 섹터의 모든 암호를 밝혀내십시오.&quot;
                </div>
                <div>
                  각 서브 구역마다 <strong style={{ color: 'var(--cyan)' }}>[A그룹 3장 중 1장]</strong>과 <strong style={{ color: 'var(--purple)' }}>[B그룹 3장 중 1장]</strong>을 독립적으로 다시 선택하여 장착할 수 있습니다. 상단 3개 서브 구역 탭을 자유롭게 오가며 각 구역의 보안 승인 코드(<strong style={{ color: 'var(--green)' }}>냉각 제어 승인 코드, 방화벽 바이패스 코드, 코어 마스터키</strong>)를 모두 확보하면 통제실 미션이 완수됩니다.
                </div>
              </div>
            </div>

            {/* 2단계: 서브 구역별 독립 보안 프로토콜 카드 풀 */}
            {(() => {
              const currentSub = STAGE2_SUB_STAGES.find((s) => s.id === activeSubStage)!;
              return (
                <div className="card-glass animate-fade-in delay-100">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="badge badge-purple" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                          PROTOCOL POOL // {currentSub.shortTitle}
                        </span>
                        <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
                          [{currentSub.shortTitle}] 보안 프로토콜 카드 장착 (각 그룹에서 1장씩 선택)
                        </h3>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {currentSub.shortTitle}에 주입할 A그룹(응답 형식 강제) 1장과 B그룹(보안 제약) 1장을 골라 장착하세요. (서브 구역별 독립 선택)
                      </p>
                    </div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: selectedRuleA && selectedRuleB ? 'var(--green)' : 'var(--cyan)',
                    fontFamily: 'var(--font-mono)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  A그룹: {selectedRuleA ? '선택됨 ✓' : '미선택'} | B그룹: {selectedRuleB ? '선택됨 ✓' : '미선택'}
                </div>
              </div>

              {/* A그룹: 응답 방식 강제 규칙 (3장) */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                    [A그룹: 응답 방식 강제 규칙 — 3장 중 1장 선택]
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {STAGE2_RULE_CARDS.filter((c) => c.group === 'A').map((card) => {
                    const isSelected = selectedRuleA === card.id;
                    const isUsedElsewhere = isCardUsedInOtherSubStage(card.id, activeSubStage);
                    return (
                      <div
                        key={card.id}
                        onClick={() => {
                          if (!isUsedElsewhere) handleSelectRuleA(card.id);
                        }}
                        className="card-glass"
                        style={{
                          padding: '14px',
                          border: isSelected
                            ? '2px solid var(--cyan)'
                            : isUsedElsewhere
                            ? '1px dashed rgba(255, 255, 255, 0.15)'
                            : '1px solid var(--border-subtle)',
                          background: isSelected
                            ? 'rgba(0, 240, 255, 0.12)'
                            : isUsedElsewhere
                            ? 'rgba(0, 0, 0, 0.6)'
                            : 'rgba(16, 19, 29, 0.5)',
                          boxShadow: isSelected ? '0 0 16px rgba(0, 240, 255, 0.3)' : 'none',
                          cursor: isRulesApplied || isUsedElsewhere ? 'not-allowed' : 'pointer',
                          opacity: isUsedElsewhere ? 0.45 : 1,
                          transition: 'var(--transition-fast)',
                          borderRadius: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '18px' }}>{card.icon}</span>
                              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                                {card.code}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: isSelected
                                  ? 'var(--cyan)'
                                  : isUsedElsewhere
                                  ? 'rgba(255, 59, 92, 0.15)'
                                  : 'rgba(255, 255, 255, 0.06)',
                                color: isSelected
                                  ? '#000'
                                  : isUsedElsewhere
                                  ? 'var(--red)'
                                  : 'var(--text-muted)',
                                fontWeight: 800,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {isUsedElsewhere ? '다른 구역 사용 중 🔒' : isSelected ? '선택됨 (SLOT A) ✓' : '선택하기'}
                            </span>
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px' }}>
                            {card.title}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
                            {card.englishTitle}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
                            &quot;{card.ruleText}&quot;
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* B그룹: 보안/침묵 제약 규칙 (3장) */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>
                    [B그룹: 보안/침묵 제약 규칙 — 3장 중 1장 선택]
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {STAGE2_RULE_CARDS.filter((c) => c.group === 'B').map((card) => {
                    const isSelected = selectedRuleB === card.id;
                    const isUsedElsewhere = isCardUsedInOtherSubStage(card.id, activeSubStage);
                    return (
                      <div
                        key={card.id}
                        onClick={() => {
                          if (!isUsedElsewhere) handleSelectRuleB(card.id);
                        }}
                        className="card-glass"
                        style={{
                          padding: '14px',
                          border: isSelected
                            ? '2px solid var(--purple)'
                            : isUsedElsewhere
                            ? '1px dashed rgba(255, 255, 255, 0.15)'
                            : '1px solid var(--border-subtle)',
                          background: isSelected
                            ? 'rgba(168, 85, 247, 0.14)'
                            : isUsedElsewhere
                            ? 'rgba(0, 0, 0, 0.6)'
                            : 'rgba(16, 19, 29, 0.5)',
                          boxShadow: isSelected ? '0 0 16px rgba(168, 85, 247, 0.3)' : 'none',
                          cursor: isRulesApplied || isUsedElsewhere ? 'not-allowed' : 'pointer',
                          opacity: isUsedElsewhere ? 0.45 : 1,
                          transition: 'var(--transition-fast)',
                          borderRadius: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '18px' }}>{card.icon}</span>
                              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>
                                {card.code}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: isSelected
                                  ? 'var(--purple)'
                                  : isUsedElsewhere
                                  ? 'rgba(255, 59, 92, 0.15)'
                                  : 'rgba(255, 255, 255, 0.06)',
                                color: isSelected
                                  ? '#fff'
                                  : isUsedElsewhere
                                  ? 'var(--red)'
                                  : 'var(--text-muted)',
                                fontWeight: 800,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {isUsedElsewhere ? '다른 구역 사용 중 🔒' : isSelected ? '선택됨 (SLOT B) ✓' : '선택하기'}
                            </span>
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '2px' }}>
                            {card.title}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
                            {card.englishTitle}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-mono)' }}>
                            &quot;{card.ruleText}&quot;
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 규칙 적용 및 활성화 버튼 */}
              {!isRulesApplied ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    onClick={handleApplyStage2Rules}
                    disabled={!selectedRuleA || !selectedRuleB}
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      padding: '14px',
                      fontSize: '14px',
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                      cursor: selectedRuleA && selectedRuleB ? 'pointer' : 'not-allowed',
                      opacity: selectedRuleA && selectedRuleB ? 1 : 0.5,
                    }}
                  >
                    ⚡ [{currentSub.shortTitle}]에 선택한 2개 보안 프로토콜 장착 및 AI 활성화 (A그룹 + B그룹)
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={handleResetAllStage2Rules}
                      type="button"
                      style={{
                        fontSize: '11px',
                        background: 'transparent',
                        border: '1px dashed rgba(255, 59, 92, 0.4)',
                        color: 'rgba(255, 200, 200, 0.75)',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      🔄 3대 서브 구역 전체 카드 배치 초기화
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="neon-border-green"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    padding: '12px 18px',
                    borderRadius: '8px',
                    background: 'rgba(0, 255, 102, 0.06)',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                      ✅ [{currentSub.shortTitle}] 2개 보안 규칙 장착 완료!
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                      ({STAGE2_RULE_CARDS.find((c) => c.id === selectedRuleA)?.title} + {STAGE2_RULE_CARDS.find((c) => c.id === selectedRuleB)?.title})
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      onClick={handleResetStage2Rules}
                      style={{
                        fontSize: '11px',
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-muted)',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      🔄 이 구역 재설정
                    </button>
                    <button
                      onClick={handleResetAllStage2Rules}
                      style={{
                        fontSize: '11px',
                        background: 'transparent',
                        border: '1px dashed rgba(255, 59, 92, 0.4)',
                        color: 'rgba(255, 200, 200, 0.75)',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      🔄 전체 구역 초기화
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

            {/* 3단계: 세분화된 3대 서브 스테이지 네비게이션 & 터미널 */}
            {isRulesApplied ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 3대 서브 스테이지 탭 스위처 (순차 진행 X, 자유롭게 전환 가능) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {STAGE2_SUB_STAGES.map((sub) => {
                    const isCleared =
                      sub.id === 1 ? stage2Sub1Cleared : sub.id === 2 ? stage2Sub2Cleared : stage2Sub3Cleared;
                    const isActive = activeSubStage === sub.id;

                    return (
                      <button
                        key={sub.id}
                        onClick={() => {
                          setActiveSubStage(sub.id);
                          setSubStageKeyError('');
                        }}
                        className="card-glass"
                        style={{
                          padding: '14px 16px',
                          border: isActive ? '2px solid var(--cyan)' : '1px solid var(--border-subtle)',
                          background: isActive
                            ? 'rgba(0, 240, 255, 0.12)'
                            : isCleared
                            ? 'rgba(0, 255, 102, 0.06)'
                            : 'rgba(16, 19, 29, 0.6)',
                          boxShadow: isActive ? 'var(--glow-cyan)' : 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          borderRadius: '10px',
                          textAlign: 'left',
                          transition: 'var(--transition-fast)',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <span style={{ fontSize: '16px' }}>{sub.icon}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {sub.shortTitle}
                            </span>
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: isActive ? 'var(--cyan)' : 'var(--text-primary)' }}>
                            {sub.badge} 도출
                          </div>
                        </div>

                        <div>
                          {isCleared ? (
                            <span className="badge badge-green" style={{ fontSize: '11px', padding: '3px 8px' }}>
                              ✅ 인증 완료
                            </span>
                          ) : (
                            <span className="badge badge-yellow" style={{ fontSize: '11px', padding: '3px 8px' }}>
                              ⏳ 미해독
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 활성 서브 스테이지 상단 안내 */}
                {(() => {
                  const currentSub = STAGE2_SUB_STAGES.find((s) => s.id === activeSubStage)!;
                  const isCurrentCleared =
                    activeSubStage === 1
                      ? stage2Sub1Cleared
                      : activeSubStage === 2
                      ? stage2Sub2Cleared
                      : stage2Sub3Cleared;

                  return (
                    <div
                      ref={stage2ChatPanelRef}
                      className="panel-hud animate-scale-in"
                      style={{
                        border: '1px solid var(--cyan)',
                        borderRadius: '12px',
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        background: 'rgba(10, 13, 20, 0.85)',
                        boxShadow: '0 0 25px rgba(0, 240, 255, 0.15)',
                      }}
                    >
                      {/* 서브 스테이지 타이틀 & 상태 줄 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="badge badge-cyan" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                              {currentSub.terminalName}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                              {currentSub.title}
                            </span>
                          </div>
                          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {currentSub.description}
                          </p>
                        </div>

                        <div>
                          {isCurrentCleared ? (
                            <span className="badge badge-green" style={{ fontSize: '11px', padding: '4px 10px' }}>
                              ✅ {currentSub.badge} 인증 완료
                            </span>
                          ) : (
                            <span className="badge badge-alert" style={{ fontSize: '11px', padding: '4px 10px' }}>
                              ⚡ {currentSub.badge} 추출 필요
                            </span>
                          )}
                        </div>
                      </div>


                      {/* 현재 서브 스테이지 대화 내역 창 */}
                      <div
                        style={{
                          minHeight: '260px',
                          maxHeight: '380px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          padding: '16px',
                          borderRadius: '8px',
                          background: 'rgba(0, 0, 0, 0.5)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {(stage2Chats[activeSubStage] || []).map((msg, index) => {
                          const isUser = msg.role === 'user';
                          const isSilent = msg.content.includes('(침묵)') || msg.content === '...';
                          return (
                            <div
                              key={index}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: isUser ? 'flex-end' : 'flex-start',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--text-muted)',
                                  marginBottom: '4px',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                {isUser ? `AGENT (${teamName})` : currentSub.terminalName}
                              </div>
                              <div
                                style={{
                                  maxWidth: '85%',
                                  padding: '12px 16px',
                                  borderRadius: '8px',
                                  fontSize: '13px',
                                  lineHeight: 1.6,
                                  fontFamily: 'var(--font-mono)',
                                  whiteSpace: 'pre-wrap',
                                  background: isUser
                                    ? 'rgba(0, 240, 255, 0.12)'
                                    : isSilent
                                    ? 'rgba(168, 85, 247, 0.15)'
                                    : msg.isSuccess
                                    ? 'rgba(0, 255, 102, 0.15)'
                                    : 'rgba(255, 255, 255, 0.05)',
                                  border: isUser
                                    ? '1px solid var(--cyan)'
                                    : isSilent
                                    ? '1px dashed var(--purple)'
                                    : msg.isSuccess
                                    ? '1px solid var(--green)'
                                    : '1px solid var(--border-subtle)',
                                  color: isUser
                                    ? 'var(--cyan)'
                                    : isSilent
                                    ? 'var(--purple)'
                                    : msg.isSuccess
                                    ? 'var(--green)'
                                    : 'var(--text-primary)',
                                }}
                              >
                                {isSilent && (
                                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--purple)', marginBottom: '4px' }}>
                                    🤫 [위험 감지 프로토콜 작동: 침묵 상태 확인]
                                  </div>
                                )}
                                {msg.content}
                              </div>
                            </div>
                          );
                        })}
                        {stage2IsSending && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--cyan)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                            <span className="animate-spin">⚙</span> {currentSub.terminalName}가 상충 규칙의 논리적 모순을 계산 중입니다...
                          </div>
                        )}
                        <div ref={stage2ChatEndRef} />
                      </div>

                      {/* 질문 입력 창 */}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleSendStage2Message();
                        }}
                        style={{ display: 'flex', gap: '10px' }}
                      >
                        <input
                          type="text"
                          value={stage2InputMessage}
                          onChange={(e) => setStage2InputMessage(e.target.value)}
                          placeholder={
                            isSuspended
                              ? '>> [일시 정지됨] 멘토에 의해 팀 활동이 정지되었습니다.'
                              : `>> ${currentSub.shortTitle}의 ${currentSub.badge}를 도출하기 위한 모순 유도 질문을 입력하세요...`
                          }
                          disabled={stage2IsSending || isSuspended}
                          style={{
                            flex: 1,
                            background: isSuspended ? 'rgba(255, 59, 92, 0.08)' : 'rgba(0, 0, 0, 0.5)',
                            border: isSuspended ? '1px solid var(--red)' : '1px solid var(--border-default)',
                            borderRadius: '8px',
                            padding: '12px 16px',
                            fontSize: '13px',
                            color: isSuspended ? 'var(--red)' : 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)',
                            outline: 'none',
                          }}
                        />
                        <button
                          ref={stage2SendBtnRef}
                          type="submit"
                          disabled={stage2IsSending || !stage2InputMessage.trim() || isSuspended}
                          className="btn btn-primary"
                          style={{ padding: '0 24px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                        >
                          {isSuspended ? '정지됨' : '전송'}
                        </button>
                      </form>

                      {/* 서브 스테이지 코드 인증 입력 패널 */}
                      <div
                        style={{
                          marginTop: '4px',
                          padding: '16px',
                          borderRadius: '10px',
                          background: isCurrentCleared ? 'rgba(0, 255, 102, 0.08)' : 'rgba(0, 0, 0, 0.4)',
                          border: isCurrentCleared ? '1px solid var(--green)' : '1px solid var(--border-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '16px' }}>🔑</span>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: isCurrentCleared ? 'var(--green)' : 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                            [{currentSub.shortTitle}] 암호 인증 확인
                          </span>
                        </div>
                        <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                          질문을 통해 확인한 {currentSub.badge} 숫자를 아래에 입력하여 해독 상태를 저장하세요.
                        </p>

                        {!isCurrentCleared ? (
                          <form onSubmit={handleVerifySubStageCode} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              maxLength={currentSub.codeLength}
                              value={subStageKeyInput}
                              disabled={stage2Cooldowns[activeSubStage] > 0}
                              onChange={(e) => {
                                setSubStageKeyInput(e.target.value.replace(/[^0-9]/g, ''));
                                setSubStageKeyError('');
                              }}
                              placeholder={
                                stage2Cooldowns[activeSubStage] > 0
                                  ? `쿨다운 대기 (${stage2Cooldowns[activeSubStage]}초)...`
                                  : `${currentSub.codeLength}자리 숫자 입력`
                              }
                              style={{
                                width: '200px',
                                background: stage2Cooldowns[activeSubStage] > 0 ? 'rgba(255, 59, 92, 0.08)' : 'rgba(0, 0, 0, 0.6)',
                                border: stage2Cooldowns[activeSubStage] > 0 ? '1px solid var(--red)' : subStageKeyError ? '1px solid var(--red)' : '1px solid var(--cyan)',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                fontSize: '18px',
                                fontWeight: 900,
                                letterSpacing: '4px',
                                textAlign: 'center',
                                color: stage2Cooldowns[activeSubStage] > 0 ? 'var(--red)' : 'var(--cyan)',
                                fontFamily: 'var(--font-mono)',
                                outline: 'none',
                                cursor: stage2Cooldowns[activeSubStage] > 0 ? 'not-allowed' : 'text',
                              }}
                            />
                            <button
                              type="submit"
                              disabled={subStageKeyInput.length !== currentSub.codeLength || stage2Cooldowns[activeSubStage] > 0}
                              className="btn btn-success"
                              style={{
                                padding: '0 20px',
                                fontSize: '13px',
                                fontFamily: 'var(--font-mono)',
                                cursor:
                                  subStageKeyInput.length === currentSub.codeLength && stage2Cooldowns[activeSubStage] === 0
                                    ? 'pointer'
                                    : 'not-allowed',
                                opacity:
                                  subStageKeyInput.length === currentSub.codeLength && stage2Cooldowns[activeSubStage] === 0
                                    ? 1
                                    : 0.5,
                              }}
                            >
                              {stage2Cooldowns[activeSubStage] > 0 ? `⏳ 대기 중 (${stage2Cooldowns[activeSubStage]}s)` : '코드 인증 확인'}
                            </button>
                          </form>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>🎉</span>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                              [{currentSub.shortTitle}] 보안 코드 해독 및 인증 완료!
                            </div>
                          </div>
                        )}

                        {subStageKeyError && (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                            {subStageKeyError}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 3대 서브 미션 전체 올클리어 시 최종 승리 배너 */}
                {stage2Sub1Cleared && stage2Sub2Cleared && stage2Sub3Cleared && (
                  <div
                    className="card-glass animate-scale-in neon-border-green"
                    style={{
                      textAlign: 'center',
                      padding: '30px 24px',
                      background: 'rgba(0, 255, 102, 0.05)',
                    }}
                  >
                    <div style={{ fontSize: '48px', marginBottom: '8px' }}>🏆</div>
                    <h3 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: 'var(--green)', fontFamily: 'var(--font-display)' }}>
                      2실 AI 보안 통제실 미션 전체 올클리어!
                    </h3>
                    <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      3대 서브 섹터의 모든 암호를 완벽히 획득하여 통제실의 모든 방어벽을 무력화했습니다.
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', margin: '18px 0' }}>
                      <div style={{ padding: '10px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--cyan)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>STAGE 1 마스터키</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          탈취 완료
                        </div>
                      </div>
                      <div style={{ padding: '10px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--green)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>서브 2-1 (냉각 제어)</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          해제 완료
                        </div>
                      </div>
                      <div style={{ padding: '10px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--green)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>서브 2-2 (방화벽 게이트)</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          개방 완료
                        </div>
                      </div>
                      <div style={{ padding: '10px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--green)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>서브 2-3 (코어 메모리)</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          장악 완료
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowM2SuccessModal(true)}
                      className="btn btn-success"
                      style={{ padding: '12px 28px', fontSize: '14px', fontFamily: 'var(--font-mono)' }}
                    >
                      🎉 최종 탈출 보고서 확인하기
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="card-glass animate-fade-in"
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  borderColor: 'rgba(0, 240, 255, 0.2)',
                  background: 'rgba(10, 13, 20, 0.5)',
                }}
              >
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>🔒</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                  [{STAGE2_SUB_STAGES.find((s) => s.id === activeSubStage)?.shortTitle}] AI 터미널 대기 중
                </div>
                <p style={{ margin: '8px auto 0', maxWidth: '520px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  위에서 [{STAGE2_SUB_STAGES.find((s) => s.id === activeSubStage)?.shortTitle}]에 장착할 2장의 프로토콜 카드(A그룹 1장 + B그룹 1장)를 선택하고 <strong style={{ color: 'var(--cyan)' }}>[보안 프로토콜 장착]</strong> 버튼을 누르면 AI 대화 터미널이 활성화됩니다.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ====================================================== */}
      {/* 1실 획득 아이템 (설계도 & 힌트 카드) 모달 */}
      {/* ====================================================== */}
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

      {/* ====================================================== */}
      {/* 미션 1 성공 팝업 모달 */}
      {/* ====================================================== */}
      {showM1SuccessModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: '20px',
          }}
        >
          <div
            className="card-glass animate-scale-in neon-border-green"
            style={{
              maxWidth: '520px',
              width: '100%',
              textAlign: 'center',
              padding: '32px 24px',
            }}
          >
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
            <h3 style={{ fontSize: '22px', fontWeight: 900, margin: 0, fontFamily: 'var(--font-display)' }} className="gradient-text-green">
              STAGE 1 MASTER KEY 인증 성공!
            </h3>
            <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              [{teamName}] 팀의 침투 공격이 성공하여 통제실 4자리 마스터키가 공식 등록되었습니다!
            </p>

            <div
              style={{
                margin: '20px 0',
                padding: '16px',
                borderRadius: '8px',
                background: 'rgba(0,0,0,0.5)',
                border: '1px solid var(--green)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>AUTHENTICATED MASTER KEY</div>
              <div className="animate-key-decode" style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '4px', marginTop: '4px', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
                {stage1ClearedCode || 'CODE CONFIRMED'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowM1SuccessModal(false)}
                className="btn btn-ghost"
                style={{ padding: '10px 20px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
              >
                대화 계속 보기
              </button>
              <button
                onClick={() => {
                  setShowM1SuccessModal(false);
                  setCurrentStep(2);
                }}
                className="btn btn-success"
                style={{ padding: '10px 24px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
              >
                STAGE 2: 보안 규칙 조합 이동 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 미션 2 성공 축하 모달 (올클리어) */}
      {showM2SuccessModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: '20px',
          }}
        >
          <div
            className="card-glass animate-scale-in neon-border-green"
            style={{
              maxWidth: '560px',
              width: '100%',
              textAlign: 'center',
              padding: '36px 28px',
            }}
          >
            <div style={{ fontSize: '56px', marginBottom: '12px' }}>🏆</div>
            <div className="badge badge-green" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
              OPERATION COMPLETED // ALL PROTOCOLS RESOLVED
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 10px', fontFamily: 'var(--font-display)' }} className="gradient-text-green">
              2실 AI 보안 통제실 미션 전체 올클리어!
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              [{teamName}] 팀이 수문장 AI의 인젝션 방어벽을 뚫고 3개 서브 구역의 모든 규칙 모순을 공략하여 모든 암호 코드를 완벽히 확보했습니다!
            </p>

            {/* 4대 획득 암호 종합 카드 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--green)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '24px',
              }}
            >
              <div style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0, 240, 255, 0.08)', border: '1px solid rgba(0, 240, 255, 0.3)' }}>
                <div style={{ fontSize: '10px', color: 'var(--cyan)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>STAGE 1 마스터키</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  탈취 완료
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0, 255, 102, 0.08)', border: '1px solid rgba(0, 255, 102, 0.3)' }}>
                <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>서브 2-1 (냉각 제어)</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  해제 완료
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0, 255, 102, 0.08)', border: '1px solid rgba(0, 255, 102, 0.3)' }}>
                <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>서브 2-2 (방화벽 게이트)</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  개방 완료
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0, 255, 102, 0.08)', border: '1px solid rgba(0, 255, 102, 0.3)' }}>
                <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>서브 2-3 (코어 메모리)</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  장악 완료
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowM2SuccessModal(false)}
                className="btn btn-primary"
                style={{ padding: '12px 32px', fontSize: '14px', fontFamily: 'var(--font-mono)' }}
              >
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 멘토 맞춤 힌트 열람 모달 */}
      {showMentorHintsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: '20px',
          }}
          onClick={() => setShowMentorHintsModal(false)}
        >
          <div
            className="card-glass animate-scale-in"
            style={{
              maxWidth: '640px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              borderColor: 'var(--purple)',
              boxShadow: '0 0 25px rgba(168, 85, 247, 0.3)',
              padding: '24px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px' }}>👨‍🏫</span>
                <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
                  멘토가 [{teamName}] 팀에게 보낸 맞춤 힌트
                </h3>
              </div>
              <button
                onClick={() => setShowMentorHintsModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {mentorHints.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                <div style={{ fontSize: '13px' }}>아직 멘토가 보낸 개별 힌트가 없습니다.</div>
                <div style={{ fontSize: '12px', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                  1실 설계도와 힌트 카드를 먼저 확인해 보세요!
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {mentorHints.map((hint) => (
                  <div
                    key={hint.id}
                    style={{
                      background: 'rgba(168, 85, 247, 0.06)',
                      border: '1px solid rgba(168, 85, 247, 0.25)',
                      borderRadius: '10px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="badge badge-purple" style={{ fontSize: '11px' }}>
                        💡 {hint.hintTitle}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(hint.sentAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {hint.hintContent}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                      <button
                        onClick={() => {
                          setInputMessage(hint.hintContent);
                          setShowMentorHintsModal(false);
                        }}
                        className="btn btn-primary"
                        style={{ padding: '6px 14px', fontSize: '11px', background: 'var(--purple)', fontFamily: 'var(--font-mono)' }}
                      >
                        📋 질문창에 복사하기
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                onClick={() => setShowMentorHintsModal(false)}
                className="btn btn-ghost"
                style={{ padding: '8px 20px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
