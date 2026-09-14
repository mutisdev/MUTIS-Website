-- Optional EDI / widening-participation data collected on the membership
-- sign-up form. Kept in its own table (rather than columns on
-- membership_signups) since ethnicity and free-school-meals eligibility are
-- special category data under UK GDPR: this keeps it out of any query or
-- export of ordinary signup data unless an admin deliberately joins to it,
-- and lets it be deleted independently (e.g. right-to-erasure) via the FK cascade.
create table public.membership_signup_diversity (
  signup_id                  uuid primary key references public.membership_signups(id) on delete cascade,
  ethnicity                  text,
  ethnicity_other_description text,
  contextual_offer_eligible  text,
  school_type                text,
  first_generation_student   text,
  free_school_meals          text,
  created_at                 timestamptz not null default now()
);

alter table public.membership_signup_diversity enable row level security;

-- Same public-insert / admin-only-read shape as membership_signups itself —
-- no public select policy at all, since this data should never be readable
-- by anyone but an admin, not even the person who submitted it.
create policy "public can submit membership_signup_diversity" on public.membership_signup_diversity
  for insert to anon, authenticated with check (true);

create policy "admin can read membership_signup_diversity" on public.membership_signup_diversity
  for select using (public.is_admin());

create policy "admin can update membership_signup_diversity" on public.membership_signup_diversity
  for update using (public.is_admin()) with check (public.is_admin());

create policy "admin can delete membership_signup_diversity" on public.membership_signup_diversity
  for delete using (public.is_admin());
