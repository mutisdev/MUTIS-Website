insert into storage.buckets (id, name, public)
values ('page_background_images', 'page_background_images', true)
on conflict (id) do nothing;

create policy "admin write page_background_images" on storage.objects
  for all
  using (bucket_id = 'page_background_images' and public.is_admin())
  with check (bucket_id = 'page_background_images' and public.is_admin());
