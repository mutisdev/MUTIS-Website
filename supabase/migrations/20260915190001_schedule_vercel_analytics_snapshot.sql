-- Nightly copy of Vercel Web Analytics into site_traffic_* (see
-- 20260915190000). pg_cron fires pg_net at the vercel-analytics-snapshot
-- Edge Function, authenticating with a random shared secret that lives only
-- in Vault (generated here, never in source control).
create extension if not exists pg_cron;
-- extensions schema, not public (Supabase security advisor); its functions live in `net` either way.
create extension if not exists pg_net schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'vercel_snapshot_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'vercel_snapshot_secret');
  end if;
end;
$$;

-- 00:30 UTC daily: re-fetch the last 3 complete days (corrects late data).
select cron.schedule(
  'vercel-analytics-snapshot',
  '30 0 * * *',
  $$
  select net.http_post(
    url := 'https://ktleyfwpcuyvvyxpvipp.supabase.co/functions/v1/vercel-analytics-snapshot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-snapshot-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vercel_snapshot_secret')
    ),
    body := '{"days": 3}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
