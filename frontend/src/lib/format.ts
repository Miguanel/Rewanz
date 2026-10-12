/** Daty z SQLite przychodzą bez strefy – traktujemy je jako UTC. */
export function parseDate(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

const rtf = new Intl.RelativeTimeFormat("pl", { numeric: "auto" });

export function timeAgo(input: string | number): string {
  const d = typeof input === "number" ? new Date(input) : parseDate(input);
  const sec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(sec);
  if (abs < 45) return "przed chwilą";
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(sec / 86400), "day");
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

export function compact(n: number): string {
  if (Math.abs(n) < 1000) return String(n);
  return new Intl.NumberFormat("pl-PL", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** Polska odmiana: 1 odpowiedź, 2 odpowiedzi, 5 odpowiedzi */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

export const STATUS_LABEL: Record<string, string> = {
  open: "otwarty",
  solved: "rozwiązany",
  closed: "zamknięty",
};
