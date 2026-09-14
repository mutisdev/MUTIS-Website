create table public.membership_signups (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  email      text not null,
  course     text not null,
  year       text not null,
  phone      text,
  status     text not null default 'new' check (status in ('new','read','archived')),
  created_at timestamptz not null default now()
);

alter table public.membership_signups enable row level security;

create policy "public can submit membership_signups" on public.membership_signups
  for insert to anon, authenticated with check (true);

create policy "admin can read membership_signups" on public.membership_signups
  for select using (public.is_admin());

create policy "admin can update membership_signups" on public.membership_signups
  for update using (public.is_admin()) with check (public.is_admin());

create policy "admin can delete membership_signups" on public.membership_signups
  for delete using (public.is_admin());

-- Prevent the same person submitting the sign-up form twice. Case-insensitive
-- on email since the client doesn't normalize casing before insert, matching
-- attendance_submissions_event_email_uidx's approach.
create unique index membership_signups_email_uidx
  on public.membership_signups (lower(email));
