import type { PostgrestError } from "@supabase/supabase-js";

// The API caps every response at `max_rows` (1000, supabase/config.toml), and
// it does so silently: a plain select("*") on a bigger table just comes back
// short. Anything that needs the whole table — an inbox, a CSV export — reads
// it page by page through here instead.
//
// Must not exceed max_rows, or a full page would look like the last one.
const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>;

/**
 * Collects every row of a query. `page` builds the query for one slice and must
 * apply `.range(from, to)` and an ordering that ends on a unique column (e.g.
 * created_at then id), or rows can shift between pages and be skipped.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => Page<T>,
): Promise<{ data: T[] | null; error: PostgrestError | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
