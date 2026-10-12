import { clock } from "@/lib/format";

/** Informacja, że widzimy kopię z pamięci telefonu, a świeże dane są w drodze. */
export function StaleNote({ stale, updatedAt, refreshing }: { stale: boolean; updatedAt: number | null; refreshing: boolean }) {
  if (!stale || !updatedAt) return null;
  return (
    <p className="stale-note" role="status">
      {refreshing ? "Odświeżanie…" : "Zapisane dane"} · stan z {clock(updatedAt)}
    </p>
  );
}
