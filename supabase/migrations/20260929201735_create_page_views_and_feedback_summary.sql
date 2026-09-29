-- Reason: show admins how many people opened the feedback form, how many replied, and what they said.
--
-- Two things are added: page_views, a minimal record that a browser opened a
-- tracked page, and attendance_feedback_summary(), which aggregates that
-- against attendance_submissions in one round trip.
--
-- page_views is the only table anon may insert into. 20260917120000_lock_down_
-- public_form_inserts moved every public form behind the submit-form Edge
-- Function, and that stays true for anything a visitor writes on purpose. A
-- page view is different: it fires on load, so it cannot afford a reCAPTCHA
-- execute plus a function cold start on the QR-scan landing. The exposure is
-- bounded instead:
--   * anon holds a column-level insert grant on (session_id, path) only, so a
--     client can never supply its own created_at;
--   * the insert policy allows one path;
--   * anon cannot select, and nobody can update or delete;
--   * nothing identifying is stored. No IP address, user agent, referrer or
--     auth id, ever. The only identifier is a random UUID the browser keeps in
--     localStorage.
-- The accepted residual risk is that someone minting fresh UUIDs can inflate
-- the visitor count, which pushes the response rate *down*. There is no way to
-- inflate the rate, which is the metric anyone would want to flatter.
--
-- created_at is truncated to the hour in Europe/London. attendance_submissions.
-- created_at is truncated to the whole day (20260918210724_attendance_feedback_
-- anonymous) so a response can't be tied to the moment someone was seen filling
-- the form in. A full-precision page view would hand that back: a lone visitor
-- recorded at 14:32 on a quiet day is, to a reader of both tables, that day's
-- single submission. The hour bucket blunts that while keeping every date-range
-- count exact. It is a compromise, not a cure — on a very quiet day one visitor
-- in the 14:00 bucket and one submission still correlate. Day-truncation would
-- close it completely, at the cost of ever being able to chart traffic within a
-- day.

create table public.page_views (
  session_id uuid        not null,
  path       text        not null,
  created_at timestamptz not null default date_trunc('hour', now(), 'Europe/London'),
  -- Shape guard: a path, lower case, no query string and nothing that could
  -- carry an identifier. Which paths are actually accepted is the insert
  -- policy's business.
  constraint page_views_path_format check (path ~ '^/[a-z0-9/_-]{0,64}$')
);

-- There is deliberately no primary key and no unique key. The visitor metric is
-- count(distinct session_id), so a duplicate row cannot move it, and leaving the
-- constraint out means the client never has to handle a conflict: a repeated
-- insert from a double-invoked effect is silently harmless rather than an error
-- it would have to swallow.
create index page_views_path_created_at_idx on public.page_views (path, created_at);

alter table public.page_views enable row level security;

create policy "anon can log page views" on public.page_views
  for insert to anon, authenticated with check (path = '/attendance');

create policy "admin can read page_views" on public.page_views
  for select using (private.is_admin());

-- Append-only: there is no update or delete policy and no update or delete
-- grant for anyone, including admins. Feedback records are kept, not pruned, so
-- a row here can only be removed by a migration or the service role.
grant insert (session_id, path) on table public.page_views to anon, authenticated;
grant select on table public.page_views to authenticated;

-- Everything the admin feedback summary shows, aggregated in Postgres: one
-- round trip, and no maths over a client .select() that PostgREST would have
-- capped at 1,000 rows.
--
-- Two modes:
--
--   * event mode (p_event_id given). The window is the event's own day(s),
--     from events.starts_at to coalesce(ends_at, starts_at) in Europe/London —
--     a single day for a normal event. Ratings, the distribution and the
--     comments describe EVERY submission carrying that event_id whatever its
--     date (submissions_total), because event_id is authoritative and someone
--     may answer the next morning. The response rate cannot use that number:
--     page_views has no event_id, so visitors are only ever time-windowed. It
--     uses submissions_in_range / unique_visitors, both measured over the same
--     days, and both counts are returned so the caller can say "12 responses,
--     11 on the day" rather than implying the rate covers the lot. This assumes
--     the event was the only one held that day; if two ran, that day's visitors
--     are attributed to both.
--
--   * range mode (p_from / p_to, defaulting to the last 30 days). p_scope picks
--     'all', 'listed' (event_id is not null) or 'other' (event_id is null — the
--     "Other (not listed)" free-text bucket). Here submissions_total equals
--     submissions_in_range.
--
-- Range comparisons are made on (created_at at time zone 'Europe/London')::date
-- rather than on timestamps. Submission timestamps are London midnights stored
-- as timestamptz, so a naive `created_at < p_to` would drop the final day and
-- would drift across a DST change; comparing London calendar dates is exact.
--
-- security invoker: RLS on both tables applies as the caller, so a non-admin
-- gets zeros rather than data — same as dashboard_signup_trend.
create or replace function public.attendance_feedback_summary(
  p_event_id      uuid    default null,
  p_from          date    default null,
  p_to            date    default null,
  p_scope         text    default 'all',
  p_comment_limit integer default 10
)
returns table (
  mode                 text,
  event_id             uuid,
  event_title          text,
  range_start          date,
  range_end            date,
  unique_visitors      integer,
  submissions_total    integer,
  submissions_in_range integer,
  response_rate        numeric,
  average_rating       numeric,
  rating_distribution  jsonb,
  recent_comments      jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with args as (
    select
      case
        when p_event_id is not null then 'event'
        when p_scope = 'other'      then 'other'
        when p_scope = 'listed'     then 'listed'
        else 'all'
      end as scope,
      greatest(1, least(coalesce(p_comment_limit, 10), 50)) as comment_limit,
      (now() at time zone 'Europe/London')::date as today
  ),
  ev as (
    select
      e.id,
      e.title,
      (e.starts_at at time zone 'Europe/London')::date as start_day,
      (coalesce(e.ends_at, e.starts_at) at time zone 'Europe/London')::date as end_day
    from public.events e
    where p_event_id is not null and e.id = p_event_id
  ),
  win as (
    select
      a.scope,
      a.comment_limit,
      (select ev.id from ev) as event_id,
      (select ev.title from ev) as event_title,
      -- least/greatest so a range the caller passed backwards still reads forwards.
      least(
        case when a.scope = 'event' then (select ev.start_day from ev) else coalesce(p_from, a.today - 29) end,
        case when a.scope = 'event' then (select ev.end_day from ev)   else coalesce(p_to, a.today)        end
      ) as range_start,
      greatest(
        case when a.scope = 'event' then (select ev.start_day from ev) else coalesce(p_from, a.today - 29) end,
        case when a.scope = 'event' then (select ev.end_day from ev)   else coalesce(p_to, a.today)        end
      ) as range_end
    from args a
  ),
  -- The submissions the summary describes. Event mode ignores the dates here on
  -- purpose; the other scopes are windowed.
  described as (
    select s.id, s.rating, s.comments, s.status,
           (s.created_at at time zone 'Europe/London')::date as day
    from public.attendance_submissions s
    cross join win w
    where case w.scope
            when 'event'  then s.event_id = w.event_id
            when 'other'  then s.event_id is null
            when 'listed' then s.event_id is not null
            else true
          end
      and (
        w.scope = 'event'
        or (s.created_at at time zone 'Europe/London')::date between w.range_start and w.range_end
      )
  ),
  in_range as (
    select d.* from described d cross join win w
    where d.day between w.range_start and w.range_end
  ),
  visitors as (
    select count(distinct v.session_id)::integer as n
    from public.page_views v
    cross join win w
    where v.path = '/attendance'
      and (v.created_at at time zone 'Europe/London')::date between w.range_start and w.range_end
  ),
  totals as (
    select
      (select count(*)::integer from described) as total,
      (select count(*)::integer from in_range)  as windowed,
      (select round(avg(d.rating)::numeric, 2) from described d) as avg_rating
  ),
  dist as (
    select jsonb_agg(
             jsonb_build_object('rating', r.rating, 'count', coalesce(c.n, 0))
             order by r.rating
           ) as j
    from generate_series(1, 5) as r(rating)
    left join (
      select d.rating, count(*)::integer as n from described d group by d.rating
    ) c on c.rating = r.rating
  ),
  -- Newest first, but only to the day: within a day the tie-break is a random
  -- uuid, so the order people answered in stays unknowable.
  comments as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'rating', t.rating, 'comments', t.comments,
          'status', t.status, 'created_on', t.day
        ) order by t.day desc, t.id
      ),
      '[]'::jsonb
    ) as j
    from (
      select d.id, d.rating, d.comments, d.status, d.day
      from described d
      where d.comments is not null and btrim(d.comments) <> ''
      order by d.day desc, d.id
      limit (select w.comment_limit from win w)
    ) t
  )
  select
    w.scope,
    w.event_id,
    w.event_title,
    w.range_start,
    w.range_end,
    v.n,
    t.total,
    t.windowed,
    -- null rather than 0 when nobody was recorded, so the caller can show "—"
    -- instead of a 0% that looks like a real measurement. Can legitimately
    -- exceed 1: blocked localStorage, a second device, or a tab left open over
    -- midnight all give a submission with no matching view.
    case when v.n > 0 then round(t.windowed::numeric / v.n, 4) end,
    t.avg_rating,
    coalesce(d.j, '[]'::jsonb),
    c.j
  from win w, visitors v, totals t, dist d, comments c;
$$;

revoke all on function public.attendance_feedback_summary(uuid, date, date, text, integer) from public, anon;
grant execute on function public.attendance_feedback_summary(uuid, date, date, text, integer) to authenticated;
