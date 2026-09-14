import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FileText } from "lucide-react";
import { meifTeams } from "@/app/data/siteData";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { Modal } from "@/app/components/Modal";
import { DocumentViewer } from "@/app/components/DocumentViewer";

type FundManagerRow = Tables<"fund_managers">;
type DocumentRow = Tables<"documents">;

function documentUrl(path: string) {
  return supabase.storage.from("meif_files").getPublicUrl(path).data.publicUrl;
}

type EtoroHolding = {
  instrumentId: number;
  name: string | null;
  symbol: string | null;
  logoUrl: string | null;
  netUnits: unknown;
  exposure: unknown;
  avgOpenPrice: unknown;
  unrealizedPnl: unknown;
};

type EtoroPortfolioResponse = {
  configured?: boolean;
  sync_status?: string;
  sync_error?: string | null;
  fetched_at?: string | null;
  account_totals?: Record<string, unknown> | null;
  holdings?: EtoroHolding[];
  error?: string;
};

function pick(obj: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function formatNumber(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-GB", { maximumFractionDigits: 2 }) : "—";
}

function fundManagerPhotoUrl(id: string) {
  return supabase.storage.from("fund_manager_photos").getPublicUrl(`${id}.jpeg`).data.publicUrl;
}

function FundManagerPortrait({ name, id }: { name: string; id: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span aria-hidden="true">{name.charAt(0)}</span>;
  }

  return (
    <img
      src={fundManagerPhotoUrl(id)}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function MEIF() {
  const [fundManagers, setFundManagers] = useState<FundManagerRow[]>([]);
  const [managersLoading, setManagersLoading] = useState(true);
  const [portfolio, setPortfolio] = useState<EtoroPortfolioResponse | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [coverageNotes, setCoverageNotes] = useState<DocumentRow[]>([]);
  const [openDocument, setOpenDocument] = useState<DocumentRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("documents")
      .select("*")
      .eq("is_published", true)
      .eq("category", "meif_coverage")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load coverage notes", error);
        setCoverageNotes(data ?? []);
      });

    supabase
      .from("fund_managers")
      .select("*")
      .eq("is_published", true)
      .order("start_year", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load fund managers", error);
        setFundManagers(data ?? []);
        setManagersLoading(false);
      });

    supabase.functions
      .invoke<EtoroPortfolioResponse>("etoro-portfolio")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load eToro portfolio", error);
        setPortfolio(data ?? null);
        setPortfolioLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useReveal([meifTeams.length, fundManagers.length, managersLoading, portfolioLoading]);
  const bgImage = usePageBackgroundImage("meif");

  const holdings = portfolio?.holdings ?? [];
  const accountTotals = portfolio?.account_totals ?? null;

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb"><Link to="/">MUTIS</Link><span>/</span><span>MEIF</span></div>
            <div className="page-eyebrow r-up"><span className="bar" />Ethical Investment Fund</div>
            <h1 className="page-title r-up">A real fund<br />Student <span className="accent">run</span></h1>
          </div>
          <p className="page-sub r-up">A student-managed global equity fund: five equity teams and one macro team.</p>
        </div>
      </section>

      <section className="page-section meif-fund-section">
        <div className="inner">
          <div className="split">
            <div className="split-text"><h2 className="r-up">The Fund</h2></div>
            <div className="split-text r-up">
              <p><strong>The MUTIS Ethical Investment Fund is a student-managed global equity fund.</strong> Members pitch, debate, and vote on long-only positions across Financials, Consumer, TMT, Industrials, Energy, and Macro.</p>
              <p>MEIF analysts produce written research  -  initiations, updates, and quarterly outlooks  -  and present at pitch nights judged by the committee and industry mentors.</p>
              <p>Every position must pass an ethical screen. Every member writes at least one note per term.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section" style={{ background: "var(--base)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Section 02  -  Sectors</div>
          <h2 className="r-up">Six compact coverage desks</h2>
          <div className="team-compact-grid">
            {meifTeams.map((s) => (
              <article className="team-compact-card r-up" key={s.id}>
                <div>
                  <div className="sname">{s.name}</div>
                  <div className="sdesc">{s.desc} {s.profile}</div>
                </div>
                <div className="focus">
                  <div className="l">Focus areas</div>
                  <ul>{s.focus.map((f) => <li key={f}>{f}</li>)}</ul>
                </div>
                <div className="team-pdfs">
                  {(() => {
                    const notes = coverageNotes.filter((d) => d.team_id === s.id);
                    if (notes.length === 0) {
                      return <span className="team-pdf-soon">Coverage notes: coming soon</span>;
                    }
                    return notes.map((doc) => (
                      <button key={doc.id} type="button" onClick={() => setOpenDocument(doc)}>
                        <FileText size={11} strokeWidth={1.8} style={{ marginRight: 6 }} aria-hidden="true" />
                        {doc.title}
                      </button>
                    ));
                  })()}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Section 03  -  Portfolio</div>
          <h2 className="r-up">Investments &amp; performance</h2>

          {portfolioLoading ? (
            <p className="lede r-up" role="status">Loading live portfolio…</p>
          ) : !portfolio?.configured ? (
            <>
              <p className="lede r-up">
                A live view of the fund&apos;s holdings and performance is coming soon. We&apos;re
                evaluating a data source so members can track positions and returns here.
              </p>
              <div className="perf-placeholder r-up" aria-hidden="true">
                <div className="perf-card"><span className="l">Holdings</span><span className="v">—</span></div>
                <div className="perf-card"><span className="l">Unrealised P&amp;L</span><span className="v">—</span></div>
                <div className="perf-card"><span className="l">Portfolio Value</span><span className="v">—</span></div>
                <div className="perf-card"><span className="l">Available Cash</span><span className="v">—</span></div>
              </div>
            </>
          ) : (
            <>
              {portfolio.sync_status === "error" && (
                <p className="form-status form-error r-up" role="alert">
                  Couldn&apos;t refresh live data from eToro just now
                  {holdings.length > 0 ? " — showing the last successful snapshot below." : "."}
                </p>
              )}
              <p className="lede r-up">
                {portfolio.fetched_at
                  ? `As of ${new Date(portfolio.fetched_at).toLocaleString("en-GB")}.`
                  : "Waiting on the first sync from eToro."}
              </p>

              <div className="perf-placeholder r-up">
                <div className="perf-card"><span className="l">Holdings</span><span className="v">{holdings.length}</span></div>
                <div className="perf-card"><span className="l">Unrealised P&amp;L</span><span className="v">{formatNumber(pick(accountTotals, ["unrealizedProfit", "unrealizedPnl", "unrealisedPnl", "totalUnrealizedPnl"]))}</span></div>
                <div className="perf-card"><span className="l">Portfolio Value</span><span className="v">{formatNumber(pick(accountTotals, ["totalValue", "portfolioValue", "equity", "netValue"]))}</span></div>
                <div className="perf-card"><span className="l">Available Cash</span><span className="v">{formatNumber(pick(accountTotals, ["availableCash", "cash", "freeCash"]))}</span></div>
              </div>

              {holdings.length > 0 && (
                <div className="meif-holdings-table r-up">
                  <div className="meif-holdings-row meif-holdings-head" aria-hidden="true">
                    <span>Instrument</span>
                    <span>Net Units</span>
                    <span>Exposure</span>
                    <span>Avg Open Price</span>
                    <span>Unrealised P&amp;L</span>
                  </div>
                  {holdings.map((h) => (
                    <div className="meif-holdings-row" key={h.instrumentId}>
                      <span className="meif-holdings-name">
                        {h.logoUrl && <img src={h.logoUrl} alt="" loading="lazy" />}
                        {h.name ?? h.symbol ?? `Instrument #${h.instrumentId}`}
                      </span>
                      <span>{formatNumber(h.netUnits)}</span>
                      <span>{formatNumber(h.exposure)}</span>
                      <span>{formatNumber(h.avgOpenPrice)}</span>
                      <span>{formatNumber(h.unrealizedPnl)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Previous Fund Managers */}
      <section className="page-section" style={{ background: "var(--base)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Section 04  -  Leadership</div>
          <h2 className="r-up">Previous Fund Managers</h2>
          <p className="lede r-up">The students who have led the MUTIS Ethical Investment Fund.</p>
          {managersLoading ? (
            <p className="lede r-up" role="status">Loading…</p>
          ) : fundManagers.length === 0 ? (
            <p className="lede r-up">
              We&apos;re compiling a record of past fund managers. Check back soon.
            </p>
          ) : (
          <div className="network-grid r-up">
            {fundManagers.map((m) => (
              <article className="network-card" key={m.id}>
                <div className="network-portrait">
                  <FundManagerPortrait name={m.name} id={m.id} />
                </div>
                <div className="network-name">{m.name}</div>
                <div className="network-role">{m.year_label}</div>
                {m.linkedin_url && (
                  <a className="network-linkedin" href={m.linkedin_url} target="_blank" rel="noreferrer">LinkedIn →</a>
                )}
              </article>
            ))}
          </div>
          )}
        </div>
      </section>

      <Modal open={openDocument !== null} onClose={() => setOpenDocument(null)} labelledBy="coverage-note-title">
        {openDocument && (
          <div className="modal-body">
            <h3 id="coverage-note-title">{openDocument.title}</h3>
            <DocumentViewer url={documentUrl(openDocument.storage_path)} title={openDocument.title} height={480} />
          </div>
        )}
      </Modal>
    </>
  );
}
