-- Article PDFs are compressed in the browser before upload; allow up to the
-- project-wide 50MB upload cap for whatever still comes out large.
update storage.buckets
set file_size_limit = 52428800
where id = 'article_pdfs';
