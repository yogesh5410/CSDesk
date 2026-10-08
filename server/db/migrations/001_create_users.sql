-- 001_create_users.sql
-- Application user directory: every person who can sign in to CSDesk.
-- Email is the primary key because Supabase Google OAuth is the only way in,
-- and both the client (AuthContext) and server (requireAuth) already identify
-- a person by their @iitbhilai.ac.in address.

create table if not exists public.users (
  email text primary key check (email = lower(email)),
  name  text not null,
  role  text not null check (role in ('admin', 'faculty', 'ta'))
);

-- The publishable/anon key is shipped to the browser, so without RLS this
-- table would be world-readable AND world-writable by anyone holding it.
alter table public.users enable row level security;

-- Signed-in users may read the directory (the dashboard needs to resolve
-- names and roles).  Nobody may write through the anon key -- inserts and
-- updates go through the server's secret key, which bypasses RLS.
drop policy if exists users_select_authenticated on public.users;
create policy users_select_authenticated
  on public.users for select
  to authenticated
  using (true);
