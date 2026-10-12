import { useEffect, useState } from "react";
import { useBackend, wakeBackend } from "@/lib/backend";

/** Pasek stanu połączenia. Pojawia się dopiero po ~1.2 s budzenia,
 *  żeby przy szybkim backendzie nic nie mrugało. */
export function ConnectionBanner() {
  const { status, wakeStartedAt } = useBackend();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (status !== "waking") return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [status]);

  if (status === "offline")
    return (
      <div className="banner banner-offline" role="status">
        Jesteś offline – widzisz zapisane dane, a Twoje wpisy wyślemy po powrocie sieci.
      </div>
    );

  if (status === "down")
    return (
      <div className="banner banner-down" role="alert">
        Serwer nie odpowiada.
        <button className="btn btn-small" onClick={() => void wakeBackend()}>Spróbuj ponownie</button>
      </div>
    );

  if (status === "waking" && wakeStartedAt) {
    const elapsed = (now - wakeStartedAt) / 1000;
    if (elapsed < 1.2) return null;
    // Typowy cold start Render free: 30–60 s. Pasek postępu jest szacunkowy.
    const pct = Math.min(95, Math.round((elapsed / 50) * 100));
    return (
      <div className="banner banner-waking" role="status" aria-live="polite">
        <div className="banner-row">
          <span className="pulse" aria-hidden="true" />
          <span>
            Budzimy serwer ({Math.round(elapsed)} s). Możesz przeglądać zapisane wątki i pisać –
            wyślemy wszystko, gdy wstanie.
          </span>
        </div>
        <div className="progress" aria-hidden="true">
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }
  return null;
}
