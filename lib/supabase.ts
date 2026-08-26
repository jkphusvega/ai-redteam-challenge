// ============================================================
// lib/supabase.ts — Supabase 클라이언트 초기화
//
// Next.js App Router 환경에서 서버/클라이언트를 분리합니다.
//   - createServerClient(): API Route, Server Component용
//   - createBrowserClient(): Client Component용 (Realtime 포함)
// ============================================================

import { createClient } from '@supabase/supabase-js';

// ----------------------------------------------------------
// 환경 변수 검증
// ----------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`환경 변수 ${name}이 설정되지 않았습니다. .env.local을 확인하세요.`);
  }
  return value;
}

// ----------------------------------------------------------
// 서버 클라이언트 (API Route용 — service role key 사용)
// ----------------------------------------------------------

/**
 * 서버 사이드 전용 Supabase 클라이언트를 생성합니다.
 * API Route에서만 사용하세요. service role key로 RLS를 우회합니다.
 */
export function createServerSupabase() {
  return createClient(
    assertEnv(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL'),
    assertEnv(supabaseServiceKey, 'SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// ----------------------------------------------------------
// 브라우저 클라이언트 (Client Component + Realtime용)
// ----------------------------------------------------------

/**
 * 브라우저 사이드 Supabase 클라이언트를 반환합니다.
 * Realtime 구독 및 클라이언트 컴포넌트에서 사용하세요.
 * 싱글턴 패턴으로 인스턴스를 재사용합니다.
 */
let browserClient: ReturnType<typeof createClient> | null = null;

export function createBrowserSupabase() {
  if (browserClient) return browserClient;

  browserClient = createClient(
    assertEnv(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL'),
    assertEnv(supabaseAnonKey, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  );

  return browserClient;
}
