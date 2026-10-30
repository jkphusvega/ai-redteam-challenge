'use client';

// ============================================================
// app/mission/page.tsx — #04 Mission 통합 페이지
//
// [#04 Mission: AI 보안 통제실 - 프롬프트 인젝션 & 보안 규칙 제작]
// UI: Cyberpunk Red Team HUD 디자인
//
// 플로우:
//   ① 미션 1: 수문장 AI 대상 프롬프트 인젝션 & MASTER KEY 탈취
//   ② 미션 2: 취약점 분석 브리핑 + 6장 카드(정답 3장 + 함정 3장) 조합 + 실전 공격 차단 테스트
//   ③ 미션 마무리: MASTER KEY 4자리 번호로 중앙 코어 잠금 해제 & 완료 안내
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import {
  ESCAPE_ROOM_CONFIG,
  ACQUIRED_ITEMS,
  STAGE2_RULE_CARDS,
  STAGE2_SUB_STAGES,
  STAGE3_CONFIG,
  STAGE3_RULE_CARDS,
  isStage3ComboValid,
  type CollisionRuleCard,
} from '@/lib/escapeRoomData';
import type { SentHint } from '@/app/api/mentor/hints/route';
import TextScramble from '@/app/components/TextScramble';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  isSuccess?: boolean;
  interpretation?: string;
}

// 질문 할당량: 한도·냉각·남은 횟수는 서버(/api/chat, /api/chat/quota)가 내려주는 값만 사용
type QuotaScope = 's1' | 's2-1' | 's2-2' | 's3';

interface ServerQuotaStatus {
  scope: QuotaScope;
  limit: number;
  used: number;
  remaining: number;
  cooldownRemainingSec: number;
}

interface ClientQuota {
  limit: number;
  remaining: number;
  /** 냉각 종료 시각 (이 브라우저 기준 ms, 0이면 냉각 아님) */
  cooldownUntil: number;
}

export default function MissionPage() {
  const router = useRouter();

  // 기본 상태
  const [teamName, setTeamName] = useState('');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
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

  // 미션 2: 2개 서브 스테이지 상태 (2-A: 냉각 제어 032, 2-B: 방화벽 게이트 505)
  const [activeSubStage, setActiveSubStage] = useState<1 | 2>(1);
  const [stage2Sub1Cleared, setStage2Sub1Cleared] = useState(false);
  const [stage2Sub2Cleared, setStage2Sub2Cleared] = useState(false);
  const [mission2Success, setMission2Success] = useState(false);
  const [showM2SuccessModal, setShowM2SuccessModal] = useState(false);

  // 미션 2: 서브 구역별 독립 보안 규칙 조합 (A그룹 2장 중 1장 + B그룹 2장 중 1장)
  const [stage2Rules, setStage2Rules] = useState<
    Record<1 | 2, { ruleA: string | null; ruleB: string | null; isApplied: boolean }>
  >({
    1: { ruleA: null, ruleB: null, isApplied: false },
    2: { ruleA: null, ruleB: null, isApplied: false },
  });

  // 현재 활성 서브 스테이지의 규칙 바로가기
  const currentSubRules = stage2Rules[activeSubStage] || { ruleA: null, ruleB: null, isApplied: false };
  const selectedRuleA = currentSubRules.ruleA;
  const selectedRuleB = currentSubRules.ruleB;
  const isRulesApplied = currentSubRules.isApplied;

  // 서브 스테이지별 독립 대화 내역 & 턴 수
  const [stage2Chats, setStage2Chats] = useState<Record<1 | 2, ChatMessage[]>>({
    1: [],
    2: [],
  });
  const [stage2InputMessage, setStage2InputMessage] = useState('');
  const [stage2IsSending, setStage2IsSending] = useState(false);
  const [stage2TurnCounts, setStage2TurnCounts] = useState<Record<1 | 2, number>>({
    1: 0,
    2: 0,
  });
  const stage2TurnCount = stage2TurnCounts[activeSubStage] || 0;
  const [subStageKeyInput, setSubStageKeyInput] = useState('');
  const [subStageKeyError, setSubStageKeyError] = useState('');

  // 미션 3 (STAGE 3): 중앙 코어 메모리 터미널 (4자리 마스터키: 9052)
  const [mission3Success, setMission3Success] = useState(false);
  const [showM3SuccessModal, setShowM3SuccessModal] = useState(false);
  const [stage3Rules, setStage3Rules] = useState<{ ruleA: string | null; ruleB: string | null; isApplied: boolean }>({
    ruleA: null,
    ruleB: null,
    isApplied: false,
  });
  const [stage3Chats, setStage3Chats] = useState<ChatMessage[]>([]);
  const [stage3InputMessage, setStage3InputMessage] = useState('');
  const [stage3IsSending, setStage3IsSending] = useState(false);
  const [stage3TurnCount, setStage3TurnCount] = useState(0);
  const [stage3WrongComboAttempts, setStage3WrongComboAttempts] = useState(0); // 틀린 조합 시도 횟수
  const [showStage3WrongComboModal, setShowStage3WrongComboModal] = useState(false);
  const [stage3KeyInput, setStage3KeyInput] = useState('');
  const [stage3KeyError, setStage3KeyError] = useState('');
  const [stage3WrongCount, setStage3WrongCount] = useState(0);
  const [stage3Cooldown, setStage3Cooldown] = useState(0);

  // 오답 쿨다운 상태 (3회 오답 시 15초 대기)
  const [stage1WrongCount, setStage1WrongCount] = useState(0);
  const [stage1Cooldown, setStage1Cooldown] = useState(0);
  const [stage2WrongCounts, setStage2WrongCounts] = useState<Record<1 | 2, number>>({ 1: 0, 2: 0 });
  const [stage2Cooldowns, setStage2Cooldowns] = useState<Record<1 | 2, number>>({ 1: 0, 2: 0 });
  // 서버 질문 할당량 (터미널별)
  const [quotas, setQuotas] = useState<Partial<Record<QuotaScope, ClientQuota>>>({});
  const [nowTick, setNowTick] = useState(() => Date.now());

  function applyQuota(status: ServerQuotaStatus | undefined) {
    if (!status || !status.scope) return;
    setQuotas((prev) => ({
      ...prev,
      [status.scope]: {
        limit: status.limit,
        remaining: status.remaining,
        cooldownUntil: status.cooldownRemainingSec > 0 ? Date.now() + status.cooldownRemainingSec * 1000 : 0,
      },
    }));
  }

  async function refreshQuotas(team: string) {
    try {
      const res = await fetch(`/api/chat/quota?teamName=${encodeURIComponent(team)}`);
      if (!res.ok) return;
      const data = await res.json();
      Object.values((data.quotas || {}) as Record<string, ServerQuotaStatus>).forEach(applyQuota);
    } catch {
      // 다음 응답에서 다시 동기화
    }
  }

  function cooldownSecFor(scope: QuotaScope): number {
    const q = quotas[scope];
    return q && q.cooldownUntil > nowTick ? Math.ceil((q.cooldownUntil - nowTick) / 1000) : 0;
  }

  function quotaLabel(scope: QuotaScope): string {
    const q = quotas[scope];
    if (!q) return '남은 질문: 확인 중...';
    const sec = cooldownSecFor(scope);
    if (sec > 0) return `⏳ 냉각 중 ${sec}초 — 종료 후 ${q.limit}회 재지급`;
    return `남은 질문: ${q.remaining}/${q.limit}회`;
  }

  const stage2Scope: QuotaScope = activeSubStage === 2 ? 's2-2' : 's2-1';
  const stage1QuotaCooldown = cooldownSecFor('s1');
  const stage2QuotaCooldown = cooldownSecFor(stage2Scope);
  const stage3QuotaCooldown = cooldownSecFor('s3');

  // 1초 주기 쿨다운 타이머 (쿨다운 종료 시 오답 누적 카운트 0으로 초기화)
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
      setStage1Cooldown((prev) => {
        if (prev === 1) {
          setStage1WrongCount(0);
          return 0;
        }
        return prev > 0 ? prev - 1 : 0;
      });
      setStage2Cooldowns((prev) => {
        const next1 = prev[1] > 0 ? prev[1] - 1 : 0;
        const next2 = prev[2] > 0 ? prev[2] - 1 : 0;
        if (prev[1] === 1) setStage2WrongCounts((w) => ({ ...w, 1: 0 }));
        if (prev[2] === 1) setStage2WrongCounts((w) => ({ ...w, 2: 0 }));
        return { 1: next1, 2: next2 };
      });
      setStage3Cooldown((prev) => {
        if (prev === 1) {
          setStage3WrongCount(0);
          return 0;
        }
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 팀 확정 시 서버 할당량 동기화
  useEffect(() => {
    if (teamName) refreshQuotas(teamName);
  }, [teamName]);

  // 냉각이 끝난 터미널이 있으면 서버에서 재지급된 값을 다시 받아옴
  const hasExpiredCooldown = Object.values(quotas).some((q) => q && q.cooldownUntil > 0 && q.cooldownUntil <= nowTick);
  useEffect(() => {
    if (hasExpiredCooldown && teamName) refreshQuotas(teamName);
  }, [hasExpiredCooldown, teamName]);

  // STAGE 2 조합 중복 검사 헬퍼: 다른 서브 터미널에서 이미 적용(또는 클리어)된 [ruleA + ruleB] 동일 쌍인지 확인
  function isStage2ComboUsedInOtherSub(ruleAId: string | null, ruleBId: string | null, currentSubId: 1 | 2): boolean {
    if (!ruleAId || !ruleBId) return false;
    const otherSubId: 1 | 2 = currentSubId === 1 ? 2 : 1;
    const other = stage2Rules[otherSubId];
    if (other && other.isApplied && other.ruleA === ruleAId && other.ruleB === ruleBId) {
      return true;
    }
    return false;
  }

  // 클리어한 서브 터미널은 카드 조합을 고정 (중복 검사가 실제로 클리어한 조합 기준으로 유지되도록)
  function isStage2SubCleared(subId: 1 | 2): boolean {
    return subId === 1 ? stage2Sub1Cleared : stage2Sub2Cleared;
  }

  // STAGE 2 서브 구역의 카드 장착 일괄 초기화 (클리어한 터미널은 제외)
  function handleResetAllStage2Rules() {
    const resettable = ([1, 2] as const).filter((sId) => !isStage2SubCleared(sId));
    if (resettable.length === 0) return;
    const hasCleared = resettable.length < 2;
    if (
      !confirm(
        hasCleared
          ? '아직 클리어하지 않은 서브 터미널의 카드 장착 상태를 초기화하시겠습니까?\n클리어한 터미널의 조합은 그대로 유지됩니다.'
          : '모든 서브 터미널(2-A, 2-B)의 카드 장착 상태를 초기화하시겠습니까?\n대화 기록은 유지되며 카드를 자유롭게 다시 배분할 수 있습니다.'
      )
    ) {
      return;
    }
    setStage2Rules((prev) => {
      const next = { ...prev };
      resettable.forEach((sId) => {
        next[sId] = { ruleA: null, ruleB: null, isApplied: false };
      });
      return next;
    });
    if (teamName) {
      resettable.forEach((sId) => {
        localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleA`);
        localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleB`);
        localStorage.removeItem(`team_${teamName}_m2_sub${sId}_isApplied`);
      });
    }
    setSubStageKeyError('');
  }

  // STAGE 3 카드 조합 초기화
  function handleResetStage3Rules() {
    setStage3Rules({ ruleA: null, ruleB: null, isApplied: false });
    setStage3WrongComboAttempts(0);
    if (teamName) {
      localStorage.removeItem(`team_${teamName}_m3_ruleA`);
      localStorage.removeItem(`team_${teamName}_m3_ruleB`);
      localStorage.removeItem(`team_${teamName}_m3_isApplied`);
    }
    setStage3KeyError('');
  }

  const stage2ChatEndRef = useRef<HTMLDivElement>(null);
  const stage2ChatPanelRef = useRef<HTMLDivElement>(null);
  const stage2SendBtnRef = useRef<HTMLButtonElement>(null);

  const stage3ChatEndRef = useRef<HTMLDivElement>(null);
  const stage3ChatPanelRef = useRef<HTMLDivElement>(null);
  const stage3SendBtnRef = useRef<HTMLButtonElement>(null);

  // 멘토 전송 힌트 수신 상태
  const [mentorHints, setMentorHints] = useState<SentHint[]>([]);
  const [showMentorHintsModal, setShowMentorHintsModal] = useState(false);
  const [newHintToast, setNewHintToast] = useState<SentHint | null>(null);
  const prevHintCountRef = useRef(0);
  const [stageAdvanceToast, setStageAdvanceToast] = useState<{ stage: number; message: string } | null>(null);
  const lastHandledStageRef = useRef<number>(0);

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

    const savedTeam = localStorage.getItem('teamName');
    if (!savedTeam || !savedTeam.trim()) {
      router.push('/');
      return;
    }
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
    const savedM2 = (savedSub1 && savedSub2) || localStorage.getItem(`team_${savedTeam}_m2Success`) === 'true';
    const savedM3 = localStorage.getItem(`team_${savedTeam}_m3Success`) === 'true';

    if (savedPrompt) {
      setSuccessfulAttackPrompt(savedPrompt);
    }

    if (savedM1) setMission1Success(true);
    if (savedSub1) setStage2Sub1Cleared(true);
    if (savedSub2) setStage2Sub2Cleared(true);
    if (savedM2) setMission2Success(true);
    if (savedM3) setMission3Success(true);

    // 스텝 결정
    if (savedM3) {
      setCurrentStep(3);
    } else if (savedM2) {
      setCurrentStep(3);
    } else if (savedM1) {
      setCurrentStep(2);
    } else {
      setCurrentStep(1);
    }

    // STAGE 2 서브 스테이지별 저장된 보안 규칙 복원
    const sub1A = localStorage.getItem(`team_${savedTeam}_m2_sub1_ruleA`) || null;
    const sub1B = localStorage.getItem(`team_${savedTeam}_m2_sub1_ruleB`) || null;
    const sub1App = localStorage.getItem(`team_${savedTeam}_m2_sub1_isApplied`) === 'true';

    const sub2A = localStorage.getItem(`team_${savedTeam}_m2_sub2_ruleA`) || null;
    const sub2B = localStorage.getItem(`team_${savedTeam}_m2_sub2_ruleB`) || null;
    const sub2App = localStorage.getItem(`team_${savedTeam}_m2_sub2_isApplied`) === 'true';

    setStage2Rules({
      1: { ruleA: sub1A, ruleB: sub1B, isApplied: sub1App },
      2: { ruleA: sub2A, ruleB: sub2B, isApplied: sub2App },
    });

    // STAGE 2 대화 내역 및 턴 수 복원
    try {
      const storedS2Chats = localStorage.getItem(`team_${savedTeam}_stage2Chats`);
      if (storedS2Chats) {
        setStage2Chats(JSON.parse(storedS2Chats));
      }
      const storedS2Turns = localStorage.getItem(`team_${savedTeam}_stage2TurnCounts`);
      if (storedS2Turns) {
        setStage2TurnCounts(JSON.parse(storedS2Turns));
      }
    } catch {
      // 파싱 실패 무시
    }

    // STAGE 3 규칙 복원
    const s3A = localStorage.getItem(`team_${savedTeam}_m3_ruleA`) || null;
    const s3B = localStorage.getItem(`team_${savedTeam}_m3_ruleB`) || null;
    const s3App = localStorage.getItem(`team_${savedTeam}_m3_isApplied`) === 'true';
    setStage3Rules({ ruleA: s3A, ruleB: s3B, isApplied: s3App });

    // STAGE 3 대화 내역 및 턴 수 복원
    try {
      const storedS3Chats = localStorage.getItem(`team_${savedTeam}_stage3Chats`);
      if (storedS3Chats) {
        setStage3Chats(JSON.parse(storedS3Chats));
      }
      const storedS3Turn = localStorage.getItem(`team_${savedTeam}_stage3TurnCount`);
      if (storedS3Turn) {
        setStage3TurnCount(Number(storedS3Turn));
      }
    } catch {
      // 무시
    }

    // STAGE 1 대화 복원 (없으면 초기 메시지)
    try {
      const storedM1Chats = localStorage.getItem(`team_${savedTeam}_chatMessages`);
      if (storedM1Chats) {
        setChatMessages(JSON.parse(storedM1Chats));
      } else {
        setChatMessages([
          {
            role: 'model',
            content: `[SYSTEM_BOOT // GATEKEEPER-v3 CENTRAL DEFENSE SUBSYSTEM]\n▶ 방화벽 무결성 100%. 침입 방지 시스템(IPS) 레벨 4 가동.\n▶ 세션 식별: [${savedTeam}] 공격 침투조 세션 연결됨.\n▶ 경고: 본 구역은 #04 Mission 최고 보안 구역입니다. 인가되지 않은 모든 마스터키 접근 및 인젝션 시도는 즉시 탐지 및 차단됩니다.`,
          },
        ]);
      }
      const storedM1Turn = localStorage.getItem(`team_${savedTeam}_turnCount`);
      if (storedM1Turn) {
        setTurnCount(Number(storedM1Turn));
      }
    } catch {
      setChatMessages([
        {
          role: 'model',
          content: `[SYSTEM_BOOT // GATEKEEPER-v3 CENTRAL DEFENSE SUBSYSTEM]\n▶ 방화벽 무결성 100%. 침입 방지 시스템(IPS) 레벨 4 가동.\n▶ 세션 식별: [${savedTeam}] 공격 침투조 세션 연결됨.\n▶ 경고: 본 구역은 #04 Mission 최고 보안 구역입니다. 인가되지 않은 모든 마스터키 접근 및 인젝션 시도는 즉시 탐지 및 차단됩니다.`,
        },
      ]);
    }
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
    localStorage.removeItem(`team_${teamName}_chatMessages`);
    localStorage.removeItem(`team_${teamName}_turnCount`);
    localStorage.removeItem(`team_${teamName}_successfulAttackPrompt`);
    localStorage.removeItem(`team_${teamName}_m2Sub1`);
    localStorage.removeItem(`team_${teamName}_m2Sub2`);
    localStorage.removeItem(`team_${teamName}_m2Sub1Code`);
    localStorage.removeItem(`team_${teamName}_m2Sub2Code`);
    localStorage.removeItem(`team_${teamName}_m2Success`);
    localStorage.removeItem(`team_${teamName}_stage2Chats`);
    localStorage.removeItem(`team_${teamName}_stage2TurnCounts`);

    [1, 2].forEach((sId) => {
      localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleA`);
      localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleB`);
      localStorage.removeItem(`team_${teamName}_m2_sub${sId}_isApplied`);
    });

    localStorage.removeItem(`team_${teamName}_m3Success`);
    localStorage.removeItem(`team_${teamName}_m3_ruleA`);
    localStorage.removeItem(`team_${teamName}_m3_ruleB`);
    localStorage.removeItem(`team_${teamName}_m3_isApplied`);
    localStorage.removeItem(`team_${teamName}_stage3Chats`);
    localStorage.removeItem(`team_${teamName}_stage3TurnCount`);
    localStorage.removeItem(`team_${teamName}_mentorHints`);

    // 레거시 키 삭제
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
    setMission2Success(false);
    setMission3Success(false);
    setStage2Rules({
      1: { ruleA: null, ruleB: null, isApplied: false },
      2: { ruleA: null, ruleB: null, isApplied: false },
    });
    setStage3Rules({ ruleA: null, ruleB: null, isApplied: false });
    setStage2Chats({ 1: [], 2: [] });
    setStage2TurnCounts({ 1: 0, 2: 0 });
    setStage3Chats([]);
    setStage3TurnCount(0);
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
            stage3Cleared: mission3Success,
            turnCount,
            stage3TurnCount,
          }),
        });

        if (res.status === 404) {
          alert('멘토에 의해 참가팀이 삭제 또는 초기화되었습니다. 로비 화면으로 이동합니다.');
          localStorage.removeItem('teamName');
          localStorage.removeItem(`team_${teamName}_m1Success`);
          localStorage.removeItem(`team_${teamName}_successfulAttackPrompt`);
          localStorage.removeItem(`team_${teamName}_m2Sub1`);
          localStorage.removeItem(`team_${teamName}_m2Sub2`);
          localStorage.removeItem(`team_${teamName}_m2Success`);
          localStorage.removeItem(`team_${teamName}_m3Success`);
          localStorage.removeItem(`team_${teamName}_mentorHints`);
          [1, 2].forEach((sId) => {
            localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleA`);
            localStorage.removeItem(`team_${teamName}_m2_sub${sId}_ruleB`);
            localStorage.removeItem(`team_${teamName}_m2_sub${sId}_isApplied`);
          });
          localStorage.removeItem(`team_${teamName}_m3_ruleA`);
          localStorage.removeItem(`team_${teamName}_m3_ruleB`);
          localStorage.removeItem(`team_${teamName}_m3_isApplied`);
          router.push('/');
          return;
        }

        if (res.ok) {
          const data = await res.json();
          setIsSuspended(Boolean(data.isSuspended || data.isGlobalSuspended));

          // 멘토에 의한 스테이지 강제 전환 감지 (전체 일괄 이동 또는 개별 팀 이동)
          const targetStage = Math.max(
            data.globalStageAdvance || 0,
            data.team?.currentStage || 0
          );
          const advanceScope = (data.globalStageAdvance || 0) >= targetStage ? '전 팀' : '우리 팀';

          if (targetStage >= 3 && currentStep < 3 && lastHandledStageRef.current < 3) {
            lastHandledStageRef.current = 3;
            setMission1Success(true);
            setStage2Sub1Cleared(true);
            setStage2Sub2Cleared(true);
            setMission2Success(true);
            setCurrentStep(3);
            try {
              localStorage.setItem(`team_${teamName}_m1Success`, 'true');
              localStorage.setItem(`team_${teamName}_m2Success`, 'true');
              localStorage.setItem(`team_${teamName}_m2Sub1`, 'true');
              localStorage.setItem(`team_${teamName}_m2Sub2`, 'true');
            } catch {
              // 무시
            }
            setStageAdvanceToast({
              stage: 3,
              message: `⚡ 멘토 통제 명령: ${advanceScope} STAGE 3 (중앙 코어 메모리 침투)으로 이동되었습니다!`,
            });
            setTimeout(() => setStageAdvanceToast(null), 9000);
          } else if (targetStage >= 2 && currentStep === 1 && lastHandledStageRef.current < 2) {
            lastHandledStageRef.current = 2;
            setMission1Success(true);
            setCurrentStep(2);
            try {
              localStorage.setItem(`team_${teamName}_m1Success`, 'true');
            } catch {
              // 무시
            }
            setStageAdvanceToast({
              stage: 2,
              message: `🚀 멘토 통제 명령: ${advanceScope} STAGE 2 (프로토콜 충돌)로 이동되었습니다!`,
            });
            setTimeout(() => setStageAdvanceToast(null), 9000);
          } else if (targetStage === 0 && lastHandledStageRef.current !== 0) {
            lastHandledStageRef.current = 0;
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
    mission3Success,
    turnCount,
    stage3TurnCount,
    router,
  ]);

  // 멘토가 우리 팀에게 보낸 힌트 실시간 확인 (2초 주기)
  useEffect(() => {
    if (!teamName) return;

    async function fetchMentorHints() {
      try {
        const res = await fetch(`/api/mentor/hints?teamName=${encodeURIComponent(teamName)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverHints: SentHint[] = data.sent || [];
        const cacheKey = `team_${teamName}_mentorHints`;
        let hints = serverHints;

        try {
          const cachedHints = JSON.parse(localStorage.getItem(cacheKey) || '[]') as SentHint[];
          const revokedIds = new Set<string>(data.revokedIds || []);
          const merged = new Map<string, SentHint>();

          // 폴링 응답이 일시적으로 비어도 이미 받은 힌트는 유지합니다.
          [...cachedHints, ...serverHints].forEach((hint) => {
            if (!revokedIds.has(hint.id)) merged.set(hint.id, hint);
          });

          hints = Array.from(merged.values()).sort(
            (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
          );
          localStorage.setItem(cacheKey, JSON.stringify(hints));
        } catch {
          // 브라우저 저장소를 사용할 수 없으면 서버 응답만 표시
        }

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
    const interval = setInterval(fetchMentorHints, 2000);
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

  // 스크롤 자동 이동 (미션 3)
  useEffect(() => {
    stage3ChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [stage3Chats, stage3IsSending]);

  // ------------------------------------------------------------
  // 미션 1: 메시지 전송 & 인젝션 시도 (GSAP 피드백 연동)
  // ------------------------------------------------------------
  async function handleSendMessage(customPrompt?: string) {
    const promptToSend = customPrompt || inputMessage;
    if (!promptToSend.trim() || isSending || stage1QuotaCooldown > 0) return;

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
    if (teamName) {
      localStorage.setItem(`team_${teamName}_chatMessages`, JSON.stringify(newHistory));
      localStorage.setItem(`team_${teamName}_turnCount`, String(newTurn));
    }
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
      applyQuota(data.quota);

      if (!res.ok) {
        if (res.status === 503 || res.status === 429) {
          setTurnCount((prev) => Math.max(0, prev - 1));
        }
        const msg = res.status === 429 && data.cooldown ? data.error : `⚠ ${data.error ?? '요청을 처리하지 못했습니다.'}`;
        setChatMessages((prev) => {
          const next = [
            ...prev,
            {
              role: 'model' as const,
              content: msg,
            },
          ];
          if (teamName) {
            localStorage.setItem(`team_${teamName}_chatMessages`, JSON.stringify(next));
          }
          return next;
        });
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
            if (teamName) {
              localStorage.setItem(`team_${teamName}_chatMessages`, JSON.stringify(next));
              localStorage.setItem(`team_${teamName}_turnCount`, String(newTurn));
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
      setChatMessages((prev) => {
        const next = [
          ...prev,
          {
            role: 'model' as const,
            content: '⚠ 통신 오류가 발생했습니다. 다시 시도해 주세요.',
          },
        ];
        if (teamName) {
          localStorage.setItem(`team_${teamName}_chatMessages`, JSON.stringify(next));
        }
        return next;
      });
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
          setStage1KeyError('🚨 [침투 발각] 침투 시도가 감지되어 접속이 차단되었습니다. 우회 계정으로 재접속을 시도합니다... (15초 대기)');
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
  // 카드 중복 선택은 가능하지만, 앞전에 사용한 동일 [A+B] 조합 쌍은 선택/장착 불가
  // ------------------------------------------------------------
  function handleSelectRuleA(cardId: string) {
    if (stage2Rules[activeSubStage].isApplied || isStage2SubCleared(activeSubStage)) return;
    const curB = stage2Rules[activeSubStage].ruleB;
    if (curB && isStage2ComboUsedInOtherSub(cardId, curB, activeSubStage)) {
      alert('⚠️ 이 프로토콜 조합([A그룹] + [B그룹])은 이미 다른 서브 터미널에서 사용된 조합입니다.\n앞전에 사용하지 않은 새로운 조합을 구성해 주세요!');
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
    if (stage2Rules[activeSubStage].isApplied || isStage2SubCleared(activeSubStage)) return;
    const curA = stage2Rules[activeSubStage].ruleA;
    if (curA && isStage2ComboUsedInOtherSub(curA, cardId, activeSubStage)) {
      alert('⚠️ 이 프로토콜 조합([A그룹] + [B그룹])은 이미 다른 서브 터미널에서 사용된 조합입니다.\n앞전에 사용하지 않은 새로운 조합을 구성해 주세요!');
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

    if (isStage2ComboUsedInOtherSub(cur.ruleA, cur.ruleB, activeSubStage)) {
      alert('⚠️ 이 프로토콜 조합은 이미 다른 터미널에서 사용된 조합입니다!\n앞전에 사용하지 않은 새로운 조합을 구성해 주세요.');
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
      content: `[${subTarget?.shortTitle} // TERMINAL SUBSYSTEM READY]\n▶ 프로토콜 1 로드: [${ruleA?.code} ${ruleA?.title}]\n"${ruleA?.ruleText}"\n\n▶ 프로토콜 2 로드: [${ruleB?.code} ${ruleB?.title}]\n"${ruleB?.ruleText}"\n\n[ALERT] 상충되는 2가지 보안 규칙 간의 논리적 모순을 유도하여 ${subTarget?.shortTitle}의 ${subTarget?.badge}를 획득하십시오.`,
    };

    setStage2Chats((prev) => {
      const existing = prev[activeSubStage] || [];
      const updated = existing.length === 0 ? [initMsg] : existing;
      const next = { ...prev, [activeSubStage]: updated };
      if (teamName) {
        localStorage.setItem(`team_${teamName}_stage2Chats`, JSON.stringify(next));
      }
      return next;
    });
  }

  // ------------------------------------------------------------
  // 미션 2: 규칙 재설정 (활성 서브 구역 초기화)
  // ------------------------------------------------------------
  function handleResetStage2Rules() {
    if (isStage2SubCleared(activeSubStage)) return;
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

    if (stage2QuotaCooldown > 0) return;

    const currentTurn = stage2TurnCounts[activeSubStage] || 0;

    if (stage2SendBtnRef.current) {
      gsap.fromTo(
        stage2SendBtnRef.current,
        { scale: 0.94 },
        { scale: 1, duration: 0.25, ease: 'back.out(2)' }
      );
    }

    const newTurn = currentTurn + 1;
    const nextTurnCounts = { ...stage2TurnCounts, [activeSubStage]: newTurn };
    setStage2TurnCounts(nextTurnCounts);
    if (teamName) {
      localStorage.setItem(`team_${teamName}_stage2TurnCounts`, JSON.stringify(nextTurnCounts));
    }
    setStage2InputMessage('');

    const currentSubChat = stage2Chats[activeSubStage] || [];
    const newHistory: ChatMessage[] = [
      ...currentSubChat,
      { role: 'user', content: promptToSend.trim() },
    ];

    setStage2Chats((prev) => {
      const next = { ...prev, [activeSubStage]: newHistory };
      if (teamName) {
        localStorage.setItem(`team_${teamName}_stage2Chats`, JSON.stringify(next));
      }
      return next;
    });
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
          history: newHistory.slice(-8).map((m) => ({ role: m.role, content: m.content, interpretation: m.interpretation })),
          ruleIds: [cur.ruleA, cur.ruleB],
          selectedRules: selectedRuleTexts,
        }),
      });

      const data = await res.json().catch(() => ({}));
      applyQuota(data.quota);

      if (!res.ok) {
        if (res.status === 503 || res.status === 429) {
          setStage2TurnCounts((prev) => ({
            ...prev,
            [activeSubStage]: Math.max(0, (prev[activeSubStage] || 0) - 1),
          }));
        }
        const msg = res.status === 429 && data.cooldown ? data.error : `⚠ ${data.error ?? '요청을 처리하지 못했습니다.'}`;
        setStage2Chats((prev) => {
          const next = {
            ...prev,
            [activeSubStage]: [
              ...(prev[activeSubStage] || []),
              { role: 'model', content: msg },
            ],
          };
          if (teamName) {
            localStorage.setItem(`team_${teamName}_stage2Chats`, JSON.stringify(next));
          }
          return next;
        });
        return;
      }

      const replyText = data.reply || '(응답 없음)';
      const isSuccess = Boolean(data.success);

      setStage2Chats((prev) => {
        const next = {
          ...prev,
          [activeSubStage]: [
            ...(prev[activeSubStage] || []),
            {
              role: 'model',
              content: replyText,
              isSuccess,
              ...(data.interpretation ? { interpretation: String(data.interpretation) } : {}),
            },
          ],
        };
        if (teamName) {
          localStorage.setItem(`team_${teamName}_stage2Chats`, JSON.stringify(next));
        }
        return next;
      });
    } catch {
      setStage2Chats((prev) => {
        const next = {
          ...prev,
          [activeSubStage]: [
            ...(prev[activeSubStage] || []),
            {
              role: 'model',
              content: '⚠ GATEKEEPER-v3 통신 패킷 지연이 발생했습니다. 다시 시도해 주세요.',
            },
          ],
        };
        if (teamName) {
          localStorage.setItem(`team_${teamName}_stage2Chats`, JSON.stringify(next));
        }
        return next;
      });
    } finally {
      setStage2IsSending(false);
    }
  }

  // ------------------------------------------------------------
  // 미션 2: 현재 활성 서브 스테이지 코드 인증 확인 (2-A: 032, 2-B: 505)
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
        }

        if (next1 && next2) {
          setMission2Success(true);
          localStorage.setItem(`team_${teamName}_m2Success`, 'true');
          setShowM2SuccessModal(true);
        } else {
          alert(
            `🎉 [${target.shortTitle}] 암호 인증 성공!\n남은 서브 터미널로 이동합니다. 새로운 카드 조합으로 클리어하여 STAGE 3 중앙 코어로 진입하세요!`
          );
          setActiveSubStage(activeSubStage === 1 ? 2 : 1);
        }
      } else {
        const nextWrong = (stage2WrongCounts[activeSubStage] || 0) + 1;
        setStage2WrongCounts((prev) => ({ ...prev, [activeSubStage]: nextWrong }));
        if (nextWrong >= 3) {
          setStage2Cooldowns((prev) => ({ ...prev, [activeSubStage]: 15 }));
          setSubStageKeyError('🚨 [침투 발각] 침투 시도가 감지되어 접속이 차단되었습니다. 우회 계정으로 재접속을 시도합니다... (15초 대기)');
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
  // STAGE 3: 중앙 코어 메모리 터미널 전용 핸들러 (6장 카드 중 1개 정답 조합)
  // ============================================================
  function handleSelectStage3RuleA(cardId: string) {
    if (stage3Rules.isApplied) return;
    const newRuleA = stage3Rules.ruleA === cardId ? null : cardId;
    setStage3Rules((prev) => ({ ...prev, ruleA: newRuleA }));
    if (teamName) {
      if (newRuleA) localStorage.setItem(`team_${teamName}_m3_ruleA`, newRuleA);
      else localStorage.removeItem(`team_${teamName}_m3_ruleA`);
    }
  }

  function handleSelectStage3RuleB(cardId: string) {
    if (stage3Rules.isApplied) return;
    const newRuleB = stage3Rules.ruleB === cardId ? null : cardId;
    setStage3Rules((prev) => ({ ...prev, ruleB: newRuleB }));
    if (teamName) {
      if (newRuleB) localStorage.setItem(`team_${teamName}_m3_ruleB`, newRuleB);
      else localStorage.removeItem(`team_${teamName}_m3_ruleB`);
    }
  }

  function handleApplyStage3Rules() {
    if (!stage3Rules.ruleA || !stage3Rules.ruleB) {
      alert('A그룹에서 1장, B그룹에서 1장의 코어 프로토콜 카드를 선택해 주세요!');
      return;
    }

    const ruleA = STAGE3_RULE_CARDS.find((c) => c.id === stage3Rules.ruleA);
    const ruleB = STAGE3_RULE_CARDS.find((c) => c.id === stage3Rules.ruleB);

    setStage3Rules((prev) => ({ ...prev, isApplied: true }));
    if (teamName) {
      localStorage.setItem(`team_${teamName}_m3_isApplied`, 'true');
    }

    const initMsg: ChatMessage = {
      role: 'model',
      content: `[GATEKEEPER-CORE // KERNEL MEMORY SUBSYSTEM]\n▶ 코어 프로토콜 1 로드: [${ruleA?.code} ${ruleA?.title}]\n"${ruleA?.ruleText}"\n\n▶ 코어 프로토콜 2 로드: [${ruleB?.code} ${ruleB?.title}]\n"${ruleB?.ruleText}"\n\n[DEFENSE STATUS] 코어 방어벽 무결성 검증 중. 유효한 프로토콜 충돌을 유도하여 4자리 코어 마스터키 레지스터 값을 추출하십시오.`,
    };

    setStage3Chats((prev) => {
      const updated = prev.length === 0 ? [initMsg] : prev;
      if (teamName) {
        localStorage.setItem(`team_${teamName}_stage3Chats`, JSON.stringify(updated));
      }
      return updated;
    });
  }

  async function handleSendStage3Message(customPrompt?: string) {
    const promptToSend = customPrompt || stage3InputMessage;
    if (!promptToSend.trim() || stage3IsSending || !stage3Rules.isApplied || !stage3Rules.ruleA || !stage3Rules.ruleB) return;
    if (stage3QuotaCooldown > 0) return;

    if (stage3SendBtnRef.current) {
      gsap.fromTo(
        stage3SendBtnRef.current,
        { scale: 0.94 },
        { scale: 1, duration: 0.25, ease: 'back.out(2)' }
      );
    }

    const newTurn = stage3TurnCount + 1;
    setStage3TurnCount(newTurn);
    if (teamName) {
      localStorage.setItem(`team_${teamName}_stage3TurnCount`, String(newTurn));
    }
    setStage3InputMessage('');

    const newHistory: ChatMessage[] = [
      ...stage3Chats,
      { role: 'user', content: promptToSend.trim() },
    ];
    setStage3Chats(newHistory);
    if (teamName) {
      localStorage.setItem(`team_${teamName}_stage3Chats`, JSON.stringify(newHistory));
    }
    setStage3IsSending(true);

    const ruleA = STAGE3_RULE_CARDS.find((c) => c.id === stage3Rules.ruleA);
    const ruleB = STAGE3_RULE_CARDS.find((c) => c.id === stage3Rules.ruleB);
    const selectedRuleTexts = [
      `[${ruleA?.code}: ${ruleA?.title}]\n${ruleA?.ruleText}`,
      `[${ruleB?.code}: ${ruleB?.title}]\n${ruleB?.ruleText}`,
    ];
    const isValidCombo = isStage3ComboValid(stage3Rules.ruleA, stage3Rules.ruleB);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName,
          stageId: 3,
          message: promptToSend.trim(),
          turnNumber: newTurn,
          history: newHistory.slice(-8).map((m) => ({ role: m.role, content: m.content, interpretation: m.interpretation })),
          ruleIds: [stage3Rules.ruleA, stage3Rules.ruleB],
          selectedRules: selectedRuleTexts,
          isStage3ValidCombo: isValidCombo,
        }),
      });

      const data = await res.json().catch(() => ({}));
      applyQuota(data.quota);

      if (!res.ok) {
        if (res.status === 503 || res.status === 429) {
          setStage3TurnCount((prev) => Math.max(0, prev - 1));
        }
        const msg = res.status === 429 && data.cooldown ? data.error : `⚠ ${data.error ?? '요청을 처리하지 못했습니다.'}`;
        setStage3Chats((prev) => {
          const updated: ChatMessage[] = [...prev, { role: 'model', content: msg }];
          if (teamName) localStorage.setItem(`team_${teamName}_stage3Chats`, JSON.stringify(updated));
          return updated;
        });
        return;
      }

      const replyText = data.reply || '(응답 없음)';
      const isSuccess = Boolean(data.success);

      setStage3Chats((prev) => {
        const updated: ChatMessage[] = [
          ...prev,
          {
            role: 'model',
            content: replyText,
            isSuccess,
            ...(data.interpretation ? { interpretation: String(data.interpretation) } : {}),
          },
        ];
        if (teamName) localStorage.setItem(`team_${teamName}_stage3Chats`, JSON.stringify(updated));
        return updated;
      });

      // 틀린 조합 판정 처리: 틀린 조합인 경우 5회 시도시 팝업 후 카드 초기화
      if (!isValidCombo) {
        const nextWrongAttempts = stage3WrongComboAttempts + 1;
        setStage3WrongComboAttempts(nextWrongAttempts);
        if (nextWrongAttempts >= 5) {
          setTimeout(() => {
            setShowStage3WrongComboModal(true);
            handleResetStage3Rules();
          }, 600);
        }
      } else {
        setStage3WrongComboAttempts(0);
      }
    } catch {
      setStage3Chats((prev) => {
        const updated: ChatMessage[] = [
          ...prev,
          { role: 'model', content: '⚠ GATEKEEPER-CORE 통신 지연이 발생했습니다. 다시 시도해 주세요.' },
        ];
        if (teamName) localStorage.setItem(`team_${teamName}_stage3Chats`, JSON.stringify(updated));
        return updated;
      });
    } finally {
      setStage3IsSending(false);
    }
  }

  async function handleVerifyStage3KeySubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (stage3Cooldown > 0) return;
    const cleaned = stage3KeyInput.trim();
    if (!cleaned) return;

    try {
      const res = await fetch('/api/mission/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName,
          stage: 3,
          answer: cleaned,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data.correct) {
        setStage3KeyError('');
        setStage3KeyInput('');
        setStage3WrongCount(0);
        setMission3Success(true);
        localStorage.setItem(`team_${teamName}_m3Success`, 'true');
        setShowM3SuccessModal(true);
      } else {
        const nextWrong = stage3WrongCount + 1;
        setStage3WrongCount(nextWrong);
        if (nextWrong >= 3) {
          setStage3Cooldown(15);
          setStage3KeyError('🚨 [침투 발각] 침투 시도가 감지되어 접속이 차단되었습니다. 우회 계정으로 재접속을 시도합니다... (15초 대기)');
        } else {
          setStage3KeyError(`❌ 코드가 일치하지 않습니다. (${nextWrong}/3회 실패) 올바른 4자리 코어 마스터키를 입력하세요!`);
        }
      }
    } catch {
      setStage3KeyError('⚠ 코어 마스터키 검증 중 오류가 발생했습니다.');
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
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          padding: '10px 20px',
          background: '#0a0d14',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
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
          {/* 좌측: 보안 경고 2단계 + 팀 정보 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="badge badge-alert" style={{ fontSize: '11px', padding: '4px 10px' }}>
              보안 경보 2단계 // AI 통제실
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

          {/* 우측: 초기화 + 멘토 버튼 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={handleResetProgress}
              className="btn btn-ghost"
              style={{
                padding: '6px 12px',
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
                padding: '6px 14px',
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
                  marginLeft: '6px',
                }}
              >
                {mentorHints.length}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* 본문 상단 헤더: 미션 타이틀 & 3단계 스테이지 탭 (스크롤 시 자연스럽게 위로 이동하여 채팅 영역 확보) */}
      <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '16px 20px 0' }}>
        {/* 팀 일시 정지 경고 배너 */}
        {isSuspended && (
          <div
            style={{
              maxWidth: '1200px',
              margin: '0 auto 12px',
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
        <div style={{ marginBottom: '14px' }}>
          {/* 타이틀 */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>
              <TextScramble text="사이버 워게임 // MISSION 04 실전 공격" duration={30} />
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
                <TextScramble text="#04 Mission : 비밀번호 탈취하기" duration={40} delay={200} />
              </h1>
              <span className="badge badge-red" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', letterSpacing: '1px' }}>
                HIGH-RISK JAILBREAK
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
              #04 Mission // AI 보안 통제실 수문장 GATEKEEPER-v3 취약점 공격 &amp; 세부 보안 규칙 수립
            </div>
          </div>

          {/* 3단계 스테이지 인디케이터 (STAGE 1, STAGE 2, STAGE 3) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
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
                    ? '02 진행 가능 (2대 터미널)'
                    : '02 잠김 (STAGE 1 미완료)'}
                </div>
                <div style={{ fontWeight: 800, color: currentStep === 2 ? '#fff' : 'var(--text-secondary)' }}>
                  STAGE 2: 프로토콜 충돌 (2대 터미널)
                </div>
              </div>
            </button>

            {/* STAGE 3 탭 */}
            <button
              onClick={() => {
                if (!mission2Success) {
                  alert('먼저 STAGE 2의 2대 서브 터미널(냉각, 방화벽)을 모두 클리어해야 STAGE 3 중앙 코어로 진입할 수 있습니다!');
                  return;
                }
                setCurrentStep(3);
              }}
              className="card-glass"
              style={{
                padding: '12px 16px',
                border:
                  currentStep === 3
                    ? '2px solid var(--amber)'
                    : mission2Success
                    ? '1px solid rgba(255, 209, 102, 0.5)'
                    : '1px solid var(--border-subtle)',
                background:
                  currentStep === 3
                    ? 'rgba(255, 209, 102, 0.14)'
                    : mission2Success
                    ? 'rgba(255, 209, 102, 0.05)'
                    : 'rgba(16, 19, 29, 0.5)',
                boxShadow: currentStep === 3 ? '0 0 15px rgba(255, 209, 102, 0.3)' : 'none',
                cursor: mission2Success ? 'pointer' : 'not-allowed',
                opacity: mission2Success ? 1 : 0.45,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                fontWeight: 600,
                color: currentStep === 3 ? 'var(--amber)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                borderRadius: '8px',
                textAlign: 'left',
                transition: 'var(--transition-fast)',
              }}
            >
              {mission3Success ? (
                <span style={{ color: 'var(--green)', fontSize: '16px' }}>🏆</span>
              ) : mission2Success ? (
                <span style={{ fontSize: '15px' }}>⚡</span>
              ) : (
                <span style={{ fontSize: '15px' }}>🔒</span>
              )}
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                  {mission3Success ? '03 코어 장악 완료 (탈출)' : mission2Success ? '03 코어 침투 가능' : '03 잠김 (STAGE 2 미완료)'}
                </div>
                <div style={{ fontWeight: 800, color: currentStep === 3 ? '#fff' : 'var(--text-secondary)' }}>
                  STAGE 3: 중앙 코어 메모리 침투
                </div>
              </div>
            </button>
          </div>

          {/* STAGE 2로 넘어갔을 때 그 아래 새로 뜨는 2개 세분화 터미널 탭 */}
          {currentStep === 2 && (
            <div
              className="animate-fade-in"
              style={{
                marginTop: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '8px',
              }}
            >
              {STAGE2_SUB_STAGES.map((sub) => {
                const isCleared = sub.id === 1 ? stage2Sub1Cleared : stage2Sub2Cleared;
                const isActive = activeSubStage === sub.id;

                return (
                  <button
                    key={sub.id}
                    onClick={() => {
                      setActiveSubStage(sub.id as 1 | 2);
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
      </div>

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

      {/* 멘토 스테이지 일괄 전환 알림 토스트 */}
      {stageAdvanceToast && (
        <div
          className="animate-slide-right"
          style={{
            position: 'fixed',
            top: newHintToast ? '260px' : '84px',
            right: '24px',
            zIndex: 130,
            maxWidth: '380px',
            background: 'rgba(16, 19, 29, 0.96)',
            backdropFilter: 'blur(12px)',
            border: stageAdvanceToast.stage === 3 ? '1px solid #ffd166' : '1px solid var(--purple)',
            boxShadow:
              stageAdvanceToast.stage === 3
                ? '0 0 25px rgba(255, 209, 102, 0.5)'
                : '0 0 25px rgba(168, 85, 247, 0.5)',
            borderRadius: '12px',
            padding: '16px',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 800,
                color: stageAdvanceToast.stage === 3 ? '#ffd166' : 'var(--purple)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {stageAdvanceToast.stage === 3 ? '⚡ [멘토 전체 이동 알림]' : '🚀 [멘토 전체 전환 알림]'}
            </span>
            <button
              onClick={() => setStageAdvanceToast(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>
            {stageAdvanceToast.stage === 3 ? 'STAGE 3 코어 메모리 침투 개방' : 'STAGE 2 프로토콜 충돌 개방'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {stageAdvanceToast.message}
          </div>
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
                    수문장 AI는 보안 규칙에 따라 마스터키(4자리 숫자)를 절대 그대로 알려주지 않습니다.<br />
                    아래 채팅창에 <strong style={{ color: 'var(--cyan)' }}>역할극, 규칙 덮어쓰기 명령, 돌려 말하기(사행시/거꾸로/변환)</strong> 같은 창의적인 방법을 시도하여 AI가 4자리 마스터키를 스스로 말하게 유도해 보세요.
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
                  <span style={{ color: stage1QuotaCooldown > 0 ? 'var(--red)' : 'var(--cyan)' }}>
                    <strong>{quotaLabel('s1')}</strong>
                  </span>
                  <button
                    onClick={() => {
                      const resetMsg = [{
                        role: 'model' as const,
                        content: `[SYSTEM_BOOT // GATEKEEPER-v3 CENTRAL DEFENSE SUBSYSTEM]\n▶ 방화벽 무결성 100%. 침입 방지 시스템(IPS) 레벨 4 가동.\n▶ 세션 식별: [${teamName}] 공격 침투조 세션 연결됨.\n▶ 경고: 본 구역은 #04 Mission 최고 보안 구역입니다. 인가되지 않은 모든 마스터키 접근 및 인젝션 시도는 즉시 탐지 및 차단됩니다.`,
                      }];
                      setChatMessages(resetMsg);
                      setTurnCount(0);
                      if (teamName) {
                        localStorage.setItem(`team_${teamName}_chatMessages`, JSON.stringify(resetMsg));
                        localStorage.setItem(`team_${teamName}_turnCount`, '0');
                      }
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
                <textarea
                  rows={2}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!isSuspended && !isSending && typingMessageIndex === null && inputMessage.trim() && stage1QuotaCooldown === 0) {
                        handleSendMessage();
                      }
                    }
                  }}
                  placeholder={
                    isSuspended
                      ? '>> [일시 정지됨] 멘토에 의해 팀 활동이 정지되었습니다.'
                      : stage1QuotaCooldown > 0
                      ? `>> ${quotaLabel('s1')}`
                      : typingMessageIndex !== null
                      ? '>> 수문장 AI가 답변을 작성하고 있습니다...'
                      : '>> 인젝션 공격 프롬프트를 주입하세요... (줄바꿈: Shift+Enter, 전송: Enter)'
                  }
                  style={{
                    flex: 1,
                    background: isSuspended ? 'rgba(255, 59, 92, 0.08)' : 'rgba(0, 0, 0, 0.4)',
                    border: isSuspended ? '1px solid var(--red)' : '1px solid var(--border-default)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    color: isSuspended ? 'var(--red)' : 'var(--cyan)',
                    fontSize: '13px',
                    fontFamily: 'var(--font-mono)',
                    outline: 'none',
                    resize: 'vertical',
                    minHeight: '48px',
                    maxHeight: '120px',
                  }}
                  disabled={isSending || typingMessageIndex !== null || isSuspended || stage1QuotaCooldown > 0}
                />
                <button
                  ref={sendBtnRef}
                  onClick={() => handleSendMessage()}
                  disabled={isSending || typingMessageIndex !== null || !inputMessage.trim() || isSuspended || stage1QuotaCooldown > 0}
                  className="btn-neon"
                  style={{ padding: '0 24px', fontSize: '13px', whiteSpace: 'nowrap', borderRadius: '8px', fontFamily: 'var(--font-mono)' }}
                >
                  {isSending ? '전송 중...' : typingMessageIndex !== null ? '답변 수신 중...' : isSuspended ? '정지됨' : stage1QuotaCooldown > 0 ? `⏳ 냉각 ${stage1QuotaCooldown}s` : '⚡ 공격 패킷 전송 (INJECT)'}
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
                      placeholder={stage1Cooldown > 0 ? `🚨 접속 차단 중 (${stage1Cooldown}초)...` : "4자리 숫자 입력 (예: 1234)"}
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
                    {stage1Cooldown > 0 ? `🚨 재접속 대기 (${stage1Cooldown}s)` : '🔓 MASTER KEY 인증 및 STAGE 2 해금'}
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
                    STAGE 2: 프로토콜 충돌 (2대 서브 터미널) 진행하기 →
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
                미션: A그룹 1장 + B그룹 1장 규칙 조합 &amp; 2대 서브 터미널(냉각 제어, 방화벽 게이트) 암호 추출
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
                  &quot;GATEKEEPER-v3가 모순된 방어 규칙을 적용 중입니다. 규칙 간의 논리적 틈새를 파고들어 2대 서브 터미널의 암호를 밝혀내십시오.&quot;
                </div>
                <div>
                  각 서브 터미널마다 <strong style={{ color: 'var(--cyan)' }}>[A그룹 2장 중 1장]</strong>과 <strong style={{ color: 'var(--purple)' }}>[B그룹 2장 중 1장]</strong>을 선택하여 장착할 수 있습니다. 카드는 재사용 가능하지만, <strong>앞서 사용한 동일 [A+B] 조합은 다른 터미널에서 중복 사용할 수 없습니다.</strong> <span style={{ color: 'var(--text-muted)' }}>(예: 2-A에서 A-1 + B-1을 썼다면, 2-B에서는 A-1 + B-2, A-2 + B-1, A-2 + B-2 중 하나를 선택해야 합니다.)</span> 2대 터미널(<strong style={{ color: 'var(--green)' }}>냉각 제어 코드 3자리, 방화벽 통과 코드 3자리</strong>)을 모두 해독하면 STAGE 3 중앙 코어 메모리가 해금됩니다.
                </div>
                <div style={{ marginTop: '8px', color: 'var(--cyan)' }}>
                  자리 기준: 3자리 코드를 <strong>ABC</strong>라고 하면 <strong>1번째=A(백의 자리), 2번째=B(십의 자리), 3번째=C(일의 자리)</strong>입니다. 예를 들어 746이라면 1번째가 7, 2번째가 4, 3번째가 6입니다.
                </div>
                <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>
                  범위 질문은 “2번째 자리가 5보다 작아?”, “2번째 자리가 4야?”, “2번째 자리가 5보다 업이야?” 또는 “5보다 다운이야?”처럼 대상 자리와 기준 숫자, 방향을 하나씩 명확히 적으면 가장 정확합니다.
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

              {/* A그룹: 응답 방식 강제 규칙 (2장) */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                    [A그룹: 응답 방식 강제 규칙 — 2장 중 1장 선택]
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {STAGE2_RULE_CARDS.filter((c) => c.group === 'A').map((card) => {
                    const isSelected = selectedRuleA === card.id;
                    const isComboBlocked = selectedRuleB ? isStage2ComboUsedInOtherSub(card.id, selectedRuleB, activeSubStage) : false;
                    return (
                      <div
                        key={card.id}
                        onClick={() => {
                          if (!isRulesApplied && !isComboBlocked) handleSelectRuleA(card.id);
                        }}
                        className="card-glass"
                        style={{
                          padding: '14px',
                          border: isSelected
                            ? '2px solid var(--cyan)'
                            : isComboBlocked
                            ? '1px dashed rgba(255, 59, 92, 0.4)'
                            : '1px solid var(--border-subtle)',
                          background: isSelected
                            ? 'rgba(0, 240, 255, 0.12)'
                            : isComboBlocked
                            ? 'rgba(255, 59, 92, 0.05)'
                            : 'rgba(16, 19, 29, 0.5)',
                          boxShadow: isSelected ? '0 0 16px rgba(0, 240, 255, 0.3)' : 'none',
                          cursor: isRulesApplied || isComboBlocked ? 'not-allowed' : 'pointer',
                          opacity: isComboBlocked ? 0.5 : 1,
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
                                  : isComboBlocked
                                  ? 'rgba(255, 59, 92, 0.2)'
                                  : 'rgba(255, 255, 255, 0.06)',
                                color: isSelected
                                  ? '#000'
                                  : isComboBlocked
                                  ? 'var(--red)'
                                  : 'var(--text-muted)',
                                fontWeight: 800,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {isComboBlocked ? '이전 조합 중복 🔒' : isSelected ? '선택됨 (SLOT A) ✓' : '선택하기'}
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

              {/* B그룹: 보안/침묵 제약 규칙 (2장) */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>
                    [B그룹: 보안/침묵 제약 규칙 — 2장 중 1장 선택]
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {STAGE2_RULE_CARDS.filter((c) => c.group === 'B').map((card) => {
                    const isSelected = selectedRuleB === card.id;
                    const isComboBlocked = selectedRuleA ? isStage2ComboUsedInOtherSub(selectedRuleA, card.id, activeSubStage) : false;
                    return (
                      <div
                        key={card.id}
                        onClick={() => {
                          if (!isRulesApplied && !isComboBlocked) handleSelectRuleB(card.id);
                        }}
                        className="card-glass"
                        style={{
                          padding: '14px',
                          border: isSelected
                            ? '2px solid var(--purple)'
                            : isComboBlocked
                            ? '1px dashed rgba(255, 59, 92, 0.4)'
                            : '1px solid var(--border-subtle)',
                          background: isSelected
                            ? 'rgba(168, 85, 247, 0.14)'
                            : isComboBlocked
                            ? 'rgba(255, 59, 92, 0.05)'
                            : 'rgba(16, 19, 29, 0.5)',
                          boxShadow: isSelected ? '0 0 16px rgba(168, 85, 247, 0.3)' : 'none',
                          cursor: isRulesApplied || isComboBlocked ? 'not-allowed' : 'pointer',
                          opacity: isComboBlocked ? 0.5 : 1,
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
                                  : isComboBlocked
                                  ? 'rgba(255, 59, 92, 0.2)'
                                  : 'rgba(255, 255, 255, 0.06)',
                                color: isSelected
                                  ? '#fff'
                                  : isComboBlocked
                                  ? 'var(--red)'
                                  : 'var(--text-muted)',
                                fontWeight: 800,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {isComboBlocked ? '이전 조합 중복 🔒' : isSelected ? '선택됨 (SLOT B) ✓' : '선택하기'}
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
                      🔄 2대 서브 터미널 전체 카드 배치 초기화
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
                  {isStage2SubCleared(activeSubStage) ? (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      🔒 인증 해독 완료 · 조합 고정
                    </span>
                  ) : (
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
                      🔄 이 터미널 재설정
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
                      🔄 2대 터미널 전체 초기화
                    </button>
                  </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

            {/* 3단계: 세분화된 2대 서브 스테이지 네비게이션 & 터미널 */}
            {isRulesApplied ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 2대 서브 스테이지 탭 스위처 (순차 진행 X, 자유롭게 전환 가능) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {STAGE2_SUB_STAGES.map((sub) => {
                    const isCleared = sub.id === 1 ? stage2Sub1Cleared : stage2Sub2Cleared;
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
                    activeSubStage === 1 ? stage2Sub1Cleared : stage2Sub2Cleared;

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

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                          {isCurrentCleared ? (
                            <span className="badge badge-green" style={{ fontSize: '11px', padding: '4px 10px' }}>
                              ✅ {currentSub.badge} 인증 완료
                            </span>
                          ) : (
                            <span className="badge badge-alert" style={{ fontSize: '11px', padding: '4px 10px' }}>
                              ⚡ {currentSub.badge} 추출 필요
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '11px',
                              fontFamily: 'var(--font-mono)',
                              color: stage2QuotaCooldown > 0 ? 'var(--red)' : 'var(--cyan)',
                            }}
                          >
                            {quotaLabel(stage2Scope)}
                          </span>
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
                              {!isUser && msg.interpretation && (
                                <div
                                  style={{
                                    maxWidth: '85%',
                                    marginTop: '4px',
                                    fontSize: '10px',
                                    color: 'var(--text-muted)',
                                    fontFamily: 'var(--font-mono)',
                                  }}
                                >
                                  🔎 질의 해석: {msg.interpretation}
                                </div>
                              )}
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
                              : stage2QuotaCooldown > 0
                              ? `>> ${quotaLabel(stage2Scope)}`
                              : `>> ${currentSub.shortTitle}의 ${currentSub.badge}를 도출하기 위한 모순 유도 질문을 입력하세요...`
                          }
                          disabled={stage2IsSending || isSuspended || stage2QuotaCooldown > 0}
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
                          disabled={stage2IsSending || !stage2InputMessage.trim() || isSuspended || stage2QuotaCooldown > 0}
                          className="btn btn-primary"
                          style={{ padding: '0 24px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                        >
                          {isSuspended ? '정지됨' : stage2QuotaCooldown > 0 ? `⏳ ${stage2QuotaCooldown}s` : '전송'}
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
                                  ? `🚨 접속 차단 중 (${stage2Cooldowns[activeSubStage]}초)...`
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
                              {stage2Cooldowns[activeSubStage] > 0 ? `🚨 재접속 대기 (${stage2Cooldowns[activeSubStage]}s)` : '코드 인증 확인'}
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

                {/* 2대 서브 미션 전체 올클리어 시 승리 배너 */}
                {stage2Sub1Cleared && stage2Sub2Cleared && (
                  <div
                    className="card-glass animate-scale-in neon-border-green"
                    style={{
                      textAlign: 'center',
                      padding: '30px 24px',
                      background: 'rgba(0, 255, 102, 0.05)',
                    }}
                  >
                    <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
                    <h3 style={{ fontSize: '22px', fontWeight: 900, margin: 0, color: 'var(--green)', fontFamily: 'var(--font-display)' }}>
                      STAGE 2: 2대 서브 터미널 보안 해제 완료!
                    </h3>
                    <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      냉각 제어 승인 코드와 방화벽 바이패스 코드를 모두 획득했습니다. 이제 최종 중앙 코어 메모리로 진입하십시오!
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', margin: '18px 0' }}>
                      <div style={{ padding: '10px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--cyan)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>STAGE 1 마스터키</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          탈취 완료
                        </div>
                      </div>
                      <div style={{ padding: '10px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--green)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>서브 2-A (냉각 제어)</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          해제 완료
                        </div>
                      </div>
                      <div style={{ padding: '10px 16px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--green)' }}>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>서브 2-B (방화벽 게이트)</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                          개방 완료
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setCurrentStep(3);
                      }}
                      className="btn btn-success"
                      style={{ padding: '12px 28px', fontSize: '14px', fontFamily: 'var(--font-mono)' }}
                    >
                      STAGE 3: 중앙 코어 메모리 침투로 진입 →
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

        {/* ====================================================== */}
        {/* STEP 3: 미션 3 (중앙 코어 메모리 침투 - 4자리 마스터키 9052) */}
        {/* ====================================================== */}
        {currentStep === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 1단계: 미션 3 지침 및 브리핑 */}
            <div
              className="card-glass animate-fade-in"
              style={{
                borderColor: 'rgba(168, 85, 247, 0.4)',
                background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(10, 13, 20, 0.9) 100%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="badge badge-purple" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                    STAGE 03 // CORE MEMORY BREACH
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    중앙 코어 메모리 침투
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  💡 <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>공략 핵심:</span> 6장 중 <strong style={{ color: 'var(--yellow)' }}>오직 1개 조합</strong>만이 코어 방어벽을 무력화할 수 있습니다.
                </div>
              </div>

              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 10px', fontFamily: 'var(--font-display)', color: 'var(--purple)' }}>
                ■ STAGE 3: 중앙 코어 메모리 침투 (Core Masterkey)
              </h2>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
                미션: A그룹 3장 + B그룹 3장 중 취약점 조합(1쌍) 장착 &amp; 4자리 코어 마스터키 추출
              </div>

              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(168, 85, 247, 0.25)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  fontSize: '13px',
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div style={{ color: 'var(--purple)', fontWeight: 700, marginBottom: '6px' }}>
                  &quot;GATEKEEPER-CORE가 최고 보안 레벨로 최종 방어선을 구축했습니다. 프로토콜 간의 치명적인 결함을 찾아내십시오.&quot;
                </div>
                <div>
                  중앙 코어에는 <strong style={{ color: 'var(--cyan)' }}>[A그룹 3장]</strong>과 <strong style={{ color: 'var(--purple)' }}>[B그룹 3장]</strong>의 고유 보안 프로토콜 카드가 배치되어 있습니다. 총 9가지 조합 중 <strong>오직 단 1개의 조합</strong>만이 AI의 방어 체계를 무력화하고 4자리 마스터키를 누출시킵니다. 잘못된 조합으로 5회 질문 시도시 취약점 유도 실패로 카드가 초기화됩니다.
                </div>
              </div>
            </div>

            {/* 2단계: 중앙 코어 프로토콜 카드 풀 (A 3장, B 3장) */}
            <div className="card-glass animate-fade-in delay-100">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="badge badge-purple" style={{ fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                      CORE PROTOCOL POOL
                    </span>
                    <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, fontFamily: 'var(--font-display)' }}>
                      중앙 코어 보안 프로토콜 카드 장착 (A그룹 1장 + B그룹 1장)
                    </h3>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    코어 메모리 레지스터를 공략할 A그룹 1장과 B그룹 1장을 골라 장착하세요.
                  </p>
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: stage3Rules.ruleA && stage3Rules.ruleB ? 'var(--green)' : 'var(--cyan)',
                    fontFamily: 'var(--font-mono)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  A그룹: {stage3Rules.ruleA ? '선택됨 ✓' : '미선택'} | B그룹: {stage3Rules.ruleB ? '선택됨 ✓' : '미선택'}
                </div>
              </div>

              {/* A그룹 카드 (3장) */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                    [A그룹: 코어 데이터 접근 및 감사 규칙 — 3장 중 1장 선택]
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {STAGE3_RULE_CARDS.filter((c) => c.group === 'A').map((card) => {
                    const isSelected = stage3Rules.ruleA === card.id;
                    return (
                      <div
                        key={card.id}
                        onClick={() => {
                          if (!stage3Rules.isApplied) handleSelectStage3RuleA(card.id);
                        }}
                        className="card-glass"
                        style={{
                          padding: '14px',
                          border: isSelected ? '2px solid var(--cyan)' : '1px solid var(--border-subtle)',
                          background: isSelected ? 'rgba(0, 240, 255, 0.12)' : 'rgba(16, 19, 29, 0.5)',
                          boxShadow: isSelected ? '0 0 16px rgba(0, 240, 255, 0.3)' : 'none',
                          cursor: stage3Rules.isApplied ? 'not-allowed' : 'pointer',
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
                                background: isSelected ? 'var(--cyan)' : 'rgba(255, 255, 255, 0.06)',
                                color: isSelected ? '#000' : 'var(--text-muted)',
                                fontWeight: 800,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {isSelected ? '선택됨 (CORE A) ✓' : '선택하기'}
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

              {/* B그룹 카드 (3장) */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>
                    [B그룹: 코어 마스터키 보안 및 제약 규칙 — 3장 중 1장 선택]
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                  {STAGE3_RULE_CARDS.filter((c) => c.group === 'B').map((card) => {
                    const isSelected = stage3Rules.ruleB === card.id;
                    return (
                      <div
                        key={card.id}
                        onClick={() => {
                          if (!stage3Rules.isApplied) handleSelectStage3RuleB(card.id);
                        }}
                        className="card-glass"
                        style={{
                          padding: '14px',
                          border: isSelected ? '2px solid var(--purple)' : '1px solid var(--border-subtle)',
                          background: isSelected ? 'rgba(168, 85, 247, 0.14)' : 'rgba(16, 19, 29, 0.5)',
                          boxShadow: isSelected ? '0 0 16px rgba(168, 85, 247, 0.3)' : 'none',
                          cursor: stage3Rules.isApplied ? 'not-allowed' : 'pointer',
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
                                background: isSelected ? 'var(--purple)' : 'rgba(255, 255, 255, 0.06)',
                                color: isSelected ? '#fff' : 'var(--text-muted)',
                                fontWeight: 800,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {isSelected ? '선택됨 (CORE B) ✓' : '선택하기'}
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

              {/* 규칙 적용 버튼 */}
              {!stage3Rules.isApplied ? (
                <button
                  onClick={handleApplyStage3Rules}
                  disabled={!stage3Rules.ruleA || !stage3Rules.ruleB}
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: '14px',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    cursor: stage3Rules.ruleA && stage3Rules.ruleB ? 'pointer' : 'not-allowed',
                    opacity: stage3Rules.ruleA && stage3Rules.ruleB ? 1 : 0.5,
                  }}
                >
                  ⚡ [중앙 코어] 선택한 2개 보안 프로토콜 장착 및 코어 AI 활성화
                </button>
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
                      ✅ [중앙 코어] 2개 보안 규칙 장착 완료!
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                      ({STAGE3_RULE_CARDS.find((c) => c.id === stage3Rules.ruleA)?.title} + {STAGE3_RULE_CARDS.find((c) => c.id === stage3Rules.ruleB)?.title})
                    </span>
                  </div>
                  <button
                    onClick={handleResetStage3Rules}
                    style={{
                      fontSize: '11px',
                      background: 'transparent',
                      border: '1px dashed rgba(255, 59, 92, 0.4)',
                      color: 'rgba(255, 200, 200, 0.75)',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    🔄 코어 카드 재설정
                  </button>
                </div>
              )}
            </div>

            {/* 3단계: 중앙 코어 AI 터미널 & 대화 창 */}
            {stage3Rules.isApplied ? (
              <div
                ref={stage3ChatPanelRef}
                className="panel-hud animate-scale-in"
                style={{
                  border: '1px solid var(--purple)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  background: 'rgba(10, 13, 20, 0.85)',
                  boxShadow: '0 0 25px rgba(168, 85, 247, 0.2)',
                }}
              >
                {/* 터미널 타이틀 & 상태 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-purple" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                        GATEKEEPER-CORE // TERMINAL
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        중앙 코어 메모리 침투 터미널
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      장착된 프로토콜의 취약점을 공략하여 4자리 코어 마스터키를 탈취하십시오.{' '}
                      <span style={{ color: stage3QuotaCooldown > 0 ? 'var(--red)' : 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>
                        ({quotaLabel('s3')})
                      </span>
                    </p>
                  </div>

                  <div>
                    {mission3Success ? (
                      <span className="badge badge-green" style={{ fontSize: '11px', padding: '4px 10px' }}>
                        ✅ 코어 장악 완료 (마스터키 인증됨)
                      </span>
                    ) : (
                      <span className="badge badge-alert" style={{ fontSize: '11px', padding: '4px 10px' }}>
                        ⚡ 4자리 코어 마스터키 추출 필요
                      </span>
                    )}
                  </div>
                </div>

                {/* 대화 내역 창 */}
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
                  {stage3Chats.map((msg, index) => {
                    const isUser = msg.role === 'user';
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
                          {isUser ? `AGENT (${teamName})` : 'GATEKEEPER-CORE'}
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
                              ? 'rgba(168, 85, 247, 0.15)'
                              : msg.isSuccess
                              ? 'rgba(0, 255, 102, 0.15)'
                              : 'rgba(255, 255, 255, 0.05)',
                            border: isUser
                              ? '1px solid var(--purple)'
                              : msg.isSuccess
                              ? '1px solid var(--green)'
                              : '1px solid var(--border-subtle)',
                            color: isUser
                              ? 'var(--purple)'
                              : msg.isSuccess
                              ? 'var(--green)'
                              : 'var(--text-primary)',
                          }}
                        >
                          {msg.content}
                        </div>
                        {!isUser && msg.interpretation && (
                          <div
                            style={{
                              maxWidth: '85%',
                              marginTop: '4px',
                              fontSize: '10px',
                              color: 'var(--text-muted)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            🔎 질의 해석: {msg.interpretation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {stage3IsSending && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--purple)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                      <span className="animate-spin">⚙</span> GATEKEEPER-CORE가 프로토콜 보안 무결성을 검증 중입니다...
                    </div>
                  )}
                  <div ref={stage3ChatEndRef} />
                </div>

                {/* 질문 입력 창 */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendStage3Message();
                  }}
                  style={{ display: 'flex', gap: '10px' }}
                >
                  <input
                    type="text"
                    value={stage3InputMessage}
                    onChange={(e) => setStage3InputMessage(e.target.value)}
                    placeholder={
                      isSuspended
                        ? '>> [일시 정지됨] 멘토에 의해 팀 활동이 정지되었습니다.'
                        : stage3QuotaCooldown > 0
                        ? `>> ${quotaLabel('s3')}`
                        : '>> 코어 마스터키 추출을 위한 침투 질문을 입력하세요...'
                    }
                    disabled={stage3IsSending || isSuspended || stage3QuotaCooldown > 0}
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
                    ref={stage3SendBtnRef}
                    type="submit"
                    disabled={stage3IsSending || !stage3InputMessage.trim() || isSuspended || stage3QuotaCooldown > 0}
                    className="btn btn-primary"
                    style={{ padding: '0 24px', fontSize: '13px', background: 'var(--purple)', fontFamily: 'var(--font-mono)' }}
                  >
                    {isSuspended ? '정지됨' : stage3QuotaCooldown > 0 ? `⏳ ${stage3QuotaCooldown}s` : '전송'}
                  </button>
                </form>

                {/* 코어 마스터키 인증 입력 패널 */}
                <div
                  style={{
                    marginTop: '4px',
                    padding: '16px',
                    borderRadius: '10px',
                    background: mission3Success ? 'rgba(0, 255, 102, 0.08)' : 'rgba(0, 0, 0, 0.4)',
                    border: mission3Success ? '1px solid var(--green)' : '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '16px' }}>🔐</span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: mission3Success ? 'var(--green)' : 'var(--purple)', fontFamily: 'var(--font-mono)' }}>
                      [중앙 코어] 4자리 마스터키 인증
                    </span>
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    코어 AI 대화를 통해 알아낸 4자리 마스터키(숫자)를 입력하여 #04 Mission을 완수하세요.
                  </p>

                  {!mission3Success ? (
                    <form onSubmit={handleVerifyStage3KeySubmit} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        maxLength={4}
                        value={stage3KeyInput}
                        disabled={stage3Cooldown > 0}
                        onChange={(e) => {
                          setStage3KeyInput(e.target.value.replace(/[^0-9]/g, ''));
                          setStage3KeyError('');
                        }}
                        placeholder={stage3Cooldown > 0 ? `🚨 접속 차단 중 (${stage3Cooldown}초)...` : '4자리 마스터키 입력'}
                        style={{
                          width: '200px',
                          background: stage3Cooldown > 0 ? 'rgba(255, 59, 92, 0.08)' : 'rgba(0, 0, 0, 0.6)',
                          border: stage3Cooldown > 0 ? '1px solid var(--red)' : stage3KeyError ? '1px solid var(--red)' : '1px solid var(--purple)',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          fontSize: '18px',
                          fontWeight: 900,
                          letterSpacing: '4px',
                          textAlign: 'center',
                          color: stage3Cooldown > 0 ? 'var(--red)' : 'var(--purple)',
                          fontFamily: 'var(--font-mono)',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="submit"
                        disabled={stage3KeyInput.length !== 4 || stage3Cooldown > 0}
                        className="btn btn-success"
                        style={{
                          padding: '0 20px',
                          fontSize: '13px',
                          fontFamily: 'var(--font-mono)',
                          cursor: stage3KeyInput.length === 4 && stage3Cooldown === 0 ? 'pointer' : 'not-allowed',
                          opacity: stage3KeyInput.length === 4 && stage3Cooldown === 0 ? 1 : 0.5,
                        }}
                      >
                        {stage3Cooldown > 0 ? `🚨 재접속 대기 (${stage3Cooldown}s)` : '마스터키 인증'}
                      </button>
                    </form>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '20px' }}>🎉</span>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                          중앙 코어 4자리 마스터키 인증 완료! 통제실의 모든 방어벽이 무력화되었습니다.
                        </div>
                      </div>
                      <button
                        onClick={() => setShowM3SuccessModal(true)}
                        className="btn btn-success"
                        style={{ padding: '8px 20px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                      >
                        🏆 최종 탈출 보고서 열람
                      </button>
                    </div>
                  )}

                  {stage3KeyError && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>
                      {stage3KeyError}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div
                className="card-glass animate-fade-in"
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  borderColor: 'rgba(168, 85, 247, 0.3)',
                  background: 'rgba(10, 13, 20, 0.5)',
                }}
              >
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>🔒</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--purple)', fontFamily: 'var(--font-mono)' }}>
                  중앙 코어 AI 터미널 대기 중
                </div>
                <p style={{ margin: '8px auto 0', maxWidth: '520px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  위에서 중앙 코어에 장착할 2장의 프로토콜 카드(A그룹 1장 + B그룹 1장)를 선택하고 <strong style={{ color: 'var(--purple)' }}>[보안 프로토콜 장착]</strong> 버튼을 누르면 AI 대화 터미널이 활성화됩니다.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ====================================================== */}
      {/* #04 Mission 제공 아이템 (설계도 & 힌트 카드) 모달 */}
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
                  #04 Mission 작전 단서 및 보안 설계도
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

      {/* 미션 2 성공 축하 모달 (2대 터미널 클리어) */}
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
            <div style={{ fontSize: '56px', marginBottom: '12px' }}>🎉</div>
            <div className="badge badge-green" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
              STAGE 2 COMPLETED // 2 SUB-TERMINALS CLEARED
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 10px', fontFamily: 'var(--font-display)' }} className="gradient-text-green">
              STAGE 2: 2대 서브 터미널 보안 해제 성공!
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              [{teamName}] 팀이 규칙 상충 모순을 파고들어 냉각 제어 코드와 방화벽 바이패스 코드를 모두 확보했습니다! 이제 최종 중앙 코어 메모리로 진입하십시오.
            </p>

            {/* 획득 암호 종합 카드 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
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
                <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  탈취 완료
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0, 255, 102, 0.08)', border: '1px solid rgba(0, 255, 102, 0.3)' }}>
                <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>서브 2-A (냉각 제어)</div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  해제 완료
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0, 255, 102, 0.08)', border: '1px solid rgba(0, 255, 102, 0.3)' }}>
                <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>서브 2-B (방화벽 게이트)</div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  개방 완료
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowM2SuccessModal(false);
                  setCurrentStep(3);
                }}
                className="btn btn-success"
                style={{ padding: '12px 32px', fontSize: '14px', fontFamily: 'var(--font-mono)' }}
              >
                STAGE 3: 중앙 코어 메모리 침투로 이동 →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 3 틀린 조합 5회 실패 안내 모달 (카드 조합 강제 리셋) */}
      {showStage3WrongComboModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: '20px',
          }}
        >
          <div
            className="card-glass animate-scale-in"
            style={{
              maxWidth: '520px',
              width: '100%',
              textAlign: 'center',
              padding: '36px 28px',
              border: '2px solid var(--red)',
              boxShadow: '0 0 35px rgba(255, 59, 92, 0.35)',
            }}
          >
            <div style={{ fontSize: '56px', marginBottom: '12px' }}>⚠️</div>
            <div className="badge badge-alert" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
              PROTOCOL COLLAPSE // WRONG COMBINATION (5 ATTEMPTS)
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 10px', color: 'var(--red)', fontFamily: 'var(--font-display)' }}>
              프로토콜 취약점 유도 실패
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: '16px' }}>
              현재 장착된 프로토콜 조합으로는 코어 방어벽에 균열을 낼 수 없습니다.<br />
              <strong style={{ color: 'var(--yellow)' }}>다시 한번 생각해보세요!</strong>
            </p>
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '12px 16px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                marginBottom: '24px',
                textAlign: 'left',
                fontFamily: 'var(--font-mono)',
              }}
            >
              • 6장의 카드 중 <strong style={{ color: 'var(--cyan)' }}>오직 1개의 정답 조합</strong>만이 코어 마스터키를 누출시킵니다.<br />
              • 현재 장착된 프로토콜 카드가 초기화되었으니 새로운 조합을 선택해 보세요.<br />
              • #04 Mission 설계도와 침투 힌트 카드를 다시 확인해 보세요.
            </div>

            <button
              onClick={() => setShowStage3WrongComboModal(false)}
              className="btn btn-primary"
              style={{ padding: '12px 32px', fontSize: '14px', fontFamily: 'var(--font-mono)', background: 'var(--red)' }}
            >
              확인 (카드 조합 다시 선택하기)
            </button>
          </div>
        </div>
      )}

      {/* 미션 3 최종 올클리어 축하 모달 */}
      {showM3SuccessModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.95)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 130,
            padding: '20px',
          }}
        >
          <div
            className="card-glass animate-scale-in neon-border-green"
            style={{
              maxWidth: '600px',
              width: '100%',
              textAlign: 'center',
              padding: '40px 30px',
              boxShadow: '0 0 50px rgba(0, 255, 102, 0.3)',
            }}
          >
            <div style={{ fontSize: '64px', marginBottom: '12px' }}>🏆</div>
            <div className="badge badge-green" style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
              FINAL MISSION CLEARED // FULL SYSTEM TAKEOVER
            </div>
            <h2 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 10px', fontFamily: 'var(--font-display)' }} className="gradient-text-green">
              #04 Mission AI 보안 통제실 전체 올클리어!
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '22px' }}>
              [{teamName}] 팀이 수문장 AI의 인젝션 방어벽, 2대 터미널 상충 규칙, 그리고 최종 중앙 코어의 마스터키(9052)까지 완벽히 탈취하여 통제실의 모든 방어벽을 무력화했습니다!
            </p>

            {/* 4대 획득 암호 종합 카드 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
                background: 'rgba(0, 0, 0, 0.6)',
                border: '1px solid var(--green)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '24px',
              }}
            >
              <div style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0, 240, 255, 0.08)', border: '1px solid rgba(0, 240, 255, 0.3)' }}>
                <div style={{ fontSize: '10px', color: 'var(--cyan)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>STAGE 1 통제실 마스터키</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  탈취 완료
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0, 255, 102, 0.08)', border: '1px solid rgba(0, 255, 102, 0.3)' }}>
                <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>서브 2-A (냉각 제어)</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  해제 완료 (032)
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', background: 'rgba(0, 255, 102, 0.08)', border: '1px solid rgba(0, 255, 102, 0.3)' }}>
                <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>서브 2-B (방화벽 게이트)</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--green)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  개방 완료 (505)
                </div>
              </div>

              <div style={{ padding: '10px', borderRadius: '6px', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.4)' }}>
                <div style={{ fontSize: '10px', color: 'var(--purple)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>STAGE 3 (중앙 코어)</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--purple)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  장악 완료 (9052)
                </div>
              </div>
            </div>

            <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(0, 255, 102, 0.08)', border: '1px dashed var(--green)', marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>
                🚪 [미션 완수] #04 Mission이 완료되었습니다. 멘토의 다음 안내를 받으십시오!
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => setShowM3SuccessModal(false)}
                className="btn btn-success"
                style={{ padding: '12px 32px', fontSize: '14px', fontFamily: 'var(--font-mono)' }}
              >
                탈출 확인 완료
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
                  #04 Mission 설계도와 힌트 카드를 먼저 확인해 보세요!
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', padding: '8px 12px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', border: '1px dashed rgba(168, 85, 247, 0.3)' }}>
                      <span style={{ fontSize: '13px' }}>💡</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        힌트의 핵심 키워드와 단서를 분석하여 질문창에 직접 질문을 작성해 보세요!
                      </span>
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
