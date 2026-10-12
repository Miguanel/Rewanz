import { type ChangeEvent, useState } from "react";
import { navigate, useLocation } from "@/app/router";
import { api, ApiError } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { useBackend, wakeBackend } from "@/lib/backend";
import { flushOutbox } from "@/lib/outbox";
import type { UserPrivate } from "@/lib/types";

interface TokenOut {
  access_token: string;
  user: UserPrivate;
}

export default function LoginPage() {
  const { search } = useLocation();
  const next = search.get("next") || "/";
  const backend = useBackend();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ login: "", username: "", email: "", password: "", display_name: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // logowanie wymaga serwera – jeśli śpi, najpierw go budzimy (pasek u góry pokazuje postęp)
      if (backend.status !== "online") await wakeBackend();
      const res =
        mode === "login"
          ? await api<TokenOut>("/auth/login", { method: "POST", body: { login: form.login, password: form.password }, timeoutMs: 60000 })
          : await api<TokenOut>("/auth/register", {
              method: "POST",
              body: { username: form.username, email: form.email, password: form.password, display_name: form.display_name },
              timeoutMs: 60000,
            });
      setSession(res.access_token, res.user);
      void flushOutbox();
      navigate(next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true });
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const waking = busy && backend.status === "waking";

  return (
    <div className="page narrow">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === "login"} className={`tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>
          Logowanie
        </button>
        <button role="tab" aria-selected={mode === "register"} className={`tab ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>
          Załóż konto
        </button>
      </div>
      <form
        className="form card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === "login" ? (
          <label>
            Nazwa użytkownika lub e-mail
            <input value={form.login} onChange={set("login")} autoComplete="username" autoCapitalize="none" required />
          </label>
        ) : (
          <>
            <label>
              Nazwa użytkownika
              <input value={form.username} onChange={set("username")} autoComplete="username" autoCapitalize="none" pattern="[a-zA-Z0-9_.\-]{3,32}" title="3–32 znaki: litery, cyfry, _ . -" required />
            </label>
            <label>
              Wyświetlana nazwa
              <input value={form.display_name} onChange={set("display_name")} autoComplete="nickname" maxLength={64} />
            </label>
            <label>
              E-mail
              <input type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
            </label>
          </>
        )}
        <label>
          Hasło
          <input
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={mode === "register" ? 8 : undefined}
            required
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {waking ? "Czekam na serwer…" : busy ? "Chwileczkę…" : mode === "login" ? "Zaloguj się" : "Utwórz konto"}
        </button>
        {mode === "login" && <p className="muted small">Konto demo: <code>demo</code> / <code>demo12345</code></p>}
      </form>
    </div>
  );
}
