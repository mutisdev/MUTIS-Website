import type { CSSProperties } from "react";
import { sanitizeSpotifyEmbedHtml } from "@/lib/spotifyEmbed";
import type { PodcastEpisode } from "@/app/hooks/usePodcastEpisodes";

interface SpotifyEmbedCardProps {
  episode: PodcastEpisode;
  /** Slot position, 1-based — shown as the episode's number. */
  slot: number;
}

export function SpotifyEmbedCard({ episode, slot }: SpotifyEmbedCardProps) {
  return (
    <div className="spotify-embed r-up">
      <div className="spotify-embed-head">
        <span className="spotify-embed-num">{String(slot).padStart(2, "0")}</span>
        {episode.embed_title && <span className="spotify-embed-title">{episode.embed_title}</span>}
      </div>
      {episode.embed_html && (
        <div
          className="spotify-embed-frame"
          style={{ "--embed-ratio": `${episode.embed_width ?? 624} / ${episode.embed_height ?? 351}` } as CSSProperties}
          dangerouslySetInnerHTML={{ __html: sanitizeSpotifyEmbedHtml(episode.embed_html) }}
        />
      )}
      <a href={episode.spotify_url} target="_blank" rel="noreferrer" className="spotify-embed-fallback">
        Open in Spotify →
      </a>
    </div>
  );
}

interface SpotifyEmbedListProps {
  episodes: PodcastEpisode[];
  isLoading?: boolean;
}

export function SpotifyEmbedList({ episodes, isLoading }: SpotifyEmbedListProps) {
  if (isLoading) {
    return <p className="lede r-up" role="status">Loading podcast…</p>;
  }

  if (episodes.length === 0) {
    return (
      <p className="lede r-up">
        Our podcast is launching soon. Once it&apos;s live, you&apos;ll be able to stream every episode
        right here.
      </p>
    );
  }

  return (
    <div className="spotify-embed-list">
      {episodes.map((episode, index) => (
        <SpotifyEmbedCard key={episode.id} episode={episode} slot={index + 1} />
      ))}
    </div>
  );
}
