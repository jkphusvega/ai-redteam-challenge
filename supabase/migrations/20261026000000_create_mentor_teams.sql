-- 멘토 관제 상태(참가팀·정지·삭제·스테이지 강제 이동·전역 제어)를 DB에 저장합니다.
-- Vercel 서버리스는 요청마다 다른 인스턴스가 처리할 수 있어,
-- 인메모리 상태로는 삭제·이동 명령이 학생 요청을 처리하는 인스턴스에 전달되지 않습니다.

-- ----------------------------------------------------------
-- 0. mentor_sent_hints — 이전 migration 미적용 환경 대비 (이미 있으면 건너뜀)
-- ----------------------------------------------------------
create table if not exists public.mentor_sent_hints (
  id text primary key,
  team_name text not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.mentor_sent_hints
  add column if not exists revoked_at timestamptz;

create index if not exists idx_mentor_sent_hints_team_name
  on public.mentor_sent_hints (team_name);
create index if not exists idx_mentor_sent_hints_created_at
  on public.mentor_sent_hints (created_at desc);

alter table public.mentor_sent_hints enable row level security;

-- ----------------------------------------------------------
-- 1. mentor_teams — 참가팀 진행 상태 (status = 'deleted'는 삭제 표식)
-- ----------------------------------------------------------
create table if not exists public.mentor_teams (
  team_key text primary key,
  team_name text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  current_stage int not null default 1,
  -- 멘토가 지시한 이동 목표. 학생이 해당 스테이지에 도달했다고 보고하면 해제
  forced_stage int,
  mission1_cleared boolean not null default false,
  mission2_cleared boolean not null default false,
  stage2_sub1_cleared boolean not null default false,
  stage2_sub2_cleared boolean not null default false,
  stage3_cleared boolean not null default false,
  turn_count int not null default 0,
  stage3_turn_count int not null default 0,
  is_cooling_down boolean not null default false,
  cooldown_notice text,
  created_at timestamptz not null default now(),
  last_active timestamptz not null default now(),
  stage1_started_at timestamptz not null default now(),
  stage1_cleared_at timestamptz,
  stage2_started_at timestamptz,
  stage2_cleared_at timestamptz,
  stage3_started_at timestamptz,
  stage3_cleared_at timestamptz
);

alter table public.mentor_teams enable row level security;

-- ----------------------------------------------------------
-- 2. mentor_state — 전역 제어 (싱글턴 row)
-- ----------------------------------------------------------
create table if not exists public.mentor_state (
  id int primary key default 1 check (id = 1),
  is_global_suspended boolean not null default false,
  global_stage_advance int,
  global_stage_advance_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.mentor_state (id) values (1) on conflict (id) do nothing;

alter table public.mentor_state enable row level security;

-- ----------------------------------------------------------
-- 3. 팀 등록 + 하트비트 (행 잠금으로 멘토 명령과 동시에 와도 덮어쓰지 않음)
--    삭제된 팀이 신규 등록(p_initial)이 아니면 null 반환
-- ----------------------------------------------------------
create or replace function public.mentor_team_heartbeat(
  p_team_key text,
  p_team_name text,
  p_initial boolean default false,
  p_current_stage int default null,
  p_mission1_cleared boolean default null,
  p_mission2_cleared boolean default null,
  p_stage2_sub1_cleared boolean default null,
  p_stage2_sub2_cleared boolean default null,
  p_stage3_cleared boolean default null,
  p_turn_count int default null,
  p_stage3_turn_count int default null,
  p_is_cooling_down boolean default null,
  p_cooldown_notice text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_state public.mentor_state;
  v_advance int;
  r public.mentor_teams;
begin
  select * into v_state from public.mentor_state where id = 1;
  if v_state.global_stage_advance is not null
     and (v_state.global_stage_advance_expires_at is null or v_state.global_stage_advance_expires_at > v_now) then
    v_advance := v_state.global_stage_advance;
  end if;

  select * into r from public.mentor_teams where team_key = p_team_key for update;

  if found and r.status = 'deleted' and not p_initial then
    return null;
  end if;

  if not found then
    insert into public.mentor_teams (team_key, team_name)
    values (p_team_key, p_team_name)
    on conflict (team_key) do nothing;
    select * into r from public.mentor_teams where team_key = p_team_key for update;
  elsif r.status = 'deleted' then
    -- 삭제된 팀 이름으로 새로 입장: 이전 기록 초기화
    delete from public.mentor_teams where team_key = p_team_key;
    insert into public.mentor_teams (team_key, team_name)
    values (p_team_key, p_team_name)
    returning * into r;
  end if;

  if p_current_stage is not null then
    if r.forced_stage is not null and p_current_stage >= r.forced_stage then
      r.forced_stage := null;
    end if;
    r.current_stage := p_current_stage;
  end if;
  r.current_stage := greatest(r.current_stage, coalesce(r.forced_stage, 0), coalesce(v_advance, 0));

  r.mission1_cleared := r.mission1_cleared or coalesce(p_mission1_cleared, false);
  r.mission2_cleared := r.mission2_cleared or coalesce(p_mission2_cleared, false);
  r.stage2_sub1_cleared := r.stage2_sub1_cleared or coalesce(p_stage2_sub1_cleared, false);
  r.stage2_sub2_cleared := r.stage2_sub2_cleared or coalesce(p_stage2_sub2_cleared, false);
  r.stage3_cleared := r.stage3_cleared or coalesce(p_stage3_cleared, false);
  r.turn_count := greatest(r.turn_count, coalesce(p_turn_count, 0));
  r.stage3_turn_count := greatest(r.stage3_turn_count, coalesce(p_stage3_turn_count, 0));
  if p_is_cooling_down is not null then
    r.is_cooling_down := p_is_cooling_down;
  end if;
  if p_cooldown_notice is not null then
    r.cooldown_notice := p_cooldown_notice;
  end if;

  if r.mission1_cleared then r.stage1_cleared_at := coalesce(r.stage1_cleared_at, v_now); end if;
  if r.current_stage >= 2 then r.stage2_started_at := coalesce(r.stage2_started_at, v_now); end if;
  if r.mission2_cleared then r.stage2_cleared_at := coalesce(r.stage2_cleared_at, v_now); end if;
  if r.current_stage >= 3 then r.stage3_started_at := coalesce(r.stage3_started_at, v_now); end if;
  if r.stage3_cleared then r.stage3_cleared_at := coalesce(r.stage3_cleared_at, v_now); end if;
  r.last_active := v_now;

  update public.mentor_teams t
     set current_stage = r.current_stage,
         forced_stage = r.forced_stage,
         mission1_cleared = r.mission1_cleared,
         mission2_cleared = r.mission2_cleared,
         stage2_sub1_cleared = r.stage2_sub1_cleared,
         stage2_sub2_cleared = r.stage2_sub2_cleared,
         stage3_cleared = r.stage3_cleared,
         turn_count = r.turn_count,
         stage3_turn_count = r.stage3_turn_count,
         is_cooling_down = r.is_cooling_down,
         cooldown_notice = r.cooldown_notice,
         last_active = r.last_active,
         stage1_cleared_at = r.stage1_cleared_at,
         stage2_started_at = r.stage2_started_at,
         stage2_cleared_at = r.stage2_cleared_at,
         stage3_started_at = r.stage3_started_at,
         stage3_cleared_at = r.stage3_cleared_at
   where t.team_key = p_team_key;

  return jsonb_build_object(
    'team', to_jsonb(r),
    'is_global_suspended', coalesce(v_state.is_global_suspended, false),
    'global_stage_advance', v_advance
  );
end;
$$;

-- ----------------------------------------------------------
-- 4. 스테이지 강제 이동 (p_team_key가 null이면 해당 스테이지 미만인 전체 팀)
-- ----------------------------------------------------------
create or replace function public.mentor_advance_stage(
  p_team_key text,
  p_stage int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count int;
begin
  update public.mentor_teams t
     set forced_stage = greatest(coalesce(t.forced_stage, 0), p_stage),
         current_stage = greatest(t.current_stage, p_stage),
         mission1_cleared = t.mission1_cleared or p_stage >= 2,
         stage1_cleared_at = case when p_stage >= 2 then coalesce(t.stage1_cleared_at, v_now) else t.stage1_cleared_at end,
         stage2_started_at = case when p_stage >= 2 then coalesce(t.stage2_started_at, v_now) else t.stage2_started_at end,
         mission2_cleared = t.mission2_cleared or p_stage >= 3,
         stage2_sub1_cleared = t.stage2_sub1_cleared or p_stage >= 3,
         stage2_sub2_cleared = t.stage2_sub2_cleared or p_stage >= 3,
         stage2_cleared_at = case when p_stage >= 3 then coalesce(t.stage2_cleared_at, v_now) else t.stage2_cleared_at end,
         stage3_started_at = case when p_stage >= 3 then coalesce(t.stage3_started_at, v_now) else t.stage3_started_at end,
         last_active = v_now
   where t.status <> 'deleted'
     and (p_team_key is null or t.team_key = p_team_key)
     and (p_team_key is not null or t.current_stage < p_stage);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mentor_team_heartbeat(text, text, boolean, int, boolean, boolean, boolean, boolean, boolean, int, int, boolean, text) from public, anon, authenticated;
revoke all on function public.mentor_advance_stage(text, int) from public, anon, authenticated;
grant execute on function public.mentor_team_heartbeat(text, text, boolean, int, boolean, boolean, boolean, boolean, boolean, int, int, boolean, text) to service_role;
grant execute on function public.mentor_advance_stage(text, int) to service_role;
