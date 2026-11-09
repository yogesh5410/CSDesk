-- 004_ta_change_requests.sql
-- Table for faculty change requests (add/delete TAs for courses) after allocations are published.

create table if not exists public.ta_change_requests (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  run_id         bigint references public.allocation_runs(id) on delete set null,
  course_code    text not null,
  faculty_email  text not null,
  faculty_name   text,
  request_type   text not null check (request_type in ('ADD', 'DELETE')),
  ta_roll_no     text not null,
  ta_name        text,
  ta_program     text,
  reason         text,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_remark   text,
  reviewed_by    text,
  reviewed_at    timestamptz
);

create index if not exists ta_change_requests_course_idx on public.ta_change_requests(course_code);
create index if not exists ta_change_requests_status_idx on public.ta_change_requests(status);
create index if not exists ta_change_requests_faculty_idx on public.ta_change_requests(faculty_email);

alter table public.ta_change_requests enable row level security;
drop policy if exists ta_change_requests_select_auth on public.ta_change_requests;
create policy ta_change_requests_select_auth on public.ta_change_requests for select to authenticated using (true);
