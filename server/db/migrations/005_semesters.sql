-- 005_semesters.sql
-- Multi-semester support for CSDesk TA Allocation

-- 1. Create public.semesters table
create table if not exists public.semesters (
  id            text primary key,
  name          text not null,
  academic_year text not null,
  term          text not null,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Seed initial semester representing current semester
insert into public.semesters (id, name, academic_year, term, is_active)
values ('2025-26-even', 'Spring 2026', '2025-26', 'Spring', true)
on conflict (id) do update set is_active = true;

-- 2. Add semester_id column with default '2025-26-even' to all relevant tables
alter table public.courses add column if not exists semester_id text not null default '2025-26-even';
alter table public.timetable add column if not exists semester_id text not null default '2025-26-even';
alter table public.ta_details add column if not exists semester_id text not null default '2025-26-even';
alter table public.course_registration add column if not exists semester_id text not null default '2025-26-even';
alter table public.ta_requirements add column if not exists semester_id text not null default '2025-26-even';
alter table public.allocation_runs add column if not exists semester_id text not null default '2025-26-even';
alter table public.ta_change_requests add column if not exists semester_id text not null default '2025-26-even';

-- Update existing rows (if any had null)
update public.courses set semester_id = '2025-26-even' where semester_id is null;
update public.timetable set semester_id = '2025-26-even' where semester_id is null;
update public.ta_details set semester_id = '2025-26-even' where semester_id is null;
update public.course_registration set semester_id = '2025-26-even' where semester_id is null;
update public.ta_requirements set semester_id = '2025-26-even' where semester_id is null;
update public.allocation_runs set semester_id = '2025-26-even' where semester_id is null;
update public.ta_change_requests set semester_id = '2025-26-even' where semester_id is null;

-- 3. Adjust primary keys / unique constraints to be semester-aware
-- courses
alter table public.courses drop constraint if exists courses_pkey;
alter table public.courses add constraint courses_pkey primary key (course_code, semester_id);

-- ta_details
alter table public.ta_details drop constraint if exists ta_details_pkey;
alter table public.ta_details add constraint ta_details_pkey primary key (roll_no, semester_id);

-- ta_requirements
alter table public.ta_requirements drop constraint if exists ta_requirements_pkey;
alter table public.ta_requirements add constraint ta_requirements_pkey primary key (course_code, semester_id);

-- timetable: replace unique (day, start_time) with unique (day, start_time, semester_id)
alter table public.timetable drop constraint if exists timetable_day_start_time_key;
alter table public.timetable drop constraint if exists timetable_day_start_time_semester_key;
alter table public.timetable add constraint timetable_day_start_time_semester_key unique (day, start_time, semester_id);

-- course_registration: replace unique (student_roll_no, course_code) with unique (student_roll_no, course_code, semester_id)
alter table public.course_registration drop constraint if exists course_registration_student_roll_no_course_code_key;
alter table public.course_registration drop constraint if exists course_reg_student_course_semester_key;
alter table public.course_registration add constraint course_reg_student_course_semester_key unique (student_roll_no, course_code, semester_id);

-- Indexes for performance
create index if not exists courses_semester_idx on public.courses(semester_id);
create index if not exists timetable_semester_idx on public.timetable(semester_id);
create index if not exists ta_details_semester_idx on public.ta_details(semester_id);
create index if not exists course_reg_semester_idx on public.course_registration(semester_id);
create index if not exists ta_req_semester_idx on public.ta_requirements(semester_id);
create index if not exists alloc_runs_semester_idx on public.allocation_runs(semester_id);
create index if not exists ta_change_req_semester_idx on public.ta_change_requests(semester_id);

-- RLS policy for semesters
alter table public.semesters enable row level security;
drop policy if exists semesters_select_auth on public.semesters;
create policy semesters_select_auth on public.semesters for select to authenticated using (true);
