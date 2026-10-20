import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./admin.css";

// The theme before the first paint (no inline script: the CSP forbids one).
try {
  const t = localStorage.getItem("dexora-admin-theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch { /* storage blocked: night, the default */ }

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
