import { Link } from "react-router";

export function TagChips({ tags }: { tags: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
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
