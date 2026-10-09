create table if not exists public.lab_allocation_labs (
  id text primary key,
  name text not null,
  capacity integer not null,
  has_gpu boolean not null default false
);

create table if not exists public.lab_allocation_courses (
  code text primary key,
  name text not null,
  student_count integer not null,
  gpu_required boolean not null default false,
  academic_year text,
  instructor text,
  duration integer not null default 3,
  periods jsonb not null default '[]'::jsonb
);

create table if not exists public.lab_allocation_timetable (
  id text primary key default 'singleton',
  headers jsonb not null default '[]'::jsonb,
  slots jsonb not null default '{}'::jsonb
);

do $$
declare t text;
begin
  foreach t in array array['lab_allocation_labs', 'lab_allocation_courses', 'lab_allocation_timetable']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_auth', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_select_auth', t);
  end loop;
end $$;
