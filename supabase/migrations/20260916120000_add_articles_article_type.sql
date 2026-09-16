-- Articles are either written (TipTap HTML in body_html) or an uploaded PDF
-- (public URL in pdf_url, file in the article_pdfs bucket) — never both.
alter table public.articles
  add column article_type text not null default 'written'
  check (article_type in ('written', 'pdf'));

alter table public.articles drop constraint articles_check;

alter table public.articles add constraint articles_content_matches_type check (
  (article_type = 'written' and body_html is not null and pdf_url is null)
  or (article_type = 'pdf' and pdf_url is not null and body_html is null)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('article_pdfs', 'article_pdfs', true, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "admin write article_pdfs bucket" on storage.objects
  for all
  using (bucket_id = 'article_pdfs' and public.is_admin())
  with check (bucket_id = 'article_pdfs' and public.is_admin());
