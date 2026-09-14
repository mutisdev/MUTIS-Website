import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { usePodcastSettings } from "@/app/hooks/usePodcastSettings";
import { SpotifyEmbedCard } from "@/app/components/SpotifyEmbedCard";

const MEDIA_LINKS = [
  { to: "/gallery", num: "01", title: "Gallery", desc: "Photography from conferences, socials, and speaker nights across the MUTIS year." },
  { to: "/recordings", num: "02", title: "Recordings", desc: "Watch selected talks and panels on demand, published for members to catch up." },
];

const PODCAST_INTRO = "Conversations on markets, careers, and society life — stream every episode on Spotify.";

export function Media() {
  const { settings, isLoading } = usePodcastSettings();

  useReveal([MEDIA_LINKS.length, isLoading]);
  const bgImage = usePageBackgroundImage("media");

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb"><Link to="/">MUTIS</Link><span>/</span><span>Media</span></div>
            <div className="page-eyebrow r-up"><span className="bar" />Media</div>
            <h1 className="page-title r-up">See, hear, and<br /><span className="accent">relive it</span></h1>
          </div>
          <p className="page-sub r-up">
            Photos, recordings, and our podcast — everything from the MUTIS year in one place.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Explore</div>
          <h2 className="r-up">Media channels</h2>
          <div className="media-card-grid">
            {MEDIA_LINKS.map((m) => (
              <Link key={m.to} to={m.to} className="media-card r-up">
                <div className="media-card-num">{m.num}</div>
                <h3>{m.title}</h3>
                <p>{m.desc}</p>
                <div className="media-card-foot"><span>Media</span><span className="more">Open →</span></div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section" style={{ background: "var(--base)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Listen</div>
          <h2 className="r-up">The MUTIS podcast</h2>
          <p className="lede r-up" style={{ marginBottom: 32 }}>{PODCAST_INTRO}</p>
          <SpotifyEmbedCard settings={settings} isLoading={isLoading} />
        </div>
      </section>
    </>
  );
}
