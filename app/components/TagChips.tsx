import { Link } from "react-router";

export function TagChips({ tags }: { tags: string[] }) {
  const cleanTags = Array.from(
    new Map(
      (tags ?? [])
        .map((tag) => String(tag ?? "").trim())
        .filter(Boolean)
        .map((tag) => [tag.toLowerCase(), tag] as const)
    ).values()
  );

  return (
    <div className="flex flex-wrap gap-2">
      {cleanTags.map((tag) => (
        <Link
          key={tag}
          to={`/?tags=${encodeURIComponent(tag)}`}
          className="chip"
        >
          {tag}
        </Link>
      ))}
    </div>
  );
}
