insert into storage.buckets (id, name, public)
values ('network_logos', 'network_logos', true)
on conflict (id) do nothing;

create policy "admin write network_logos" on storage.objects
  for all
  using (bucket_id = 'network_logos' and public.is_admin())
  with check (bucket_id = 'network_logos' and public.is_admin());
