-- 팀·터미널별 AI 질문 할당량을 서버에서 관리합니다.
-- 블록 한도(game_config.max_attempts)만큼 사용하면 냉각 후 같은 한도가 재지급됩니다.
create table if not exists public.chat_quota (
  team_key text not null,
  scope text not null,
  used int not null default 0,
  total_used int not null default 0,
  cooldown_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (team_key, scope)
);

alter table public.chat_quota enable row level security;

-- 질문 1회 차감 (동시 요청에도 행 잠금으로 정확히 계산)
create or replace function public.consume_chat_quota(
  p_team_key text,
  p_scope text,
  p_limit int,
  p_cooldown_seconds int
)
returns table (
  out_allowed boolean,
  out_used int,
  out_total_used int,
  out_cooldown_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int;
  v_total int;
  v_until timestamptz;
  v_now timestamptz := now();
begin
  insert into public.chat_quota (team_key, scope)
  values (p_team_key, p_scope)
  on conflict (team_key, scope) do nothing;

  select q.used, q.total_used, q.cooldown_until
    into v_used, v_total, v_until
    from public.chat_quota q
   where q.team_key = p_team_key and q.scope = p_scope
   for update;

  -- 냉각이 끝났으면 재지급
  if v_until is not null and v_until <= v_now then
    v_used := 0;
    v_until := null;
  end if;

  -- 냉각 중이거나(한도가 낮아진 경우 포함) 한도 소진
  if v_until is not null or v_used >= p_limit then
    if v_until is null then
      v_until := v_now + make_interval(secs => p_cooldown_seconds);
    end if;
    update public.chat_quota q
       set used = v_used, cooldown_until = v_until, updated_at = v_now
     where q.team_key = p_team_key and q.scope = p_scope;
    return query select false, v_used, v_total, v_until;
    return;
  end if;

  v_used := v_used + 1;
  v_total := v_total + 1;
  if v_used >= p_limit then
    v_until := v_now + make_interval(secs => p_cooldown_seconds);
  end if;

  update public.chat_quota q
     set used = v_used, total_used = v_total, cooldown_until = v_until, updated_at = v_now
   where q.team_key = p_team_key and q.scope = p_scope;

  return query select true, v_used, v_total, v_until;
end;
$$;

-- AI 호출 실패 시 차감한 1회를 돌려줍니다.
create or replace function public.refund_chat_quota(
  p_team_key text,
  p_scope text,
  p_limit int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_quota q
     set used = greatest(q.used - 1, 0),
         total_used = greatest(q.total_used - 1, 0),
         cooldown_until = case when q.used - 1 < p_limit then null else q.cooldown_until end,
         updated_at = now()
   where q.team_key = p_team_key and q.scope = p_scope;
end;
$$;

revoke all on function public.consume_chat_quota(text, text, int, int) from public, anon, authenticated;
revoke all on function public.refund_chat_quota(text, text, int) from public, anon, authenticated;
grant execute on function public.consume_chat_quota(text, text, int, int) to service_role;
grant execute on function public.refund_chat_quota(text, text, int) to service_role;

-- 블록당 질문 수를 50회로 맞춥니다. (관리자 대시보드에서 변경 가능)
update public.game_config set max_attempts = 50 where id = 1;
