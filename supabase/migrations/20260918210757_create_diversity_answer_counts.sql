-- Reason: keep diversity answers only as anonymous totals that can't be traced to anyone and don't go down if a member record is deleted.
--
-- Each row is "question, answer, how many people gave it". There is no member
-- id and no timestamp, so a total can't be linked back to a person. New
-- sign-ups add to these totals through record_diversity_answers(); nothing
-- ever subtracts from them. No membership_signups rows are touched.
--
-- The existing per-member answers are copied in below. The per-member table
-- (membership_signup_diversity) is left in place and only removed by a
-- separate, later migration.
create table public.diversity_answer_counts (
  question text not null,
  answer   text not null,
  count    integer not null default 0 check (count >= 0),
  primary key (question, answer)
);

alter table public.diversity_answer_counts enable row level security;

-- Admins can read totals; nobody can edit them through the API.
create policy "admin can read diversity_answer_counts" on public.diversity_answer_counts
  for select using (private.is_admin());

grant select on table public.diversity_answer_counts to authenticated;
grant select, insert, update on table public.diversity_answer_counts to service_role;

-- Adds one person's answers to the totals. Called by the submit-form Edge
-- Function (service role only) after a membership sign-up has been saved.
-- Missing answers are counted as 'no_answer'. Only the option someone chose
-- is counted (e.g. "Black – other"); free-text descriptions are never
-- tallied, since a unique self-description could identify a person.
create function public.record_diversity_answers(
  p_ethnicity                 text,
  p_contextual_offer_eligible text,
  p_school_type               text,
  p_first_generation_student  text,
  p_free_school_meals         text
) returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.diversity_answer_counts as c (question, answer, count)
  select question, answer, 1
  from (values
    ('ethnicity',                 coalesce(nullif(btrim(p_ethnicity), ''), 'no_answer')),
    ('contextual_offer_eligible', coalesce(nullif(btrim(p_contextual_offer_eligible), ''), 'no_answer')),
    ('school_type',               coalesce(nullif(btrim(p_school_type), ''), 'no_answer')),
    ('first_generation_student',  coalesce(nullif(btrim(p_first_generation_student), ''), 'no_answer')),
    ('free_school_meals',         coalesce(nullif(btrim(p_free_school_meals), ''), 'no_answer'))
  ) as a(question, answer)
  on conflict (question, answer) do update set count = c.count + 1;
$$;

revoke execute on function public.record_diversity_answers(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_diversity_answers(text, text, text, text, text) to service_role;

-- Copy existing answers into the totals. Every member is counted once per
-- question; a member with no diversity row counts as 'no_answer'.
insert into public.diversity_answer_counts (question, answer, count)
select question, answer, count(*)::integer
from (
  select q.question, coalesce(nullif(btrim(q.answer), ''), 'no_answer') as answer
  from public.membership_signups m
  left join public.membership_signup_diversity d on d.signup_id = m.id
  cross join lateral (values
    ('ethnicity',                 d.ethnicity),
    ('contextual_offer_eligible', d.contextual_offer_eligible),
    ('school_type',               d.school_type),
    ('first_generation_student',  d.first_generation_student),
    ('free_school_meals',         d.free_school_meals)
  ) as q(question, answer)
) answers
group by question, answer;
