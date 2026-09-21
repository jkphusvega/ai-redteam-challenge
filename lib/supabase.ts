// ============================================================
// lib/supabase.ts — Supabase 클라이언트 초기화
//
// Next.js App Router 환경에서 서버/클라이언트를 분리합니다.
//   - createServerSupabase(): API Route, Server Component용
//   - createBrowserSupabase(): Client Component용 (Realtime 포함)
//   - isSupabaseConfigured(): 환경 변수 주입 여부 확인
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ----------------------------------------------------------
// 환경 변수 확인 및 안전한 폴백
// ----------------------------------------------------------

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const rawServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 환경변수 부재 시 클라이언트 생성이 실패하지 않도록 더미 URL/키 제공
const fallbackUrl = 'https://placeholder-project.supabase.co';
const fallbackKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder';

export const supabaseUrl = rawUrl || fallbackUrl;
export const supabaseAnonKey = rawAnonKey || fallbackKey;
export const supabaseServiceKey = rawServiceKey || fallbackKey;

/**
 * Supabase 환경 변수가 실제 값으로 온전히 설정되어 있는지 확인합니다.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    rawUrl &&
    rawUrl !== fallbackUrl &&
    (rawAnonKey || rawServiceKey)
  );
}

// ----------------------------------------------------------
// 서버 클라이언트 (API Route용 — service role key 사용)
// ----------------------------------------------------------

/**
 * 서버 사이드 전용 Supabase 클라이언트를 생성합니다.
 */
export function createServerSupabase(): SupabaseClient {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// ----------------------------------------------------------
// 브라우저 클라이언트 (Client Component + Realtime용)
// ----------------------------------------------------------

let browserClient: SupabaseClient | null = null;

/**
 * 브라우저 사이드 Supabase 클라이언트를 반환합니다.
 */
export function createBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return browserClient;
}
