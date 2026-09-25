-- Reason: gallery photos can be grouped (e.g. "Conference 2026", "Socials") so the public gallery shows category tabs instead of one long unsorted list.

alter table public.gallery_images add column category text;

-- The public page groups by category and the admin page filters by it.
create index gallery_images_category_idx on public.gallery_images (category);
