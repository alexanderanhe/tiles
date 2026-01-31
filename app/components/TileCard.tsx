import { Link, useLocation } from "react-router";
import type { Tile } from "../lib/types";
import { slugify } from "../lib/slug";

export function TileCard({
  tile,
  previewUrl,
  ownerHandle,
}: {
  tile: Tile;
  previewUrl?: string;
  ownerHandle?: string;
}) {
  const previewSrc = previewUrl ?? "";
  const location = useLocation();
  const slug = slugify(tile.title ?? "");
  const handle = ownerHandle ?? tile.ownerId;
  const tileUrl = `/u/${handle}/${tile._id}${slug ? `-${slug}` : ""}`;
  const isHome = location.pathname === "/";

  return (
    <Link
      to={tileUrl}
      state={isHome ? { backgroundLocation: location } : undefined}
      className="tile-card"
    >
      <div className="tile-card__image">
        {previewSrc ? (
          <img src={previewSrc} alt={tile.title} loading="lazy" />
        ) : (
          <div className="tile-card__placeholder">Processing...</div>
        )}
        <div className="tile-card__overlay">
          <h3>{tile.title}</h3>
          <p>{tile.tags.slice(0, 3).join(" · ")}</p>
        </div>
      </div>
      <div className="tile-card__meta">
        <h3>{tile.title}</h3>
        <p>{tile.tags.slice(0, 3).join(" · ")}</p>
      </div>
    </Link>
  );
}
