import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SavingsApp } from "./App.jsx";
import "./styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).then((registration) => {
      registration.update().catch(() => {});
      window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    }).catch((error) => console.warn("Clara PWA:", error));
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SavingsApp />
  </StrictMode>,
);
