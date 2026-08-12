import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { institutionsForType } from "./institutions.js";

const EMPTY_DATA = {
  accounts: [],
  categories: [],
  transactions: [],
  goals: [],
  summary: {
    totalBalance: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    budgetTotal: 0,
    budgetAvailable: 0,
  },
};

const navItems = [
  { id: "inicio", label: "Inicio", icon: "home" },
  { id: "movimientos", label: "Movimientos", icon: "activity" },
  { id: "presupuesto", label: "Presupuesto", icon: "budget" },
  { id: "metas", label: "Metas", icon: "target" },
  { id: "cuentas", label: "Cuentas", icon: "wallet" },
];

const iconPaths = {
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5", "M9 21v-7h6v7"],
  activity: ["M3 12h4l2.5-6 5 12 2.5-6H21"],
  budget: ["M4 5h16v14H4z", "M8 9h8", "M8 13h4", "M16 13h.01"],
  target: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z", "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"],
  wallet: ["M20 7V6a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v10H5a3 3 0 0 1-3-3V7", "M16 14h2"],
  settings: ["M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z", "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 3.68-.08-.02a1.7 1.7 0 0 0-1.79.29l-.48.28a1.7 1.7 0 0 0-.85 1.7V23H10v-.13a1.7 1.7 0 0 0-.85-1.7l-.48-.28a1.7 1.7 0 0 0-1.79-.29l-.08.02-2.12-3.68.06-.06A1.7 1.7 0 0 0 5.08 15l-.28-.48a1.7 1.7 0 0 0-1.5-.86H3V9.34h.3a1.7 1.7 0 0 0 1.5-.86L5.08 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.8 2.38l.08.02a1.7 1.7 0 0 0 1.79-.29l.48-.28A1.7 1.7 0 0 0 10 0.13V0h4v.13a1.7 1.7 0 0 0 .85 1.7l.48.28a1.7 1.7 0 0 0 1.79.29l.08-.02 2.12 3.68-.06.06A1.7 1.7 0 0 0 18.92 8l.28.48a1.7 1.7 0 0 0 1.5.86h.3v4.32h-.3a1.7 1.7 0 0 0-1.5.86Z"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  transfer: ["M7 7h11l-3-3", "M17 17H6l3 3", "M18 7l-3 3", "M6 17l3-3"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  eyeOff: ["m3 3 18 18", "M10.6 10.6A2 2 0 0 0 13.4 13.4", "M9.9 4.24A10.2 10.2 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.1 3.1", "M6.7 6.7C3.7 8.6 2 12 2 12s3.5 8 10 8c1.7 0 3.2-.4 4.5-1"],
  sparkles: ["m12 3 1.2 3.2L16.5 7.5l-3.3 1.3L12 12l-1.2-3.2-3.3-1.3 3.3-1.3L12 3Z", "m19 14 .8 2.2 2.2.8-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z"],
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 15H6L5 6", "M10 11v6", "M14 11v6"],
  chevronRight: ["m9 18 6-6-6-6"],
  search: ["M21 21l-4.35-4.35", "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z"],
  check: ["m5 12 4 4L19 6"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z", "m9 12 2 2 4-4"],
  user: ["M20 21a8 8 0 0 0-16 0", "M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"],
  calendar: ["M3 5h18v16H3z", "M7 3v4", "M17 3v4", "M3 10h18"],
  briefcase: ["M3 7h18v13H3z", "M8 7V4h8v3", "M3 12h18"],
  phone: ["M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"],
  building: ["M3 21h18", "M6 21V8l6-4 6 4v13", "M9 11h.01", "M12 11h.01", "M15 11h.01", "M9 15h.01", "M12 15h.01", "M15 15h.01"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 6v6l4 2"],
  coins: ["M8 6c0 1.1-1.79 2-4 2S0 7.1 0 6s1.79-2 4-2 4 .9 4 2Z", "M0 6v4c0 1.1 1.79 2 4 2 1.09 0 2.07-.22 2.79-.58", "M16 14c0 1.1-1.79 2-4 2s-4-.9-4-2 1.79-2 4-2 4 .9 4 2Z", "M8 14v4c0 1.1 1.79 2 4 2s4-.9 4-2v-4", "M24 8c0 1.1-1.79 2-4 2s-4-.9-4-2 1.79-2 4-2 4 .9 4 2Z", "M16 8v4c0 .52.4 1 1.05 1.36"],
  pulse: ["M3 12h4l2-5 4 10 2-5h6"],
  chart: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20V8"],
  info: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 10v6", "M12 7h.01"],
  logout: ["M10 17l5-5-5-5", "M15 12H3", "M21 19V5a2 2 0 0 0-2-2h-6"],
  arrowRight: ["M5 12h14", "m13 6 6 6-6 6"],
  refresh: ["M20 11a8 8 0 1 0-2.34 5.66", "M20 4v7h-7"],
};

function Icon({ name, size = 18, strokeWidth = 1.8, className = "" }) {
  const paths = iconPaths[name] || iconPaths.info;
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((path, index) => <path d={path} key={`${name}-${index}`} />)}
  </svg>;
}

function Brand({ compact = false }) {
  return <span className={compact ? "brand-lockup compact" : "brand-lockup"}>
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    <span className="brand-name">clara</span>
  </span>;
}

function DeveloperMark({ dark = false }) {
  return <div className={dark ? "developer-mark dark" : "developer-mark"}>
    <span>Diseñado y desarrollado por</span>
    <img src="/codex413.png" alt="CODEX413" />
  </div>;
}

const currencyOptions = [
  { code: "DOP", label: "Peso dominicano", symbol: "RD$", locale: "es-DO" },
  { code: "USD", label: "Dólar estadounidense", symbol: "US$", locale: "es-US" },
  { code: "EUR", label: "Euro", symbol: "€", locale: "es-ES" },
  { code: "GBP", label: "Libra esterlina", symbol: "£", locale: "es-GB" },
  { code: "MXN", label: "Peso mexicano", symbol: "MX$", locale: "es-MX" },
  { code: "COP", label: "Peso colombiano", symbol: "COL$", locale: "es-CO" },
  { code: "PEN", label: "Sol peruano", symbol: "S/", locale: "es-PE" },
  { code: "BOB", label: "Boliviano", symbol: "Bs", locale: "es-BO" },
];

const TOKEN_KEY = "clara_session";
const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const MoneyContext = createContext({
  money: () => "0,00",
  shortMoney: () => "0",
  currencySymbol: "RD$",
  currencyCode: "DOP",
});

function currencyInfo(code) {
  return currencyOptions.find((option) => option.code === code) || currencyOptions[0];
}

function formatMoney(cents, code) {
  const option = currencyInfo(code);
  const amount = Number(cents || 0) / 100;
  return `${option.symbol} ${amount.toLocaleString(option.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatShortMoney(cents, code) {
  const option = currencyInfo(code);
  const amount = Number(cents || 0) / 100;
  if (Math.abs(amount) >= 1_000_000) return `${option.symbol} ${(amount / 1_000_000).toFixed(1)} M`;
  if (Math.abs(amount) >= 1_000) return `${option.symbol} ${(amount / 1_000).toFixed(1)} mil`;
  return `${option.symbol} ${amount.toFixed(0)}`;
}

function useMoney() {
  return useContext(MoneyContext);
}

function prettyDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "short" }).format(date).replace(".", "");
}

function longDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function percentage(value, total) {
  if (!total) return 0;
  return Math.min(Math.round((value / total) * 100), 100);
}

function todayIso() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function todayLabel() {
  return new Intl.DateTimeFormat("es-DO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function currentMonthLabel() {
  const label = new Intl.DateTimeFormat("es-DO", { month: "long", year: "numeric" }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthName() {
  const label = new Intl.DateTimeFormat("es-DO", { month: "long" }).format(new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function chartLabels() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const month = new Intl.DateTimeFormat("es-DO", { month: "short" }).format(now).replace(".", "");
  return [1, 8, 15, 22, lastDay].map((day) => `${Math.min(day, lastDay)} ${month}`);
}

function buildFlowBars(transactions) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const totals = Array.from({ length: 14 }, () => 0);

  transactions.forEach((transaction) => {
    if (!String(transaction.transactionDate || "").startsWith(month)) return;
    const day = Number(String(transaction.transactionDate).slice(8, 10));
    if (!day) return;
    const index = Math.min(13, Math.floor(((day - 1) / lastDay) * 14));
    totals[index] += Number(transaction.amount || 0);
  });

  const max = Math.max(...totals, 0);
  const lastActive = totals.reduce((found, amount, index) => (amount > 0 ? index : found), -1);
  return {
    hasActivity: max > 0,
    bars: totals.map((amount, index) => ({
      height: max ? Math.max(8, Math.round((amount / max) * 100)) : 0,
      highlight: index === lastActive,
    })),
  };
}

function initials(name) {
  const parts = String(name || "U").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

async function apiRequest(path, options = {}, token = "") {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 204) return { response, result: null };

  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  return { response, result };
}

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForBackend() {
  let lastError = null;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) return;
      lastError = new Error("El servidor todavía no responde.");
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timeout);
    }
    if (attempt < 10) await sleep(2_500);
  }
  throw lastError || new Error("No se pudo iniciar el servidor de Clara.");
}

function LoadingScreen() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="loading-screen">
    <div className="loading-panel">
      <img className="loading-gif" src="/clara-loading.gif" alt="Clara está cargando" />
      <div className="loading-brand">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <strong>clara</strong>
      </div>
      <h1>{seconds < 8 ? "Preparando tu espacio…" : "Estamos iniciando el servidor…"}</h1>
      <p>
        {seconds < 8
          ? "Conectando de forma segura con tus datos."
          : "El servidor de Render puede tardar unos segundos en despertar cuando estuvo inactivo. No tienes que recargar la página."}
      </p>
      <span className="loading-line" aria-hidden="true" />
    </div>
  </div>;
}

function usernamePreview(firstName, lastName) {
  const clean = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const first = clean(firstName);
  const last = clean(lastName);
  if (!first && !last) return "tuusuario";
  return `${first.charAt(0)}${last}` || first || last;
}

function productLabel(value) {
  return {
    payroll: "Cuenta de nómina",
    savings: "Cuenta de ahorros",
    checking: "Cuenta corriente",
    certificate: "Certificado",
    contribution: "Aportaciones",
    wallet: "Billetera digital",
    investment: "Cuenta de inversión",
    cash: "Efectivo",
    other: "Cuenta",
  }[value] || "Cuenta";
}

function institutionTypeLabel(value) {
  return {
    bank: "Banco",
    cooperative: "Cooperativa",
    association: "Asociación de ahorros y préstamos",
    wallet: "Billetera digital",
    investment: "Inversión",
    cash: "Efectivo",
    other: "Otra institución",
  }[value] || "Institución";
}

function accountSubtitle(account) {
  const parts = [];
  if (account.nickname) parts.push(account.nickname);
  if (account.institutionType) parts.push(institutionTypeLabel(account.institutionType));
  return parts.join(" · ") || (account.kind === "cash" ? "Dinero físico" : account.kind === "savings" ? "Ahorros" : "Cuenta financiera");
}

function financialPulse(profile = {}) {
  const income = Number(profile.incomeAmount || 0);
  const fixed = Number(profile.fixedExpenses || 0);
  const debtPayment = Number(profile.debtMonthlyPayment || 0);
  const emergency = Number(profile.emergencySavings || 0);
  const savingsTarget = Number(profile.savingsTargetPercent || 0);
  let score = 45;

  if (income > 0) {
    const fixedRatio = fixed / income;
    const debtRatio = debtPayment / income;
    score += fixedRatio <= 0.5 ? 15 : fixedRatio <= 0.7 ? 7 : -7;
    score += debtRatio <= 0.2 ? 10 : debtRatio <= 0.35 ? 4 : -8;
  }
  score += savingsTarget >= 20 ? 15 : savingsTarget >= 10 ? 9 : savingsTarget > 0 ? 4 : 0;
  const emergencyTarget = fixed * 3;
  if (emergencyTarget > 0) {
    const coverage = emergency / emergencyTarget;
    score += coverage >= 1 ? 15 : coverage >= 0.33 ? 8 : coverage > 0 ? 3 : 0;
  }
  score += Number(profile.financialConfidence || 3) >= 4 ? 4 : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let label = "En construcción";
  if (score >= 80) label = "Muy organizado";
  else if (score >= 65) label = "Buen rumbo";
  else if (score >= 50) label = "Tomando control";

  let recommendation = "Registra tus gastos fijos y define un ahorro pequeño que puedas repetir.";
  if (income > 0 && debtPayment / income > 0.35) recommendation = "Tu próxima prioridad puede ser reducir la presión mensual de las deudas.";
  else if (emergencyTarget > 0 && emergency < emergencyTarget) recommendation = `Construye poco a poco un fondo de emergencia de 3 meses de gastos fijos.`;
  else if (savingsTarget < 10) recommendation = "Prueba separar al menos un 10% cuando recibas ingresos, si tu realidad lo permite.";
  else if (score >= 80) recommendation = "Tu base se ve sólida. Convierte tus metas grandes en aportes automáticos por período.";

  return { score, label, recommendation, emergencyTarget };
}

function nextPaydayLabel(profile = {}) {
  if (profile.incomeFrequency === "irregular") return "Ingreso sin fecha fija";
  const days = [Number(profile.paydayOne), Number(profile.paydayTwo)].filter((day) => day >= 1 && day <= 31);
  if (!days.length) return "Fecha de cobro pendiente";
  const now = new Date();
  const candidates = [];
  for (let monthOffset = 0; monthOffset < 2; monthOffset += 1) {
    const base = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    for (const day of days) {
      const candidate = new Date(base.getFullYear(), base.getMonth(), Math.min(day, lastDay), 12);
      if (candidate >= now) candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => a - b);
  if (!candidates[0]) return "Fecha de cobro pendiente";
  return new Intl.DateTimeFormat("es-DO", { weekday: "short", day: "numeric", month: "short" }).format(candidates[0]).replace(/\./g, "");
}

function AuthScreen({ registrationEnabled, onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [registerIdentity, setRegisterIdentity] = useState({ firstName: "", lastName: "" });
  const isRegister = mode === "register";
  const preview = usernamePreview(registerIdentity.firstName, registerIdentity.lastName);

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    const payload = Object.fromEntries(fields.entries());

    if (isRegister && payload.password !== payload.confirmPassword) {
      setError("Las contraseñas no coinciden.");
      setSaving(false);
      return;
    }
    delete payload.confirmPassword;

    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const { response, result } = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!response.ok || !result?.token || !result?.user) {
        throw new Error(result?.error || (isRegister ? "No se pudo crear la cuenta." : "No se pudo iniciar sesión."));
      }
      onAuthenticated(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo completar el acceso.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="auth-shell premium-auth">
    <section className="auth-visual">
      <div className="auth-brand"><Brand /></div>
      <div className="auth-message">
        <span className="auth-kicker-line"><Icon name="shield" size={16} /> Finanzas personales privadas</span>
        <h1>Más claridad para cada decisión.</h1>
        <p>Clara organiza cuentas, gastos, metas y prioridades en un espacio independiente para cada persona, desde cualquier dispositivo.</p>
      </div>
      <div className="auth-points">
        <span><i><Icon name="user" size={16} /></i><strong>Un perfil realmente tuyo</strong><small>Tus cuentas y movimientos nunca se mezclan con otros usuarios.</small></span>
        <span><i><Icon name="chart" size={16} /></i><strong>Plan según tu realidad</strong><small>Clara aprende cómo recibes ingresos y cómo prefieres organizarte.</small></span>
        <span><i><Icon name="shield" size={16} /></i><strong>Acceso protegido</strong><small>La información financiera requiere una sesión válida.</small></span>
      </div>
      <DeveloperMark dark />
    </section>

    <section className="auth-form-area">
      <div className="auth-card premium-card">
        <div className="mobile-auth-brand"><Brand /></div>
        {registrationEnabled && <div className="auth-switch" role="tablist" aria-label="Acceso a Clara">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Iniciar sesión</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Crear cuenta</button>
        </div>}

        <p className="eyebrow">{isRegister ? "Nuevo perfil" : "Acceso seguro"}</p>
        <h2>{isRegister ? "Empieza con Clara" : "Bienvenido de nuevo"}</h2>
        <p className="auth-description">
          {isRegister
            ? "Tu usuario se genera automáticamente y tus datos comienzan totalmente separados de los demás."
            : "Entra a tu espacio personal para continuar organizando tu dinero."}
        </p>

        <form onSubmit={submit}>
          {isRegister && <div className="form-grid auth-name-grid">
            <label><span>Nombre</span><input name="firstName" autoComplete="given-name" required autoFocus placeholder="Ej. Engels" value={registerIdentity.firstName} onChange={(event) => setRegisterIdentity((current) => ({ ...current, firstName: event.target.value }))} /></label>
            <label><span>Apellido</span><input name="lastName" autoComplete="family-name" required placeholder="Ej. García" value={registerIdentity.lastName} onChange={(event) => setRegisterIdentity((current) => ({ ...current, lastName: event.target.value }))} /></label>
          </div>}

          {isRegister && <label>
            <span>Número de teléfono</span>
            <div className="input-with-icon"><Icon name="phone" size={16} /><input type="tel" name="phone" autoComplete="tel" inputMode="tel" required placeholder="Ej. (809) 555-1234" /></div>
            <small className="field-help">Formará parte de tu perfil y más adelante servirá para recuperación y avisos de seguridad.</small>
          </label>}

          {isRegister ? <div className="generated-user">
            <span><Icon name="user" size={16} /> Tu usuario</span>
            <strong>@{preview}</strong>
            <small>Si ya existe, Clara añadirá un número automáticamente.</small>
          </div> : <label>
            <span>Usuario</span>
            <input name="username" autoComplete="username" required autoFocus placeholder="Ej. egarcia" />
          </label>}

          {isRegister && <label>
            <span>Moneda principal</span>
            <select name="currencyCode" defaultValue="DOP">
              {currencyOptions.map((option) => <option key={option.code} value={option.code}>{option.label} ({option.symbol})</option>)}
            </select>
          </label>}
          <label>
            <span>Contraseña</span>
            <input type="password" name="password" autoComplete={isRegister ? "new-password" : "current-password"} minLength="8" required placeholder="Mínimo 8 caracteres" />
          </label>
          {isRegister && <label>
            <span>Confirmar contraseña</span>
            <input type="password" name="confirmPassword" autoComplete="new-password" minLength="8" required placeholder="Repite la contraseña" />
          </label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-action auth-submit" type="submit" disabled={saving}>
            {saving ? "Procesando…" : isRegister ? "Crear mi cuenta" : "Iniciar sesión"}
            {!saving && <Icon name="arrowRight" size={16} />}
          </button>
        </form>
        <div className="auth-security-note"><Icon name="shield" size={15} /><span>Clara no muestra información financiera sin una sesión válida.</span></div>
        <div className="mobile-developer"><DeveloperMark /></div>
      </div>
    </section>
  </div>;
}

function OnboardingWizard({ user, saving, error, onSubmit, editing = false, onCancel = null }) {
  const profile = user?.profile || {};
  const [step, setStep] = useState(1);
  const [incomeType, setIncomeType] = useState(profile.incomeType || "fixed");
  const [incomeFrequency, setIncomeFrequency] = useState(profile.incomeFrequency || "biweekly");
  const [planningPeriod, setPlanningPeriod] = useState(profile.planningPeriod || "monthly");
  const { currencySymbol } = useMoney();

  function continueWizard(event) {
    const form = event.currentTarget.form;
    const fieldset = form?.querySelector(`fieldset[data-step="${step}"]`);
    const controls = fieldset ? [...fieldset.querySelectorAll("input, select, textarea")] : [];
    const invalid = controls.find((control) => !control.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    setStep((value) => Math.min(value + 1, 4));
  }

  const stepCopy = {
    1: {
      icon: "user",
      title: "Primero, conozcamos tu realidad.",
      text: "Clara no necesita saberlo todo. Solo algunos datos que cambian de verdad la forma en que conviene organizar tu dinero.",
    },
    2: {
      icon: "briefcase",
      title: "Ahora, cuéntanos cómo entra tu dinero.",
      text: "No importa si cobras nómina, trabajas por tu cuenta o tus ingresos cambian. Clara se adapta a tu ritmo.",
    },
    3: {
      icon: "coins",
      title: "Veamos tus compromisos y tu respaldo.",
      text: "Conocer gastos fijos, deudas y fondo disponible permite darte señales más útiles sin tratar un saldo inicial como un ingreso.",
    },
    4: {
      icon: "target",
      title: "Por último, dale dirección a tu dinero.",
      text: "Elige si piensas por mes o por quincena. Clara usará esto para mostrarte prioridades, próximos pasos y un pulso financiero personal.",
    },
  }[step];

  return <div className="onboarding-shell">
    <div className="onboarding-topbar"><Brand /><div className="onboarding-top-actions">{editing && onCancel && <button type="button" className="onboarding-exit" onClick={onCancel}><Icon name="close" size={15} /> Volver</button>}<DeveloperMark /></div></div>
    <main className="onboarding-wrap">
      <section className="onboarding-copy">
        <span className="onboarding-icon"><Icon name={stepCopy.icon} size={22} /></span>
        <p className="eyebrow">{editing ? "Perfil financiero" : "Configuración inicial"} · {step} de 4</p>
        <h1>{stepCopy.title}</h1>
        <p>{stepCopy.text}</p>
        <div className="onboarding-user"><span className="avatar">{initials(user.name)}</span><span><strong>{user.name}</strong><small>@{user.username} · {user.phone || "Perfil nuevo"}</small></span></div>
        <div className="onboarding-benefits">
          <span><Icon name="pulse" size={16} /><small>Pulso financiero Clara</small></span>
          <span><Icon name="clock" size={16} /><small>Próximo cobro estimado</small></span>
          <span><Icon name="target" size={16} /><small>Prioridad personalizada</small></span>
        </div>
      </section>

      <section className="onboarding-card">
        <div className="wizard-progress"><span style={{ width: `${step * 25}%` }} /></div>
        <form onSubmit={onSubmit}>
          <fieldset data-step="1" className={step === 1 ? "wizard-step active" : "wizard-step"} hidden={step !== 1}>
            <legend>Tu situación actual</legend>
            <div className="form-grid">
              <label><span>¿Cuántos años tienes?</span><input type="number" name="age" min="13" max="100" required placeholder="Ej. 25" defaultValue={profile.age ?? ""} /></label>
              <label><span>Personas que dependen de ti</span><input type="number" name="dependents" min="0" max="20" defaultValue={profile.dependents ?? 0} required /></label>
            </div>
            <label><span>¿Cuál describe mejor tu situación?</span><select name="employmentStatus" defaultValue={profile.employmentStatus || "employee"}><option value="employee">Empleado/a</option><option value="independent">Trabajo independiente / freelance</option><option value="entrepreneur">Tengo negocio o emprendimiento</option><option value="student">Estudiante</option><option value="unemployed">Actualmente sin empleo</option><option value="retired">Pensionado/a o retirado/a</option><option value="other">Otra situación</option></select></label>
            <label><span>¿Qué quieres mejorar primero?</span><select name="primaryGoal" defaultValue={profile.primaryGoal || "control"}><option value="control">Tener más control de mis gastos</option><option value="save">Ahorrar con más constancia</option><option value="emergency">Crear un fondo de emergencia</option><option value="debt">Salir de deudas</option><option value="purchase">Prepararme para una compra importante</option><option value="invest">Empezar a invertir</option></select></label>
            <label><span>¿Qué tan en control sientes hoy tus finanzas?</span><select name="financialConfidence" defaultValue={String(profile.financialConfidence || 3)}><option value="1">1 · Necesito empezar desde cero</option><option value="2">2 · Me cuesta mantener el control</option><option value="3">3 · Voy organizándome</option><option value="4">4 · Tengo bastante control</option><option value="5">5 · Me siento muy organizado/a</option></select></label>
          </fieldset>

          <fieldset data-step="2" className={step === 2 ? "wizard-step active" : "wizard-step"} hidden={step !== 2}>
            <legend>Tus ingresos</legend>
            <label><span>¿Cómo son tus ingresos?</span><select name="incomeType" value={incomeType} onChange={(event) => setIncomeType(event.target.value)}><option value="fixed">Tengo un ingreso fijo</option><option value="variable">Mis ingresos varían</option><option value="mixed">Tengo ingreso fijo y otros ingresos</option><option value="irregular">No tengo un ingreso fijo</option></select></label>
            <label><span>¿Cada cuánto sueles recibir dinero?</span><select name="incomeFrequency" value={incomeFrequency} onChange={(event) => setIncomeFrequency(event.target.value)}><option value="biweekly">Quincenalmente</option><option value="monthly">Mensualmente</option><option value="weekly">Semanalmente</option><option value="irregular">Sin una frecuencia fija</option></select></label>
            <label><span>{incomeType === "irregular" ? "Ingreso promedio estimado" : "Ingreso aproximado"}</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="incomeAmount" min="0" step="0.01" defaultValue={(Number(profile.incomeAmount || 0) / 100).toFixed(2)} /></div><small className="field-help">Es una referencia para tu plan; no se registra como un ingreso real.</small></label>
            <label><span>¿Recibes tu ingreso en una cuenta de nómina?</span><select name="hasPayrollAccount" defaultValue={profile.hasPayrollAccount ? "true" : "false"}><option value="true">Sí</option><option value="false">No</option></select></label>
            {incomeFrequency === "monthly" && <label><span>Día aproximado de cobro</span><input type="number" name="paydayOne" min="1" max="31" placeholder="Ej. 25" defaultValue={profile.paydayOne ?? ""} /></label>}
            {incomeFrequency === "biweekly" && <div className="form-grid"><label><span>Primera fecha de cobro</span><input type="number" name="paydayOne" min="1" max="31" placeholder="Ej. 15" defaultValue={profile.paydayOne ?? ""} /></label><label><span>Segunda fecha de cobro</span><input type="number" name="paydayTwo" min="1" max="31" placeholder="Ej. 30" defaultValue={profile.paydayTwo ?? ""} /></label></div>}
          </fieldset>

          <fieldset data-step="3" className={step === 3 ? "wizard-step active" : "wizard-step"} hidden={step !== 3}>
            <legend>Compromisos y seguridad</legend>
            <label><span>Gastos fijos aproximados al mes</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="fixedExpenses" min="0" step="0.01" defaultValue={(Number(profile.fixedExpenses || 0) / 100).toFixed(2)} /></div><small className="field-help">Alquiler, servicios, universidad, préstamos y otros pagos que casi siempre se repiten.</small></label>
            <div className="form-grid">
              <label><span>Deudas pendientes aproximadas</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="debtBalance" min="0" step="0.01" defaultValue={(Number(profile.debtBalance || 0) / 100).toFixed(2)} /></div></label>
              <label><span>Cuánto pagas de deuda al mes</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="debtMonthlyPayment" min="0" step="0.01" defaultValue={(Number(profile.debtMonthlyPayment || 0) / 100).toFixed(2)} /></div></label>
            </div>
            <label><span>Dinero que ya tienes como respaldo o emergencia</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="emergencySavings" min="0" step="0.01" defaultValue={(Number(profile.emergencySavings || 0) / 100).toFixed(2)} /></div><small className="field-help">Es solo una referencia para el diagnóstico. No aumenta el saldo de ninguna cuenta automáticamente.</small></label>
            <div className="wizard-summary"><Icon name="shield" size={17} /><span>Clara usará estos datos para orientarte, pero no los mezclará con tus movimientos ni inventará ingresos.</span></div>
          </fieldset>

          <fieldset data-step="4" className={step === 4 ? "wizard-step active" : "wizard-step"} hidden={step !== 4}>
            <legend>Tu manera de planificar</legend>
            <label><span>Prefiero organizarme</span><select name="planningPeriod" value={planningPeriod} onChange={(event) => setPlanningPeriod(event.target.value)}><option value="monthly">Por mes</option><option value="biweekly">Por quincena</option></select></label>
            <label><span>¿Qué porcentaje te gustaría ahorrar?</span><div className="percentage-field"><input type="number" name="savingsTargetPercent" min="0" max="100" defaultValue={profile.savingsTargetPercent ?? 10} /><span>%</span></div></label>
            <label><span>Propósito de tu {planningPeriod === "biweekly" ? "quincena" : "mes"}</span><textarea name="planPurpose" rows="4" maxLength="240" required defaultValue={profile.planPurpose || ""} placeholder="Ej. Cubrir mis gastos, guardar para mi vehículo y evitar compras impulsivas." /></label>
            <div className="wizard-wow-grid">
              <span><Icon name="pulse" size={18} /><strong>Índice Clara</strong><small>Una referencia personal de organización, no un score bancario.</small></span>
              <span><Icon name="clock" size={18} /><strong>Próximo cobro</strong><small>Clara podrá mostrar cuándo se acerca tu siguiente ingreso esperado.</small></span>
              <span><Icon name="shield" size={18} /><strong>Fondo recomendado</strong><small>Comparará tu respaldo con aproximadamente tres meses de gastos fijos.</small></span>
            </div>
          </fieldset>

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="wizard-actions">
            {step > 1 ? <button type="button" className="secondary-action" onClick={() => setStep((value) => value - 1)}>Atrás</button> : <span />}
            {step < 4 ? <button type="button" className="primary-action" onClick={continueWizard}>Continuar <Icon name="chevronRight" size={15} /></button> : <button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando tu perfil…" : <>{editing ? "Guardar perfil" : "Entrar a Clara"} <Icon name="arrowRight" size={15} /></>}</button>}
          </div>
        </form>
      </section>
    </main>
  </div>;
}

function SavingsApp() {
  const [activeView, setActiveView] = useState("inicio");
  const [data, setData] = useState(EMPTY_DATA);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showBalance, setShowBalance] = useState(true);
  const [search, setSearch] = useState("");
  const [transactionFilter, setTransactionFilter] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [profileWizardOpen, setProfileWizardOpen] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [auth, setAuth] = useState({ checking: true, registrationEnabled: true, user: null });

  const currencyCode = auth.user?.currencyCode || "DOP";
  const moneyTools = useMemo(() => ({
    currencyCode,
    currencySymbol: currencyInfo(currencyCode).symbol,
    money: (cents) => formatMoney(cents, currencyCode),
    shortMoney: (cents) => formatShortMoney(cents, currencyCode),
  }), [currencyCode]);

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setData(EMPTY_DATA);
    setAuth((current) => ({ ...current, checking: false, user: null }));
  }

  async function refresh(sessionToken = token) {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const { response, result } = await apiRequest("/api/finance", { cache: "no-store" }, sessionToken);
      if (response.status === 401) {
        clearSession();
        return;
      }
      if (!response.ok || !result?.data) throw new Error(result?.error || "No se pudieron cargar tus datos.");
      setData(result.data);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo conectar con tus datos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        await waitForBackend();
        if (!active) return;

        const { response: statusResponse, result: status } = await apiRequest("/api/auth/status", { cache: "no-store" });
        if (!statusResponse.ok) throw new Error(status?.error || "No se pudo conectar con Clara.");
        if (!active) return;

        const registrationEnabled = status?.registrationEnabled !== false;
        const storedToken = localStorage.getItem(TOKEN_KEY) || "";
        if (!storedToken) {
          setLoading(false);
          setAuth({ checking: false, registrationEnabled, user: null });
          return;
        }

        const { response: meResponse, result: meResult } = await apiRequest("/api/auth/me", { cache: "no-store" }, storedToken);
        if (!active) return;
        if (!meResponse.ok || !meResult?.user) {
          localStorage.removeItem(TOKEN_KEY);
          setToken("");
          setLoading(false);
          setAuth({ checking: false, registrationEnabled, user: null });
          return;
        }

        setToken(storedToken);
        setAuth({ checking: false, registrationEnabled, user: meResult.user });
        await refresh(storedToken);
      } catch (requestError) {
        if (!active) return;
        setLoading(false);
        setError(requestError instanceof Error ? requestError.message : "No se pudo conectar con Clara.");
        setAuth({ checking: false, registrationEnabled: true, user: null });
      }
    }
    void bootstrap();
    return () => { active = false; };
  }, []);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return data.transactions.filter((transaction) => {
      const matchesFilter = transactionFilter === "all" || transaction.type === transactionFilter;
      const matchesQuery = !query || `${transaction.description} ${transaction.categoryName ?? ""} ${transaction.accountName}`.toLocaleLowerCase("es").includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [data.transactions, search, transactionFilter]);

  function handleAuthenticated(session) {
    localStorage.setItem(TOKEN_KEY, session.token);
    setToken(session.token);
    setAuth((current) => ({ checking: false, registrationEnabled: current.registrationEnabled, user: session.user }));
    setError("");
    void refresh(session.token);
  }

  function openModal(kind, referenceId) {
    setError("");
    setNotice("");
    setModal({ kind, referenceId });
  }

  async function submitOperation(event) {
    event.preventDefault();
    if (!modal) return;
    setSaving(true);
    setError("");
    setNotice("");
    const fields = new FormData(event.currentTarget);
    const payload = Object.fromEntries(fields.entries());

    if (modal.kind === "expense" || modal.kind === "income") {
      payload.action = "transaction";
      payload.type = modal.kind;
    } else if (modal.kind === "goal-contribution") {
      payload.action = "goal-contribution";
      payload.goalId = modal.referenceId;
    } else {
      payload.action = modal.kind;
      if (modal.kind === "budget") payload.categoryId = modal.referenceId;
      if (modal.kind === "account-update" || modal.kind === "account-delete") payload.accountId = modal.referenceId;
    }

    try {
      if (modal.kind === "plan-purpose") {
        const { response, result } = await apiRequest("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({
            planningPeriod: payload.planningPeriod,
            planPurpose: payload.planPurpose,
          }),
        }, token);
        if (response.status === 401) { clearSession(); return; }
        if (!response.ok || !result?.user) throw new Error(result?.error || "No se pudo actualizar tu propósito.");
        setAuth((current) => ({ ...current, user: result.user }));
        setModal(null);
        setNotice("Tu propósito quedó actualizado.");
        window.setTimeout(() => setNotice(""), 3500);
        return;
      }

      const { response, result } = await apiRequest("/api/finance", {
        method: "POST",
        body: JSON.stringify(payload),
      }, token);
      if (response.status === 401) {
        clearSession();
        return;
      }
      if (!response.ok || !result?.data) throw new Error(result?.error || "No se pudo guardar la operación.");
      setData(result.data);
      setModal(null);
      setNotice("Listo, los cambios quedaron guardados.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la operación.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSettingsSaving(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    const currencyCode = fields.get("currencyCode");
    const phone = fields.get("phone");
    try {
      const { response, result } = await apiRequest("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ currencyCode, phone }),
      }, token);
      if (response.status === 401) {
        clearSession();
        return;
      }
      if (!response.ok || !result?.user) throw new Error(result?.error || "No se pudieron guardar las preferencias.");
      setAuth((current) => ({ ...current, user: result.user }));
      setSettingsOpen(false);
      setNotice("Preferencias actualizadas.");
      window.setTimeout(() => setNotice(""), 3000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron guardar las preferencias.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function finishOnboarding(event) {
    event.preventDefault();
    setOnboardingSaving(true);
    setError("");
    const fields = new FormData(event.currentTarget);
    const payload = Object.fromEntries(fields.entries());
    try {
      const { response, result } = await apiRequest("/api/profile/onboarding", {
        method: "POST",
        body: JSON.stringify(payload),
      }, token);
      if (response.status === 401) { clearSession(); return; }
      if (!response.ok || !result?.user) throw new Error(result?.error || "No se pudo guardar tu perfil financiero.");
      setAuth((current) => ({ ...current, user: result.user }));
      setProfileWizardOpen(false);
      setNotice("Clara ya conoce cómo quieres organizarte.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar tu perfil financiero.");
    } finally {
      setOnboardingSaving(false);
    }
  }

  async function logout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" }, token);
    } finally {
      setSettingsOpen(false);
      clearSession();
    }
  }

  if (auth.checking) return <LoadingScreen />;
  if (!auth.user) return <AuthScreen registrationEnabled={auth.registrationEnabled} onAuthenticated={handleAuthenticated} />;
  if (!auth.user.onboardingCompleted || profileWizardOpen) return <MoneyContext.Provider value={moneyTools}><OnboardingWizard user={auth.user} saving={onboardingSaving} error={error} onSubmit={finishOnboarding} editing={profileWizardOpen && auth.user.onboardingCompleted} onCancel={auth.user.onboardingCompleted ? () => { setProfileWizardOpen(false); setError(""); } : null} /></MoneyContext.Provider>;

  return <MoneyContext.Provider value={moneyTools}>
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActiveView("inicio")} aria-label="Ir al inicio"><Brand /></button>

        <nav className="side-nav" aria-label="Navegación principal">
          <p className="nav-label">Mi dinero</p>
          {navItems.map((item) => <button
            key={item.id}
            className={activeView === item.id ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView(item.id)}
          >
            <span className="nav-icon"><Icon name={item.icon} size={18} /></span>
            <span>{item.label}</span>
            {item.id === "movimientos" && <span className="nav-count">{data.transactions.length}</span>}
          </button>)}
        </nav>

        <div className="sidebar-tip">
          <span className="tip-icon"><Icon name="sparkles" size={17} /></span>
          <p>Consejo del mes</p>
          <strong>Registra primero tus ingresos y después decide cuánto quieres reservar.</strong>
          <button onClick={() => setActiveView("metas")}>Ver mis metas <Icon name="chevronRight" size={13} /></button>
        </div>

        <DeveloperMark dark />

        <button className="profile-chip profile-button" onClick={() => setSettingsOpen(true)} aria-label="Abrir preferencias">
          <span className="avatar">{initials(auth.user.name)}</span>
          <span>
            <strong>{auth.user.name}</strong>
            <small>{currencyInfo(currencyCode).label}</small>
          </span>
          <span className="profile-gear"><Icon name="settings" size={16} /></span>
        </button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">{todayLabel()}</p>
            <h1>{viewTitle(activeView)}</h1>
          </div>
          <div className="topbar-actions">
            <span className={loading ? "save-status loading" : "save-status"}>
              <i /> {loading ? "Sincronizando…" : "Todo guardado"}
            </span>
            <button className="primary-action" onClick={() => openModal("expense")}>
              <Icon name="plus" size={16} /> <span className="action-label">Registrar gasto</span>
            </button>
          </div>
        </header>

        {error && !modal && !settingsOpen && <div className="inline-alert" role="alert">
          <span>No pudimos sincronizar tus datos. La aplicación no mostrará saldos de ejemplo.</span>
          <button onClick={() => void refresh()}>Reintentar</button>
        </div>}
        {notice && <div className="toast" role="status"><span><Icon name="check" size={13} /></span>{notice}</div>}

        {activeView === "inicio" && <Dashboard
          data={data}
          showBalance={showBalance}
          setShowBalance={setShowBalance}
          openModal={openModal}
          goTo={setActiveView}
          user={auth.user}
        />}
        {activeView === "movimientos" && <TransactionsView
          transactions={filteredTransactions}
          search={search}
          setSearch={setSearch}
          filter={transactionFilter}
          setFilter={setTransactionFilter}
          openModal={openModal}
        />}
        {activeView === "presupuesto" && <BudgetView data={data} openModal={openModal} />}
        {activeView === "metas" && <GoalsView data={data} openModal={openModal} />}
        {activeView === "cuentas" && <AccountsView data={data} openModal={openModal} showBalance={showBalance} />}
      </main>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        {navItems.map((item) => <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}>
          <span><Icon name={item.icon} size={19} /></span>
          <small>{item.label}</small>
        </button>)}
      </nav>

      {modal && <OperationModal
        modal={modal}
        data={data}
        saving={saving}
        error={error}
        user={auth.user}
        onClose={() => setModal(null)}
        onSubmit={submitOperation}
      />}
      {settingsOpen && <SettingsModal
        user={auth.user}
        saving={settingsSaving}
        error={error}
        onClose={() => { setSettingsOpen(false); setError(""); }}
        onSubmit={saveSettings}
        onLogout={logout}
        onEditProfile={() => { setSettingsOpen(false); setError(""); setProfileWizardOpen(true); }}
      />}
    </div>
  </MoneyContext.Provider>;
}

function viewTitle(view) {
  const titles = {
    inicio: "Tu dinero, bien pensado.",
    movimientos: "Cada movimiento cuenta.",
    presupuesto: "Haz que cada monto tenga un propósito.",
    metas: "Ahorra con un destino.",
    cuentas: "Todo tu dinero, en orden.",
  };
  return titles[view];
}

function Dashboard({ data, showBalance, setShowBalance, openModal, goTo, user }) {
  const { money, shortMoney, currencySymbol } = useMoney();
  const savingsRate = data.summary.monthlyIncome
    ? Math.max(0, Math.round(((data.summary.monthlyIncome - data.summary.monthlyExpenses) / data.summary.monthlyIncome) * 100))
    : 0;
  const flow = buildFlowBars(data.transactions);
  const labels = chartLabels();
  const profile = user?.profile || {};
  const planningLabel = profile.planningPeriod === "biweekly" ? "quincena" : "mes";
  const expectedMargin = Math.max(Number(profile.incomeAmount || 0) - Number(profile.fixedExpenses || 0), 0);
  const pulse = financialPulse(profile);
  const nextPayday = nextPaydayLabel(profile);
  const emergencyCoverage = pulse.emergencyTarget > 0
    ? Math.min(100, Math.round((Number(profile.emergencySavings || 0) / pulse.emergencyTarget) * 100))
    : 0;

  return <div className="dashboard-grid">
    <div className="dashboard-primary">
      <section className="balance-hero premium-hero">
        <div className="hero-topline">
          <span>Patrimonio total</span>
          <button className="icon-button" onClick={() => setShowBalance(!showBalance)} aria-label={showBalance ? "Ocultar saldos" : "Mostrar saldos"}>
            <Icon name={showBalance ? "eye" : "eyeOff"} size={16} />
          </button>
        </div>
        <strong className="hero-balance">{showBalance ? money(data.summary.totalBalance) : `${currencySymbol} ••••••`}</strong>
        <div className="hero-meta">
          <span><i className="positive-dot" /> Disponible en presupuesto <strong>{showBalance ? money(data.summary.budgetAvailable) : "••••"}</strong></span>
          <span className="hero-change">{savingsRate}% libre</span>
        </div>
        <div className="quick-actions">
          <button onClick={() => openModal("expense")}><span className="quick-icon coral"><Icon name="minus" size={18} /></span><span><strong>Gasto</strong><small>Registrar salida</small></span></button>
          <button onClick={() => openModal("income")}><span className="quick-icon mint"><Icon name="plus" size={18} /></span><span><strong>Ingreso</strong><small>Sumar dinero</small></span></button>
          <button onClick={() => openModal("transfer")}><span className="quick-icon sky"><Icon name="transfer" size={18} /></span><span><strong>Transferir</strong><small>Entre cuentas</small></span></button>
        </div>
      </section>

      <section className="section-card cashflow-card elevated-card">
        <div className="section-heading">
          <div><p className="eyebrow">{currentMonthLabel()}</p><h2>Flujo del mes</h2></div>
          <div className="flow-legend">
            <span><i className="income-dot" /> Entró <strong>{shortMoney(data.summary.monthlyIncome)}</strong></span>
            <span><i className="expense-dot" /> Salió <strong>{shortMoney(data.summary.monthlyExpenses)}</strong></span>
          </div>
        </div>
        <div className={flow.hasActivity ? "flow-chart" : "flow-chart empty"} aria-label={`Gráfico del flujo de dinero de ${monthName()}`}>
          {flow.bars.map((bar, index) => <span className="bar-track" key={index}><i className={bar.highlight ? "chart-bar highlight" : "chart-bar"} style={{ height: `${bar.height}%` }} /></span>)}
          {!flow.hasActivity && <span className="flow-empty-message"><Icon name="chart" size={18} /> Aún no hay movimientos este mes.</span>}
        </div>
        <div className="chart-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div>
      </section>

      <section className="section-card elevated-card">
        <div className="section-heading">
          <div><p className="eyebrow">Plan del mes</p><h2>Dinero con propósito</h2></div>
          <button className="text-button" onClick={() => goTo("presupuesto")}>Ver presupuesto <Icon name="chevronRight" size={14} /></button>
        </div>
        <div className="budget-list compact">
          {data.categories.slice(0, 4).map((category) => <BudgetRow key={category.id} category={category} onEdit={() => openModal("budget", category.id)} compact />)}
        </div>
      </section>

      <section className="section-card elevated-card">
        <div className="section-heading">
          <div><p className="eyebrow">Actividad reciente</p><h2>Últimos movimientos</h2></div>
          <button className="text-button" onClick={() => goTo("movimientos")}>Ver todos <Icon name="chevronRight" size={14} /></button>
        </div>
        <TransactionList transactions={data.transactions.slice(0, 5)} />
      </section>
    </div>

    <aside className="dashboard-aside">
      <section className="purpose-card">
        <div className="purpose-card-head">
          <span className="purpose-icon"><Icon name="sparkles" size={18} /></span>
          <button className="icon-action" onClick={() => openModal("plan-purpose")} aria-label="Editar propósito"><Icon name="edit" size={15} /></button>
        </div>
        <p className="eyebrow light">Propósito de tu {planningLabel}</p>
        <h2>{profile.planPurpose || "Dale una intención a tu dinero"}</h2>
        <p>{profile.planPurpose ? `Este es el enfoque que elegiste para organizar tu ${planningLabel}.` : "Escribe una meta corta para que Clara te recuerde qué quieres conseguir con tu dinero."}</p>
        <div className="purpose-metrics">
          <span><small>Ingreso estimado</small><strong>{money(profile.incomeAmount || 0)}</strong></span>
          <span><small>Margen estimado</small><strong>{money(expectedMargin)}</strong></span>
          <span><small>Ahorro objetivo</small><strong>{profile.savingsTargetPercent || 0}%</strong></span>
        </div>
      </section>

      <section className="clara-pulse-card">
        <div className="pulse-card-head">
          <span className="pulse-icon"><Icon name="pulse" size={18} /></span>
          <span className="pulse-score"><strong>{pulse.score}</strong><small>/100</small></span>
        </div>
        <div className="pulse-title-row"><div><p className="eyebrow light">Índice Clara</p><h2>{pulse.label}</h2></div><span className="pulse-badge">Personal</span></div>
        <div className="pulse-track" aria-label={`Índice Clara ${pulse.score} de 100`}><i style={{ width: `${pulse.score}%` }} /></div>
        <p className="pulse-recommendation">{pulse.recommendation}</p>
        <div className="pulse-metrics">
          <span><Icon name="clock" size={15} /><small>Próximo cobro</small><strong>{nextPayday}</strong></span>
          <span><Icon name="shield" size={15} /><small>Fondo de emergencia</small><strong>{pulse.emergencyTarget ? `${emergencyCoverage}%` : "Configurar"}</strong></span>
        </div>
        <small className="pulse-disclaimer">Indicador interno de organización financiera. No es un score bancario ni crediticio.</small>
      </section>

      <section className="section-card accounts-summary elevated-card">
        <div className="section-heading"><div><p className="eyebrow">Saldos</p><h2>Mis cuentas</h2></div><button className="mini-add" onClick={() => openModal("account")} aria-label="Añadir cuenta"><Icon name="plus" size={16} /></button></div>
        <div className="account-stack">
          {data.accounts.map((account) => <div className="account-row" key={account.id}>
            <span className={`account-symbol ${account.color}`}><Icon name={account.institutionType === "cooperative" ? "users" : account.kind === "cash" ? "wallet" : "building"} size={15} /></span>
            <span><strong>{account.name}</strong><small>{accountSubtitle(account)}</small></span>
            <strong>{showBalance ? money(account.balance) : "••••"}</strong>
          </div>)}
        </div>
        <button className="secondary-action full" onClick={() => openModal("transfer")}><Icon name="transfer" size={15} /> Hacer transferencia</button>
      </section>

      <section className="section-card goal-spotlight elevated-card">
        <div className="goal-illustration" aria-hidden="true"><span><Icon name="target" size={22} /></span><i /><i /></div>
        <p className="eyebrow">Meta destacada</p>
        <h2>{data.goals[0]?.name ?? "Tu próxima meta"}</h2>
        {data.goals[0] ? <>
          <div className="goal-numbers"><strong>{money(data.goals[0].currentAmount)}</strong><span>de {money(data.goals[0].targetAmount)}</span></div>
          <Progress value={percentage(data.goals[0].currentAmount, data.goals[0].targetAmount)} color={data.goals[0].color} />
          <div className="goal-footer"><span>{percentage(data.goals[0].currentAmount, data.goals[0].targetAmount)}% logrado</span><span>Faltan {money(data.goals[0].targetAmount - data.goals[0].currentAmount)}</span></div>
          <button className="primary-action full" onClick={() => openModal("goal-contribution", data.goals[0].id)}>Aportar a la meta</button>
        </> : <>
          <p className="goal-empty-copy">Crea una meta para separar dinero con un objetivo concreto.</p>
          <button className="primary-action full" onClick={() => openModal("goal")}><Icon name="plus" size={15} /> Crear mi primera meta</button>
        </>}
      </section>

      <section className="insight-card premium-insight">
        <span className="insight-mark"><Icon name="sparkles" size={17} /></span>
        <p>{data.summary.budgetTotal ? "Resumen inteligente" : "Empieza con un plan"}</p>
        <strong>{data.summary.budgetTotal
          ? `Has utilizado ${Math.round((data.summary.monthlyExpenses / Math.max(data.summary.budgetTotal, 1)) * 100)}% de tu presupuesto mensual.`
          : `Tu objetivo de ahorro está en ${profile.savingsTargetPercent || 10}%. Define límites por categoría para que Clara pueda medir tu avance.`}</strong>
      </section>
    </aside>
  </div>;
}

function TransactionsView({ transactions, search, setSearch, filter, setFilter, openModal }) {
  return <section className="page-card">
    <div className="page-intro">
      <div><p className="eyebrow">Historial completo</p><h2>Movimientos</h2><p>Busca, revisa y entiende exactamente a dónde fue tu dinero.</p></div>
      <div className="split-actions"><button className="secondary-action" onClick={() => openModal("income")}><Icon name="plus" size={15} /> Ingreso</button><button className="primary-action" onClick={() => openModal("expense")}><Icon name="plus" size={15} /> Gasto</button></div>
    </div>
    <div className="transaction-toolbar">
      <label className="search-field"><span><Icon name="search" size={16} /></span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, cuenta o categoría" aria-label="Buscar movimientos" /></label>
      <div className="filter-chips" aria-label="Filtrar movimientos">
        {[["all", "Todos"], ["expense", "Gastos"], ["income", "Ingresos"], ["transfer", "Transferencias"]].map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
    </div>
    <div className="table-head"><span>Movimiento</span><span>Categoría</span><span>Cuenta</span><span>Fecha</span><span>Monto</span></div>
    <TransactionList transactions={transactions} detailed />
    {!transactions.length && <div className="empty-state"><span><Icon name="activity" size={24} /></span><h3>No hay movimientos para mostrar</h3><p>Registra un ingreso o gasto para comenzar tu historial.</p></div>}
  </section>;
}

function BudgetView({ data, openModal }) {
  const { money } = useMoney();
  const used = data.categories.reduce((total, category) => total + category.spent, 0);
  const assigned = data.categories.reduce((total, category) => total + category.monthlyLimit, 0);
  return <>
    <section className="budget-overview">
      <div>
        <p className="eyebrow light">Presupuesto de {monthName()}</p>
        <h2>{money(data.summary.budgetAvailable)} <span>todavía disponibles</span></h2>
        <p>{assigned ? `Has usado ${money(used)} de los ${money(assigned)} que planeaste para este mes.` : "Aún no has definido límites para este mes."}</p>
      </div>
      <div className="budget-ring" style={{ "--progress": `${percentage(used, assigned) * 3.6}deg` }}>
        <span><strong>{percentage(used, assigned)}%</strong><small>utilizado</small></span>
      </div>
      <div className="overview-metrics">
        <span><small>Ingresos</small><strong>{money(data.summary.monthlyIncome)}</strong></span>
        <span><small>Asignado</small><strong>{money(assigned)}</strong></span>
        <span><small>Sin asignar</small><strong>{money(Math.max(data.summary.monthlyIncome - assigned, 0))}</strong></span>
      </div>
    </section>
    <section className="page-card">
      <div className="page-intro compact-intro"><div><p className="eyebrow">Tus categorías</p><h2>¿Cuánto hay para cada cosa?</h2><p>Ajusta los límites hasta que tu plan se sienta realista.</p></div></div>
      <div className="budget-grid">
        {data.categories.map((category) => <BudgetRow key={category.id} category={category} onEdit={() => openModal("budget", category.id)} />)}
      </div>
    </section>
  </>;
}

function GoalsView({ data, openModal }) {
  const { money } = useMoney();
  const totalSaved = data.goals.reduce((total, goal) => total + goal.currentAmount, 0);
  return <section className="page-card">
    <div className="page-intro">
      <div><p className="eyebrow">Ahorro con intención</p><h2>Tus metas</h2><p>Convierte una cantidad grande en pequeños avances que sí puedes ver.</p></div>
      <button className="primary-action" onClick={() => openModal("goal")}><Icon name="plus" size={15} /> Nueva meta</button>
    </div>
    <div className="goal-summary-strip">
      <span><small>Total reservado</small><strong>{money(totalSaved)}</strong></span>
      <span><small>Metas activas</small><strong>{data.goals.length}</strong></span>
      <span><small>Próxima fecha</small><strong>{data.goals[0] ? longDate(data.goals[0].dueDate) : "Sin fecha"}</strong></span>
    </div>
    <div className="goals-grid">
      {data.goals.map((goal, index) => <article className={`goal-card ${goal.color}`} key={goal.id}>
        <div className="goal-card-top"><span className="goal-badge">{index === 0 ? "Prioridad" : "En progreso"}</span><span className="goal-round-icon"><Icon name={index % 2 ? "sparkles" : "target"} size={17} /></span></div>
        <p>Meta para {longDate(goal.dueDate)}</p>
        <h3>{goal.name}</h3>
        <div className="goal-big-number"><strong>{money(goal.currentAmount)}</strong><span> / {money(goal.targetAmount)}</span></div>
        <Progress value={percentage(goal.currentAmount, goal.targetAmount)} color={goal.color} />
        <div className="goal-card-footer"><span>{percentage(goal.currentAmount, goal.targetAmount)}% completado</span><button onClick={() => openModal("goal-contribution", goal.id)}>Aportar <Icon name="chevronRight" size={13} /></button></div>
      </article>)}
      <button className="new-goal-card" onClick={() => openModal("goal")}><span><Icon name="plus" size={22} /></span><strong>{data.goals.length ? "Crear otra meta" : "Crear tu primera meta"}</strong><small>Define cuánto quieres y para cuándo.</small></button>
    </div>
  </section>;
}

function AccountsView({ data, openModal, showBalance }) {
  const { money, currencySymbol } = useMoney();
  return <>
    <section className="account-overview-card premium-account-overview">
      <div><p className="eyebrow light">Patrimonio combinado</p><strong>{showBalance ? money(data.summary.totalBalance) : `${currencySymbol} ••••••`}</strong><p>La suma de todas las cuentas de tu perfil.</p></div>
      <div className="account-overview-actions"><button onClick={() => openModal("transfer")}><Icon name="transfer" size={15} /> Transferir</button><button onClick={() => openModal("account")}><Icon name="plus" size={15} /> Añadir cuenta</button></div>
    </section>
    <section className="page-card elevated-card">
      <div className="page-intro compact-intro"><div><p className="eyebrow">Saldos separados</p><h2>Mis cuentas</h2><p>Agrega las cuentas que realmente usas y mantén cada saldo bajo tu control.</p></div></div>
      <div className="accounts-grid">
        {data.accounts.map((account) => <article className={`account-card ${account.color}`} key={account.id}>
          <div className="account-card-top">
            <span className="account-symbol large"><Icon name={account.institutionType === "cooperative" ? "users" : account.kind === "cash" ? "wallet" : "building"} size={18} /></span>
            <span className="account-kind">{productLabel(account.productType || (account.kind === "savings" ? "savings" : account.kind === "cash" ? "cash" : "checking"))}</span>
            <div className="account-card-actions">
              <button onClick={() => openModal("account-update", account.id)} aria-label={`Editar ${account.name}`}><Icon name="edit" size={15} /></button>
              <button className="danger-icon" onClick={() => openModal("account-delete", account.id)} aria-label={`Eliminar ${account.name}`}><Icon name="trash" size={15} /></button>
            </div>
          </div>
          <div className="account-institution-chip"><Icon name={account.institutionType === "cooperative" ? "users" : account.kind === "cash" ? "wallet" : "building"} size={12} /> {account.institutionName || institutionTypeLabel(account.institutionType || (account.kind === "cash" ? "cash" : "bank"))}</div>
          <h3>{account.name}</h3>
          <p className="account-subtitle">{accountSubtitle(account)}</p>
          <strong>{showBalance ? money(account.balance) : "••••••"}</strong>
          <div className="account-card-foot"><span>Saldo editable y auditado</span><button onClick={() => openModal("transfer")}>Mover dinero <Icon name="chevronRight" size={13} /></button></div>
        </article>)}
        <button className="account-card account-add" onClick={() => openModal("account")}><span><Icon name="plus" size={24} /></span><strong>Añadir otra cuenta</strong><small>Bancos, cooperativas, nómina, inversiones, efectivo y más.</small></button>
      </div>
    </section>
  </>;
}

function BudgetRow({ category, onEdit, compact = false }) {
  const { money } = useMoney();
  const used = percentage(category.spent, category.monthlyLimit);
  const remaining = Math.max(category.monthlyLimit - category.spent, 0);
  return <article className={compact ? "budget-item compact" : "budget-item"}>
    <div className="budget-item-top">
      <span className={`category-symbol ${category.color}`}>{category.symbol}</span>
      <span><strong>{category.name}</strong><small>{money(remaining)} disponibles</small></span>
      <button onClick={onEdit} aria-label={`Ajustar presupuesto de ${category.name}`}>{compact ? <Icon name="edit" size={14} /> : <>Ajustar <Icon name="edit" size={13} /></>}</button>
    </div>
    <Progress value={used} color={category.color} />
    <div className="budget-item-meta"><span>{money(category.spent)} usado</span><span>{money(category.monthlyLimit)} límite</span></div>
  </article>;
}

function Progress({ value, color }) {
  return <span className="progress-track" aria-label={`${value}% completado`}><i className={color} style={{ width: `${Math.min(value, 100)}%` }} /></span>;
}

function TransactionList({ transactions, detailed = false }) {
  const { money } = useMoney();
  if (!transactions.length && !detailed) {
    return <div className="mini-empty"><span><Icon name="activity" size={20} /></span><p>Aún no hay movimientos. Registra tu primer ingreso para comenzar.</p></div>;
  }
  return <div className={detailed ? "transaction-list detailed" : "transaction-list"}>
    {transactions.map((transaction) => <article className="transaction-row" key={transaction.id}>
      <div className="transaction-main">
        <span className={`transaction-symbol ${transaction.type === "income" ? "mint" : transaction.type === "transfer" ? "sky" : transaction.categoryColor ?? "coral"}`}>{transaction.type === "income" ? "IN" : transaction.type === "transfer" ? "TR" : transaction.categorySymbol ?? "GA"}</span>
        <span><strong>{transaction.description}</strong><small>{detailed ? transaction.note || "Sin nota" : `${transaction.accountName} · ${prettyDate(transaction.transactionDate)}`}</small></span>
      </div>
      {detailed && <span className="transaction-category">{transaction.type === "income" ? "Ingreso" : transaction.type === "transfer" ? "Transferencia" : transaction.categoryName ?? "Sin categoría"}</span>}
      {detailed && <span className="transaction-account">{transaction.accountName}</span>}
      {detailed && <span className="transaction-date">{prettyDate(transaction.transactionDate)}</span>}
      <strong className={`transaction-amount ${transaction.type}`}>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}{money(transaction.amount)}</strong>
    </article>)}
  </div>;
}


function AccountFields({ account = null }) {
  const { currencySymbol } = useMoney();
  const inferredType = account?.institutionType || (account?.kind === "cash" ? "cash" : "bank");
  const inferredProduct = account?.productType || (account?.kind === "cash" ? "cash" : account?.kind === "savings" ? "savings" : "checking");
  const [institutionType, setInstitutionType] = useState(inferredType);
  const [institutionName, setInstitutionName] = useState(account?.institutionName || "");
  const [productType, setProductType] = useState(inferredProduct);
  const [nickname, setNickname] = useState(account?.nickname || "");
  const institutions = institutionsForType(institutionType);
  const isCash = institutionType === "cash" || productType === "cash";
  const displayName = isCash
    ? (nickname ? `Efectivo · ${nickname}` : "Efectivo")
    : institutionName
      ? `${productLabel(productType)} · ${institutionName}`
      : nickname ? `${productLabel(productType)} · ${nickname}` : productLabel(productType);

  function changeInstitutionType(event) {
    const next = event.target.value;
    setInstitutionType(next);
    setInstitutionName("");
    if (next === "cash") {
      setProductType("cash");
    } else if (productType === "cash") {
      setProductType(next === "wallet" ? "wallet" : "savings");
    }
  }

  return <>
    <div className="account-editor-intro">
      <span><Icon name={institutionType === "cooperative" ? "users" : institutionType === "cash" ? "wallet" : "building"} size={20} /></span>
      <div><strong>{displayName}</strong><small>Clara genera el nombre con el tipo de producto y la institución para que tus cuentas se entiendan de un vistazo.</small></div>
    </div>
    <input type="hidden" name="name" value={displayName} />
    <div className="form-grid">
      <label><span>¿Dónde está el dinero?</span><select name="institutionType" value={institutionType} onChange={changeInstitutionType}>
        <option value="bank">Banco</option>
        <option value="association">Asociación de ahorros y préstamos</option>
        <option value="cooperative">Cooperativa</option>
        <option value="wallet">Billetera digital</option>
        <option value="investment">Inversión / puesto de bolsa</option>
        <option value="cash">Efectivo</option>
        <option value="other">Otra institución</option>
      </select></label>
      <label><span>Tipo de producto</span><select name="productType" value={productType} onChange={(event) => setProductType(event.target.value)} disabled={institutionType === "cash"}>
        <option value="payroll">Cuenta de nómina</option>
        <option value="savings">Cuenta de ahorros</option>
        <option value="checking">Cuenta corriente</option>
        <option value="certificate">Certificado / depósito</option>
        <option value="contribution">Aportaciones</option>
        <option value="wallet">Billetera digital</option>
        <option value="investment">Cuenta de inversión</option>
        <option value="cash">Efectivo</option>
        <option value="other">Otro producto</option>
      </select>{institutionType === "cash" && <input type="hidden" name="productType" value="cash" />}</label>
    </div>
    {!isCash && <label><span>{institutionTypeLabel(institutionType)}</span>
      <input
        name="institutionName"
        list="clara-institution-options"
        value={institutionName}
        onChange={(event) => setInstitutionName(event.target.value)}
        required
        autoFocus
        placeholder={institutionType === "cooperative" ? "Busca o escribe tu cooperativa" : "Busca o escribe la institución"}
      />
      <datalist id="clara-institution-options">{institutions.map((institution) => <option value={institution} key={institution} />)}</datalist>
      <small className="field-help">Puedes escoger una sugerencia o escribir cualquier banco, cooperativa o institución que no aparezca en la lista.</small>
    </label>}
    <label><span>Alias <small>opcional</small></span><input name="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Ej. Nómina, Personal, Viajes" /></label>
    <label><span>{account ? "Saldo actual" : "Saldo que tienes ahora"}</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="amount" min="0" step="0.01" defaultValue={account ? (Number(account.balance || 0) / 100).toFixed(2) : "0.00"} required /></div></label>
    {account ? <>
      <label><span>Motivo del ajuste <small>opcional</small></span><input name="balanceReason" placeholder="Ej. Actualicé el saldo con mi app bancaria" /></label>
      <p className="form-note"><Icon name="shield" size={14} /> Puedes corregir el saldo aunque la cuenta tenga movimientos. Clara guarda el ajuste aparte para no contarlo como ingreso ni como gasto.</p>
    </> : <p className="form-note"><Icon name="info" size={14} /> Este es tu saldo de partida. Puedes poner lo que ya tienes en el banco sin registrar un ingreso ficticio.</p>}
  </>;
}

function OperationModal({ modal, data, saving, error, user, onClose, onSubmit }) {
  const { money, currencySymbol } = useMoney();
  const category = data.categories.find((item) => item.id === modal.referenceId);
  const goal = data.goals.find((item) => item.id === modal.referenceId);
  const account = data.accounts.find((item) => item.id === modal.referenceId);
  const titles = {
    expense: { eyebrow: "Nuevo movimiento", title: "Registrar gasto", submit: "Guardar gasto" },
    income: { eyebrow: "Nuevo movimiento", title: "Registrar ingreso", submit: "Guardar ingreso" },
    transfer: { eyebrow: "Entre tus cuentas", title: "Hacer transferencia", submit: "Transferir dinero" },
    budget: { eyebrow: "Plan mensual", title: `Ajustar ${category?.name ?? "categoría"}`, submit: "Guardar presupuesto" },
    goal: { eyebrow: "Ahorro con destino", title: "Crear nueva meta", submit: "Crear meta" },
    "goal-contribution": { eyebrow: "Avanza un poco más", title: `Aportar a ${goal?.name ?? "la meta"}`, submit: "Guardar aporte" },
    account: { eyebrow: "Nueva cuenta", title: "Añadir cuenta", submit: "Crear cuenta" },
    "account-update": { eyebrow: "Editar cuenta", title: account?.name ?? "Editar cuenta", submit: "Guardar cambios" },
    "account-delete": { eyebrow: "Eliminar cuenta", title: account?.name ?? "Eliminar cuenta", submit: "Eliminar cuenta", danger: true },
    "plan-purpose": { eyebrow: "Tu enfoque", title: "Propósito del período", submit: "Guardar propósito" },
  };
  const copy = titles[modal.kind] || titles.expense;

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="modal-card premium-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="modal-close" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={17} /></button>
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2 id="modal-title">{copy.title}</h2>
      <form onSubmit={onSubmit}>
        {(modal.kind === "expense" || modal.kind === "income") && <>
          <label><span>Concepto</span><input name="description" required autoFocus placeholder={modal.kind === "expense" ? "Ej. Supermercado" : "Ej. Pago de nómina"} /></label>
          <MoneyInput />
          <label><span>Cuenta</span><select name="accountId" required defaultValue={data.accounts[0]?.id}>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name} — {money(item.balance)}</option>)}</select></label>
          {modal.kind === "expense" && <label><span>Categoría</span><select name="categoryId" required defaultValue={data.categories[0]?.id}>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name} — quedan {money(Math.max(item.monthlyLimit - item.spent, 0))}</option>)}</select></label>}
          <div className="form-grid"><label><span>Fecha</span><input type="date" name="transactionDate" defaultValue={todayIso()} required /></label><label><span>Nota <small>opcional</small></span><input name="note" placeholder="Añade un detalle" /></label></div>
        </>}

        {modal.kind === "transfer" && <>
          <label><span>Desde</span><select name="accountId" required defaultValue={data.accounts[0]?.id}>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name} — {money(item.balance)}</option>)}</select></label>
          <label><span>Hacia</span><select name="destinationAccountId" required defaultValue={data.accounts[1]?.id}>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <MoneyInput />
          <div className="form-grid"><label><span>Fecha</span><input type="date" name="transactionDate" defaultValue={todayIso()} required /></label><label><span>Nota <small>opcional</small></span><input name="note" placeholder="Motivo" /></label></div>
          <p className="form-note"><Icon name="info" size={14} /> La transferencia mueve saldo entre tus cuentas sin registrarlo como gasto.</p>
        </>}

        {modal.kind === "budget" && <>
          <div className="modal-context"><span className={`category-symbol ${category?.color ?? "mint"}`}>{category?.symbol ?? "CA"}</span><span><small>Actualmente</small><strong>{money(category?.monthlyLimit ?? 0)} al mes</strong></span></div>
          <label><span>Nuevo límite mensual</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="monthlyLimit" min="0" step="0.01" defaultValue={((category?.monthlyLimit ?? 0) / 100).toFixed(2)} required autoFocus /></div></label>
          <p className="form-note"><Icon name="info" size={14} /> Este cambio no modifica lo que ya gastaste; solo ajusta cuánto separas para la categoría.</p>
        </>}

        {modal.kind === "goal" && <>
          <label><span>Nombre de la meta</span><input name="name" required autoFocus placeholder="Ej. Fondo de emergencia" /></label>
          <label><span>¿Cuánto necesitas?</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="targetAmount" min="0.01" step="0.01" placeholder="0.00" required /></div></label>
          <label><span>¿Para cuándo?</span><input type="date" name="dueDate" min={todayIso()} required /></label>
        </>}

        {modal.kind === "goal-contribution" && <>
          <div className="modal-context goal-context"><span className="goal-round-icon"><Icon name="target" size={18} /></span><span><small>Faltan</small><strong>{money(Math.max((goal?.targetAmount ?? 0) - (goal?.currentAmount ?? 0), 0))}</strong></span></div>
          <MoneyInput label="Monto del aporte" />
          <label><span>Tomar dinero de</span><select name="accountId" required defaultValue={data.accounts[0]?.id}>{data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name} — {money(item.balance)}</option>)}</select></label>
          <p className="form-note"><Icon name="info" size={14} /> El aporte se descontará de la cuenta elegida y quedará reservado dentro de la meta.</p>
        </>}

        {modal.kind === "account" && <AccountFields />}

        {modal.kind === "account-update" && account && <AccountFields account={account} />}

        {modal.kind === "account-delete" && account && <div className="danger-confirmation">
          <span><Icon name="trash" size={20} /></span>
          <div><strong>¿Eliminar esta cuenta?</strong><p>Solo se puede eliminar si está en cero y no tiene movimientos. Clara nunca eliminará historial financiero para forzar esta acción.</p></div>
        </div>}

        {modal.kind === "plan-purpose" && <>
          <label><span>¿Cómo quieres organizarte?</span><select name="planningPeriod" defaultValue={user?.profile?.planningPeriod || "monthly"}><option value="monthly">Por mes</option><option value="biweekly">Por quincena</option></select></label>
          <label><span>Propósito del período</span><textarea name="planPurpose" rows="4" maxLength="240" required autoFocus defaultValue={user?.profile?.planPurpose || ""} placeholder="Ej. Ahorrar para mi vehículo sin descuidar mis gastos fijos." /></label>
          <p className="form-note"><Icon name="sparkles" size={14} /> Clara mostrará este propósito en tu inicio para mantener tu plan visible.</p>
        </>}

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button type="submit" className={copy.danger ? "danger-action" : "primary-action"} disabled={saving}>{saving ? "Guardando…" : copy.submit}</button></div>
      </form>
    </section>
  </div>;
}

function SettingsModal({ user, saving, error, onClose, onSubmit, onLogout, onEditProfile }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="modal-card settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <button className="modal-close" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={17} /></button>
      <p className="eyebrow">Preferencias</p>
      <h2 id="settings-title">Tu cuenta</h2>
      <div className="settings-user">
        <span className="avatar settings-avatar">{initials(user.name)}</span>
        <span><strong>{user.name}</strong><small>@{user.username}</small></span>
      </div>
      <form onSubmit={onSubmit}>
        <label><span>Teléfono del perfil</span><div className="input-with-icon"><Icon name="phone" size={16} /><input type="tel" name="phone" autoComplete="tel" inputMode="tel" required defaultValue={user.phone || ""} placeholder="Ej. (809) 555-1234" /></div></label>
        <label><span>Moneda del sistema</span>
          <select name="currencyCode" defaultValue={user.currencyCode || "DOP"}>
            {currencyOptions.map((currency) => <option value={currency.code} key={currency.code}>{currency.label} ({currency.code})</option>)}
          </select>
        </label>
        <p className="form-note">La moneda cambia el símbolo y el formato visual. No convierte automáticamente los saldos existentes.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
      </form>
      <div className="settings-profile-summary">
        <span><Icon name="calendar" size={16} /><small>Planificación</small><strong>{user.profile?.planningPeriod === "biweekly" ? "Quincenal" : "Mensual"}</strong></span>
        <span><Icon name="target" size={16} /><small>Ahorro objetivo</small><strong>{user.profile?.savingsTargetPercent || 0}%</strong></span>
        <span><Icon name="pulse" size={16} /><small>Índice Clara</small><strong>{financialPulse(user.profile).score}/100</strong></span>
        <span><Icon name="clock" size={16} /><small>Próximo cobro</small><strong>{nextPaydayLabel(user.profile)}</strong></span>
      </div>
      <button className="profile-edit-action" type="button" onClick={onEditProfile}><Icon name="user" size={16} /><span><strong>Actualizar mi perfil financiero</strong><small>Ingresos, cobros, deudas, gastos fijos y objetivos.</small></span><Icon name="chevronRight" size={15} /></button>
      <DeveloperMark />
      <div className="settings-security">
        <div><strong>Sesión segura</strong><small>Cierra tu sesión cuando uses un equipo compartido.</small></div>
        <button className="logout-button" type="button" onClick={onLogout}><Icon name="logout" size={15} /> Cerrar sesión</button>
      </div>
    </section>
  </div>;
}

function MoneyInput({ label = "Monto" }) {
  const { currencySymbol } = useMoney();
  return <label><span>{label}</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="amount" min="0.01" step="0.01" placeholder="0.00" required /></div></label>;
}

export { SavingsApp };
