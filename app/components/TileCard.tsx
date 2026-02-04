import { Link, useLocation } from "react-router";
import type { Tile } from "../lib/types";
import { slugify } from "../lib/slug";

export function TileCard({
  tile,
  previewUrl,
  ownerHandle,
  authorName,
  to,
  modalFromCurrentLocation = false,
}: {
  tile: Tile;
  previewUrl?: string;
  ownerHandle?: string;
  authorName?: string;
  to?: string;
  modalFromCurrentLocation?: boolean;
}) {
  const previewSrc = previewUrl ?? "";
  const location = useLocation();
  const slug = slugify(tile.title ?? "");
  const handle = ownerHandle ?? tile.ownerId;
  const tileUrl = to ?? `/u/${handle}/${tile._id}${slug ? `-${slug}` : ""}`;
  const state = modalFromCurrentLocation
    ? { backgroundLocation: location }
    : undefined;
  return (
    <Link
      to={tileUrl}
      state={state}
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
          {authorName ? <p className="tile-card__author">{authorName}</p> : null}
        </div>
      </div>
      <div className="tile-card__meta">
        <h3>{tile.title}</h3>
        {authorName ? <p className="tile-card__author">{authorName}</p> : null}
      </div>
    </Link>
  );
}
