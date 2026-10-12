import { useEffect, useRef, useState } from "react";
import { navigate } from "@/app/router";
import { useAuth } from "@/lib/auth";
import { enqueue, uuid } from "@/lib/outbox";

const DRAFT_KEY = (problemId: number, parentId: number | null) => `rewanz.draft.${problemId}.${parentId ?? "root"}`;

/** Formularz odpowiedzi. Szkic zapisuje się na bieżąco (telefon może zamknąć kartę),
 *  a wysyłka idzie przez kolejkę – działa także, gdy serwer jeszcze się budzi. */
export function Composer({
  problemId,
  parentId = null,
  autoFocus,
  onDone,
  placeholder = "Twoja odpowiedź…",
}: {
  problemId: number;
  parentId?: number | null;
  autoFocus?: boolean;
  onDone?: () => void;
  placeholder?: string;
}) {
  const { user } = useAuth();
  const key = DRAFT_KEY(problemId, parentId);
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (text) localStorage.setItem(key, text);
        else localStorage.removeItem(key);
      } catch {
        /* ignoruj */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [text, key]);

  if (!user)
    return (
      <div className="composer composer-login">
        <button className="btn" onClick={() => navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`)}>
          Zaloguj się, aby odpowiedzieć
        </button>
      </div>
    );

  const submit = () => {
    const body = text.trim();
    if (body.length < 2) return;
    const id = uuid();
    enqueue({
      id,
      kind: "answer",
      method: "POST",
      path: `/problems/${problemId}/answers`,
      body: { body, parent_id: parentId, client_id: id },
      meta: { problem_id: problemId, parent_id: parentId, author: user.username, display_name: user.display_name },
      invalidates: [`/problems/${problemId}/`, `/problems/${problemId}`, "/problems?", "/answers/"],
    });
    setText("");
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignoruj */
    }
    onDone?.();
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={parentId ? 3 : 5}
        maxLength={20000}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
        }}
      />
      <div className="composer-actions">
        {onDone && (
          <button type="button" className="btn btn-ghost btn-small" onClick={onDone}>Anuluj</button>
        )}
        <button type="submit" className="btn btn-primary btn-small" disabled={text.trim().length < 2}>
          {parentId ? "Odpowiedz" : "Opublikuj odpowiedź"}
        </button>
      </div>
    </form>
  );
}
