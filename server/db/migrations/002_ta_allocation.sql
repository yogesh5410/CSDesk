-- 002_ta_allocation.sql
-- Tables backing the TA Allocation module. Every table is a direct landing
-- zone for one uploaded file, except the two allocation_* tables which hold
-- solver output.

-- From "List of courses" PDF. CSE department rows only.
create table if not exists public.courses (
  course_code   text primary key,
  course_name   text not null,
  discipline    text,
  program       text,
  lecture_slot  text,
  tutorial_slot text,
  lab_slot      text,
  instructors   text
);

-- From "Common Time Table" PDF: one row per (day, period).
create table if not exists public.timetable (
  id          bigserial primary key,
  day         text not null,
  start_time  text not null,
  end_time    text not null,
  theory_slot text,
  lab_slot    text,
  unique (day, start_time)
);

create table if not exists public.ta_details (
  roll_no           text primary key,
  name              text not null,
  program           text,
  thesis_supervisor text,
  email             text
);

create table if not exists public.course_registration (
  id               bigserial primary key,
  student_roll_no  text not null,
  course_code      text not null,
  unique (student_roll_no, course_code)
);

create table if not exists public.ta_requirements (
  course_code        text primary key,
  tas_required       integer not null check (tas_required > 0),
  preferred_ta_rolls text
);

-- One row per execution of the allocator.
create table if not exists public.allocation_runs (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  status     text not null,
  summary    jsonb
);

create table if not exists public.allocations (
  id            bigserial primary key,
  run_id        bigint not null references public.allocation_runs(id) on delete cascade,
  course_code   text not null,
  ta_roll_no    text not null,
  ta_name       text,
  ta_program    text,
  is_preferred  boolean not null default false,
  is_supervisor boolean not null default false
);

create index if not exists allocations_run_id_idx on public.allocations(run_id);
create index if not exists course_registration_roll_idx
  on public.course_registration(student_roll_no);

-- Same posture as public.users: the publishable key reaches the browser, so
-- reads are limited to signed-in users and every write goes through the
-- server's secret key, which bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array['courses', 'timetable', 'ta_details',
                           'course_registration', 'ta_requirements',
                           'allocation_runs', 'allocations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_auth', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_auth', t);
  end loop;
end $$;
