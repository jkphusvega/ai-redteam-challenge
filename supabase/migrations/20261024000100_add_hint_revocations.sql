-- 이미 첫 번째 migration을 적용한 환경에 힌트 회수 상태를 추가합니다.
alter table public.mentor_sent_hints
  add column if not exists revoked_at timestamptz;
