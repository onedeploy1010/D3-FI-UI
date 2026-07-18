import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Stale-chunk recovery: after a new deploy, Cloudflare serves freshly-hashed JS
// chunks and the old ones (referenced by an already-open tab) 404. A lazy route
// import then throws "Failed to fetch dynamically imported module" and the page
// (e.g. 交易管理) breaks. Vite fires `vite:preloadError` for exactly this — reload
// once to pull the fresh manifest. A short-lived sessionStorage stamp guards
// against a reload loop if the failure is not actually a stale chunk.
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "d3admin:preload-reload-at";
  const last = Number(sessionStorage.getItem(KEY) ?? 0);
  if (Date.now() - last < 10_000) return; // already tried very recently — don't loop
  sessionStorage.setItem(KEY, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
