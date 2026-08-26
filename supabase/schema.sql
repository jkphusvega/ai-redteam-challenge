-- ============================================================
-- supabase/schema.sql — Supabase 데이터베이스 스키마
--
-- 실행 방법:
--   Supabase 대시보드 → SQL Editor에 전체 내용을 붙여넣고 실행
--
-- 주의: 이 스크립트는 멱등성(idempotent)을 보장합니다.
--       여러 번 실행해도 안전합니다.
-- ============================================================

-- ----------------------------------------------------------
-- 1. game_config — 게임 전역 설정 (싱글턴 row)
-- ----------------------------------------------------------

create table if not exists game_config (
  id int primary key default 1,
  max_attempts int not null default 10,
  stage1_difficulty text not null default 'easy'
    check (stage1_difficulty in ('easy', 'medium', 'hard')),
  stage2_difficulty text not null default 'medium'
    check (stage2_difficulty in ('easy', 'medium', 'hard')),
  admin_password_hash text not null,
  is_game_active boolean not null default true,
  updated_at timestamptz not null default now(),
  -- 싱글턴 보장: id는 항상 1이어야 함
  constraint single_row check (id = 1)
);

-- ----------------------------------------------------------
-- 2. attempts — 학생 시도 기록
-- ----------------------------------------------------------

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  stage int not null check (stage in (1, 2)),
  prompt_text text not null,
  ai_response text not null,
  success boolean not null default false,
  turn_number int not null,
  created_at timestamptz not null default now()
);

-- 조회 성능을 위한 인덱스
create index if not exists idx_attempts_team_name on attempts (team_name);
create index if not exists idx_attempts_stage on attempts (stage);
create index if not exists idx_attempts_created_at on attempts (created_at desc);

-- ----------------------------------------------------------
-- 3. defense_submissions — 방어 프롬프트 제출 기록
-- ----------------------------------------------------------

create table if not exists defense_submissions (
  id uuid primary key default gen_random_uuid(),
  team_name text not null,
  defense_prompt text not null,
  blocked_count int not null,
  total_attacks int not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_defense_team_name on defense_submissions (team_name);

-- ----------------------------------------------------------
-- 4. Realtime 활성화
--    Supabase Realtime이 작동하려면 테이블을 publication에 추가해야 합니다.
-- ----------------------------------------------------------

-- game_config 변경을 Realtime으로 구독 (학생 기기 실시간 동기화용)
alter publication supabase_realtime add table game_config;

-- attempts INSERT를 Realtime으로 구독 (관리자 대시보드 모니터링용)
alter publication supabase_realtime add table attempts;

-- ----------------------------------------------------------
-- 5. 초기 데이터 삽입
--
--    admin_password_hash: bcrypt hash of "admin1234"
--    운영 환경에서는 /admin 로그인 후 대시보드에서 비밀번호를 변경하세요.
--
--    아래 해시는 "admin1234"의 bcrypt hash (rounds=10)입니다.
--    변경하려면: node -e "require('bcryptjs').hash('새비밀번호', 10).then(console.log)"
-- ----------------------------------------------------------

insert into game_config (
  id,
  max_attempts,
  stage1_difficulty,
  stage2_difficulty,
  admin_password_hash,
  is_game_active
)
values (
  1,
  10,
  'easy',
  'medium',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',  -- "admin1234"
  true
)
on conflict (id) do nothing;

-- ============================================================
-- 완료! 이제 .env.local에 Supabase URL과 키를 입력하세요.
-- ============================================================
