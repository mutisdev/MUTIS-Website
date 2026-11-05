import { supabase } from "@/lib/supabase";
import { CV_BUCKET } from "@shared/eventApplications";

// Builds a single zip of several applicants' CVs, in the browser.
//
// There is no server to do this on: the site is a static SPA, and the only
// server-side code is Supabase Edge Functions, which are memory- and
// CPU-bounded and a poor place to buffer dozens of 5 MB PDFs. Nor is one
// needed — the event-cvs bucket's one policy, "admin read event-cvs", grants
// SELECT to private.is_admin(), so an admin session is already entitled to
// every byte this module fetches. It is the same entitlement the single-CV
// download on the applications page uses.
//
// Fetched with storage.download() rather than a signed URL per file: a signed
// URL is a bearer credential for one PDF, and there is no reason to mint sixty
// of them when the session itself can read the objects.
//
// Auditing is deliberately NOT done here. The caller writes one audit_log
// entry per application BEFORE calling this, so the record exists even if the
// archive then fails half-way — the same order openCv() uses.

/** One CV to put in the archive. Built from an event_applications row whose
 * cv_path is non-null; a purged CV has nothing to fetch and must be filtered
 * out by the caller. */
export interface CvArchiveEntry {
  /** event_applications.id — the caller's audit entries key off this. */
  id: string;
  /** The applicant's name, which becomes the file name inside the zip. */
  name: string;
  /** Shown to the admin when a download fails, and used to break name ties. */
  referenceCode: string;
  cvPath: string;
}

export interface CvArchiveResult {
  blob: Blob;
  /** How many CVs made it in. */
  included: number;
  /** The ones that didn't, so the admin can be told exactly who is missing
   * rather than being handed a quietly short folder. */
  failed: { name: string; referenceCode: string }[];
}

/** How many CVs are fetched at once. Enough to keep a connection busy, few
 * enough that a sixty-applicant export doesn't look like a burst to Storage —
 * the same instinct behind purge-event-cvs working in batches rather than
 * firing every object at once. */
const CONCURRENCY = 4;

/** Characters that are illegal in a Windows file name, plus the path
 * separators and control characters that must never reach one anywhere. */
const UNSAFE_FILE_NAME = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/**
 * "<name>-CV.pdf", made safe to write to disk and unique within one archive.
 *
 * `taken` is mutated: pass the same set for every entry in an archive, and a
 * repeated name picks up its reference code — "Riya Patel-CV (MU-2D7E).pdf".
 * That is not a theoretical case. The same person applying twice from two
 * different addresses is a known pattern in this data, and two genuinely
 * different applicants can share a name; without this, one would silently
 * overwrite the other inside the zip.
 *
 * Note this is NOT safeCvFileName() from @shared/eventApplications. That one
 * sanitises the name the applicant uploaded, for display — it keeps colons and
 * asterisks, which Windows rejects, and it knows nothing about collisions.
 */
export function archiveFileName(name: string, referenceCode: string, taken: Set<string>): string {
  const cleaned = name.replace(UNSAFE_FILE_NAME, " ").replace(/\s+/g, " ").trim();
  // A name that sanitises away to nothing still needs a file, so it falls back
  // to the reference code, which is unique by constraint.
  const base = cleaned ? `${cleaned}-CV` : `${referenceCode}-CV`;

  let candidate = `${base}.pdf`;
  if (taken.has(candidate)) {
    candidate = `${base} (${referenceCode}).pdf`;
    // Two rows with the same name AND the same reference code can't exist —
    // reference_code is unique — but a counter costs one line and means this
    // function can never return a duplicate whatever it is given.
    for (let n = 2; taken.has(candidate); n++) candidate = `${base} (${referenceCode}) ${n}.pdf`;
  }
  taken.add(candidate);
  return candidate;
}

/**
 * Downloads every entry's CV and zips them.
 *
 * Stored, not deflated: a PDF's streams are already compressed, so deflating
 * again spends seconds of main-thread CPU on a percent or two of size.
 *
 * A failed download does not abort the archive. The entry goes into
 * `failed` and the rest carry on — a partial export the admin is told about is
 * worth more than an error and no files.
 */
export async function buildCvArchive(
  entries: CvArchiveEntry[],
  onProgress?: (done: number, total: number) => void
): Promise<CvArchiveResult> {
  // Loaded here rather than imported at the top of the module so JSZip's
  // ~100 KB stays out of the admin bundle for everyone who never exports.
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const taken = new Set<string>();
  const failed: CvArchiveResult["failed"] = [];
  let done = 0;
  let included = 0;

  // A shared cursor rather than chunked batches, so one slow CV doesn't hold
  // up the three lanes beside it.
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor++;
      if (index >= entries.length) return;
      const entry = entries[index];
      try {
        const { data, error } = await supabase.storage.from(CV_BUCKET).download(entry.cvPath);
        if (error || !data) throw error ?? new Error("No data");
        // File names are assigned as downloads land, so they depend on
        // completion order. Harmless — every name is unique either way — and
        // the alternative, pre-assigning them, would reserve names for CVs
        // that turn out to be unfetchable.
        zip.file(archiveFileName(entry.name, entry.referenceCode, taken), data);
        included++;
      } catch (cause) {
        console.error("Could not fetch CV for archive", entry.cvPath, cause);
        failed.push({ name: entry.name, referenceCode: entry.referenceCode });
      } finally {
        onProgress?.(++done, entries.length);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));

  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  return { blob, included, failed };
}
