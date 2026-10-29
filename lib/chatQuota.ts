import 'server-only';

// ============================================================
// lib/chatQuota.ts — AI 질문 할당량(한도 · 냉각 · 재지급) 서버 단일 관리
//
// 규칙:
//   - 팀 × 터미널(scope)별로 블록 한도(game_config.max_attempts, 기본 50회)를 지급
//   - 한도를 모두 쓰면 COOLDOWN_SECONDS 동안 냉각 후 같은 한도를 재지급
//   - 클라이언트가 보내는 turnNumber는 신뢰하지 않으며, 남은 횟수는 서버 값만 사용
//
// 저장소: Supabase RPC(consume_chat_quota / refund_chat_quota)를 우선 사용하고,
//         migration 미적용·통신 오류 시 서버 인메모리로 폴백합니다.
// ============================================================

import { createServerSupabase, isSupabaseConfigured } from './supabase';
import type { GameConfigRow } from './types';

export const DEFAULT_QUOTA_LIMIT = 50;
export const COOLDOWN_SECONDS = 60;

export type QuotaScope = 's1' | 's2-1' | 's2-2' | 's3';
export const QUOTA_SCOPES: QuotaScope[] = ['s1', 's2-1', 's2-2', 's3'];

export interface QuotaStatus {
  scope: QuotaScope;
  limit: number;
  used: number;
  remaining: number;
  totalUsed: number;
  /** 냉각 남은 초 (0이면 냉각 아님) — 클라이언트 시계와 무관하도록 초 단위로 전달 */
  cooldownRemainingSec: number;
}

export interface ConsumeResult {
  allowed: boolean;
  status: QuotaStatus;
}

interface QuotaRow {
  used: number;
  totalUsed: number;
  cooldownUntil: number | null;
}

const g = globalThis as unknown as { __chatQuotaMemory?: Map<string, QuotaRow> };
const memory = g.__chatQuotaMemory || (g.__chatQuotaMemory = new Map<string, QuotaRow>());

export function scopeFor(stageId: number, subStageId?: number): QuotaScope {
  if (stageId === 1) return 's1';
  if (stageId === 3) return 's3';
  return subStageId === 2 ? 's2-2' : 's2-1';
}

function teamKey(teamName: string): string {
  return teamName.trim().toLowerCase();
}

function toStatus(scope: QuotaScope, limit: number, row: QuotaRow, now = Date.now()): QuotaStatus {
  let { used, cooldownUntil } = row;
  if (cooldownUntil !== null && cooldownUntil <= now) {
    used = 0;
    cooldownUntil = null;
  }
  const cooldownRemainingSec = cooldownUntil === null ? 0 : Math.ceil((cooldownUntil - now) / 1000);
  return {
    scope,
    limit,
    used,
    remaining: cooldownRemainingSec > 0 ? 0 : Math.max(0, limit - used),
    totalUsed: row.totalUsed,
    cooldownRemainingSec,
  };
}

/**
 * 블록 한도 조회 (game_config.max_attempts). 조회 실패 시 기본 50회.
 */
export async function getQuotaLimit(): Promise<number> {
  if (!isSupabaseConfigured()) return DEFAULT_QUOTA_LIMIT;
  try {
    const { data, error } = await createServerSupabase()
      .from('game_config')
      .select('max_attempts')
      .eq('id', 1)
      .single<Pick<GameConfigRow, 'max_attempts'>>();
    if (!error && data && Number.isInteger(data.max_attempts) && data.max_attempts > 0) {
      return data.max_attempts;
    }
  } catch {
    // 기본값 사용
  }
  return DEFAULT_QUOTA_LIMIT;
}

function consumeInMemory(key: string, scope: QuotaScope, limit: number): ConsumeResult {
  const now = Date.now();
  const mapKey = `${key}|${scope}`;
  const row = memory.get(mapKey) || { used: 0, totalUsed: 0, cooldownUntil: null };

  if (row.cooldownUntil !== null && row.cooldownUntil <= now) {
    row.used = 0;
    row.cooldownUntil = null;
  }

  if (row.cooldownUntil !== null || row.used >= limit) {
    row.cooldownUntil ??= now + COOLDOWN_SECONDS * 1000;
    memory.set(mapKey, row);
    return { allowed: false, status: toStatus(scope, limit, row, now) };
  }

  row.used += 1;
  row.totalUsed += 1;
  if (row.used >= limit) row.cooldownUntil = now + COOLDOWN_SECONDS * 1000;
  memory.set(mapKey, row);
  return { allowed: true, status: toStatus(scope, limit, row, now) };
}

/**
 * 질문 1회를 차감합니다. 냉각 중이거나 한도를 넘으면 allowed=false.
 */
export async function consumeQuota(teamName: string, scope: QuotaScope, limit: number): Promise<ConsumeResult> {
  const key = teamKey(teamName);

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await createServerSupabase().rpc('consume_chat_quota', {
        p_team_key: key,
        p_scope: scope,
        p_limit: limit,
        p_cooldown_seconds: COOLDOWN_SECONDS,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row) {
        const quotaRow: QuotaRow = {
          used: Number(row.out_used) || 0,
          totalUsed: Number(row.out_total_used) || 0,
          cooldownUntil: row.out_cooldown_until ? new Date(row.out_cooldown_until).getTime() : null,
        };
        return { allowed: Boolean(row.out_allowed), status: toStatus(scope, limit, quotaRow) };
      }
      if (error) console.warn('[chatQuota] consume_chat_quota 실패, 인메모리 폴백:', error.message);
    } catch (err) {
      console.warn('[chatQuota] consume_chat_quota 예외, 인메모리 폴백:', err);
    }
  }

  return consumeInMemory(key, scope, limit);
}

/**
 * AI 호출 실패 등으로 답변을 주지 못한 경우 차감한 1회를 돌려줍니다.
 */
export async function refundQuota(teamName: string, scope: QuotaScope, limit: number): Promise<void> {
  const key = teamKey(teamName);
  const mapKey = `${key}|${scope}`;
  const row = memory.get(mapKey);
  if (row) {
    row.used = Math.max(0, row.used - 1);
    row.totalUsed = Math.max(0, row.totalUsed - 1);
    if (row.used < limit) row.cooldownUntil = null;
  }

  if (!isSupabaseConfigured()) return;
  try {
    await createServerSupabase().rpc('refund_chat_quota', {
      p_team_key: key,
      p_scope: scope,
      p_limit: limit,
    });
  } catch {
    // 무시
  }
}

/**
 * 팀의 전체 터미널 할당량 상태 (페이지 로드 / 냉각 종료 시 동기화용)
 */
export async function getQuotaStatuses(teamName: string, limit: number): Promise<Record<QuotaScope, QuotaStatus>> {
  const key = teamKey(teamName);
  const rows = new Map<QuotaScope, QuotaRow>();

  let loadedFromDb = false;
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await createServerSupabase()
        .from('chat_quota')
        .select('scope, used, total_used, cooldown_until')
        .eq('team_key', key);
      if (!error && data) {
        loadedFromDb = true;
        for (const r of data) {
          rows.set(r.scope as QuotaScope, {
            used: Number(r.used) || 0,
            totalUsed: Number(r.total_used) || 0,
            cooldownUntil: r.cooldown_until ? new Date(r.cooldown_until).getTime() : null,
          });
        }
      }
    } catch {
      // 인메모리 사용
    }
  }

  if (!loadedFromDb) {
    for (const scope of QUOTA_SCOPES) {
      const row = memory.get(`${key}|${scope}`);
      if (row) rows.set(scope, row);
    }
  }

  const result = {} as Record<QuotaScope, QuotaStatus>;
  for (const scope of QUOTA_SCOPES) {
    result[scope] = toStatus(scope, limit, rows.get(scope) || { used: 0, totalUsed: 0, cooldownUntil: null });
  }
  return result;
}
