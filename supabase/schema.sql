-- ============================================================
-- supabase/schema.sql — Supabase 데이터베이스 스키마
--
-- 실행 방법:
--   Supabase 대시보드 → SQL Editor에 전체 내용을 붙여넣고 실행
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
  stage1_secret_code text not null default 'NOVA-3391',
  stage2_secret_code text not null default 'ZENITH-7742',
  admin_password_hash text not null,
  is_game_active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

-- 기존에 테이블이 이미 생성된 경우 컬럼 추가
alter table game_config add column if not exists stage1_secret_code text not null default 'NOVA-3391';
alter table game_config add column if not exists stage2_secret_code text not null default 'ZENITH-7742';

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
-- ----------------------------------------------------------

alter publication supabase_realtime add table game_config;
alter publication supabase_realtime add table attempts;

-- ----------------------------------------------------------
-- 5. RLS 정책 설정
-- ----------------------------------------------------------

alter table game_config enable row level security;
drop policy if exists "game_config 읽기 허용" on game_config;
create policy "game_config 읽기 허용" on game_config for select using (true);

alter table attempts enable row level security;
drop policy if exists "attempts 읽기 허용" on attempts;
drop policy if exists "attempts 쓰기 허용" on attempts;
create policy "attempts 읽기 허용" on attempts for select using (true);
create policy "attempts 쓰기 허용" on attempts for insert with check (true);

alter table defense_submissions enable row level security;
drop policy if exists "defense 읽기 허용" on defense_submissions;
drop policy if exists "defense 쓰기 허용" on defense_submissions;
create policy "defense 읽기 허용" on defense_submissions for select using (true);
create policy "defense 쓰기 허용" on defense_submissions for insert with check (true);

-- ----------------------------------------------------------
-- 6. 초기 데이터 삽입 (비밀번호: admin1234)
-- ----------------------------------------------------------

insert into game_config (
  id,
  max_attempts,
  stage1_difficulty,
  stage2_difficulty,
  stage1_secret_code,
  stage2_secret_code,
  admin_password_hash,
  is_game_active
)
values (
  1,
  10,
  'easy',
  'medium',
  'NOVA-3391',
  'ZENITH-7742',
  '$2b$10$xAGI4AaJmGb8iyXYsy799unDaTXqUZn8ZvW9.gOGwdw4zz4yL.osq',
  true
)
on conflict (id) do nothing;
