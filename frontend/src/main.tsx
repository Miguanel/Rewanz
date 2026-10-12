import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { initBackend } from "@/lib/backend";
import { initOutbox } from "@/lib/outbox";
import { pruneCache } from "@/lib/query";
import "./styles.css";

void initBackend();
void initOutbox();
setTimeout(() => void pruneCache(), 10000);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Nowa wersja aplikacji: aktywuj od razu i przeładuj przy następnej nawigacji
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent("rewanz:update", { detail: () => w.postMessage("SKIP_WAITING") }));
          }
        });
      });
    }).catch(() => undefined);
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
