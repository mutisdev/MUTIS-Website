import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useAuth } from "./AuthProvider";

// Content tables this hook manages. Submission-inbox tables, admin_users, and
// site_settings are handled by their own pages with their own PK shape.
export type ContentTable =
  | "sponsors"
  | "committee_members"
  | "events"
  | "alumni"
  | "presidents"
  | "articles"
  | "podcast_settings"
  | "gallery_images"
  | "recordings"
  | "past_speakers"
  | "fund_managers"
  | "documents"
  | "network_logos";

type Row<T extends ContentTable> = Database["public"]["Tables"][T]["Row"];
type Insert<T extends ContentTable> = Database["public"]["Tables"][T]["Insert"];
type Update<T extends ContentTable> = Database["public"]["Tables"][T]["Update"];

/**
 * Every admin create/update/delete on a content table goes through here so
 * audit_log capture (full before/after snapshot) happens in one place
 * instead of being repeated per page.
 */
export function useAdminMutation() {
  const { session } = useAuth();

  async function logChange(
    table: ContentTable,
    rowId: string,
    action: "insert" | "update" | "delete",
    before: unknown,
    after: unknown
  ) {
    const { error } = await supabase.from("audit_log").insert({
      actor_user_id: session?.user.id ?? null,
      actor_email: session?.user.email ?? "unknown",
      table_name: table,
      row_id: rowId,
      action,
      before: before as never,
      after: after as never,
    });
    // Audit logging is best-effort: a logging failure shouldn't roll back
    // or block a content write that already succeeded.
    if (error) console.error(`Failed to write audit log entry for ${table}/${rowId}`, error);
  }

  // supabase-js's query builder overloads don't resolve cleanly when `table`
  // is a generic type parameter rather than a string literal (TS tries to
  // distribute across the whole Database union). Casting the builder chain
  // to `any` sidesteps that; the public function signatures below keep full
  // type safety for callers.
  async function insertRow<T extends ContentTable>(table: T, values: Insert<T>): Promise<Row<T>> {
    const { data, error } = await (supabase.from(table) as any).insert(values).select().single();
    if (error) throw error;
    await logChange(table, (data as Row<T>).id, "insert", null, data);
    return data as Row<T>;
  }

  async function updateRow<T extends ContentTable>(
    table: T,
    id: string,
    values: Update<T>,
    previousRow: Row<T>
  ): Promise<Row<T>> {
    const { data, error } = await (supabase.from(table) as any)
      .update(values)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await logChange(table, id, "update", previousRow, data);
    return data as Row<T>;
  }

  async function deleteRow<T extends ContentTable>(
    table: T,
    id: string,
    previousRow: Row<T>
  ): Promise<void> {
    const { error } = await (supabase.from(table) as any).delete().eq("id", id);
    if (error) throw error;
    await logChange(table, id, "delete", previousRow, null);
  }

  return { insertRow, updateRow, deleteRow };
}
