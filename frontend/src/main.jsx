import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SavingsApp } from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SavingsApp />
  </StrictMode>,
);
