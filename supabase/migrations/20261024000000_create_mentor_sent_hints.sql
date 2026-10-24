-- 멘토가 전송한 팀별 힌트를 서버 인스턴스와 무관하게 유지합니다.
create table if not exists public.mentor_sent_hints (
  id text primary key,
  team_name text not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists idx_mentor_sent_hints_team_name
  on public.mentor_sent_hints (team_name);
create index if not exists idx_mentor_sent_hints_created_at
  on public.mentor_sent_hints (created_at desc);

alter table public.mentor_sent_hints enable row level security;
