import { Link } from "@/app/router";

export function TagList({ tags, onClick }: { tags: string[]; onClick?: (t: string) => void }) {
  if (!tags.length) return null;
  return (
    <ul className="tags">
      {tags.map((t) => (
        <li key={t}>
          {onClick ? (
            <button type="button" className="tag" onClick={() => onClick(t)}>{t}</button>
          ) : (
            <Link className="tag" to={`/search?tags=${encodeURIComponent(t)}`}>{t}</Link>
          )}
        </li>
      ))}
    </ul>
  );
}
