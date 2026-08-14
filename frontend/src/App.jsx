import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { institutionsForType } from "./institutions.js";
import { usePwaManager, saveOfflineSnapshot, loadOfflineSnapshot, clearOfflineSnapshots } from "./pwa.js";

const EMPTY_DATA = {
  accounts: [],
  categories: [],
  transactions: [],
  adjustments: [],
  balanceHistory: [],
  goals: [],
  goalContributions: [],
  emergencyFund: { goalId: null, currentAmount: 0, targetAmount: 0, coverageMonths: 0, recommendedMonths: 3, percentage: 0, configured: false },
  wealth: { liquidBalance: 0, goalReserves: 0, liabilities: 0, netWorth: 0, snapshots: [], accountEvolution: [] },
  analytics: { claraIndex: 0, claraIndexLabel: "Sin datos suficientes", currentMonth: { income: 0, expenses: 0 }, previousMonth: { income: 0, expenses: 0 }, currentPeriod: { income: 0, expenses: 0 }, previousPeriod: { income: 0, expenses: 0 }, monthExpenseDelta: 0, monthIncomeDelta: 0, periodExpenseDelta: 0, savingsCapacityRate: 0, savingsCapacityAmount: 0, debtToIncomeRate: 0, fixedToIncomeRate: 0, projectedMonthExpenses: 0, projectedEndBalance: 0, categoryTrends: [], unusualExpenses: [], recommendations: [], primaryRecommendation: null },
  recurringPayments: [],
  creditCards: [],
  debts: [],
  liabilityPayments: [],
  cardConsumptions: [],
  hiddenSystemCategoriesCount: 0,
  calendar: { monthStart: "", monthEnd: "", events: [], upcoming: [], overdue: [], windows: { days7: { count: 0, total: 0 }, days15: { count: 0, total: 0 }, days30: { count: 0, total: 0 } } },
  budgetPlan: {
    periodKey: "",
    assigned: 0,
    spent: 0,
    remaining: 0,
    unassigned: 0,
    expectedIncome: 0,
    incomeReference: 0,
    liquidBalance: 0,
    fixedReserve: 0,
    recurringReserve: 0,
    liabilityReserve: 0,
    protectedCommitments: 0,
    savingsReserve: 0,
    safeToSpend: 0,
    dailySafeToSpend: 0,
    daysForSafeSpend: 1,
    safeUntil: "",
    safeUntilKind: "period",
    nextPayday: null,
    usingProfileFixedFallback: false,
    alerts: [],
    alertCount: 0,
    configuredEnvelopes: 0,
    legacyEnvelopes: 0,
  },
  period: {
    mode: "monthly",
    key: "",
    start: "",
    end: "",
    label: "Periodo actual",
    shortLabel: "Periodo actual",
  },
  summary: {
    totalBalance: 0,
    primaryBalance: 0,
    primaryCurrency: "DOP",
    currencyTotals: {},
    hasMixedCurrencies: false,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    periodIncome: 0,
    periodExpenses: 0,
    cashflowByCurrency: {},
    budgetTotal: 0,
    budgetSpent: 0,
    budgetAvailable: 0,
    safeToSpend: 0,
    dailySafeToSpend: 0,
    fixedReserve: 0,
    recurringReserve: 0,
    liabilityReserve: 0,
    protectedCommitments: 0,
    savingsReserve: 0,
    liquidBalance: 0,
    budgetAlertCount: 0,
    creditUsedTotal: 0,
    creditLimitTotal: 0,
    creditAvailableTotal: 0,
    debtBalanceTotal: 0,
    liabilitiesTotal: 0,
    monthlyDebtCommitment: 0,
    netWorth: 0,
    goalReserves: 0,
    claraIndex: 0,
  },
};

const navItems = [
  { id: "inicio", label: "Inicio", icon: "home" },
  { id: "movimientos", label: "Movimientos", mobileLabel: "Movimientos", icon: "activity" },
  { id: "presupuesto", label: "Presupuesto", mobileLabel: "Plan", icon: "budget" },
  { id: "calendario", label: "Calendario", mobileLabel: "Agenda", icon: "calendar" },
  { id: "categorias", label: "Categorías", icon: "tags" },
  { id: "credito", label: "Crédito y deudas", mobileLabel: "Crédito", icon: "creditCard" },
  { id: "metas", label: "Metas", icon: "target" },
  { id: "analisis", label: "Análisis", icon: "chart" },
  { id: "cuentas", label: "Cuentas", icon: "wallet" },
];
const mobileNavItems = navItems.filter((item) => ["inicio", "movimientos", "presupuesto", "calendario"].includes(item.id));
const mobileMoreItems = navItems.filter((item) => ["categorias", "credito", "metas", "analisis", "cuentas"].includes(item.id));

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
  tags: ["M20.6 13.6 11 4H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8Z", "M7.5 7.5h.01"],
  history: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v5h5", "M12 7v5l3 2"],
  layers: ["m12 2 9 5-9 5-9-5 9-5Z", "m3 12 9 5 9-5", "m3 17 9 5 9-5"],
  utensils: ["M4 3v7", "M7 3v7", "M4 7h3", "M5.5 10v11", "M14 3v18", "M14 3c4 2 5 6 3 9h-3"],
  car: ["M5 17h14", "M6 17l-1-5 2-5h10l2 5-1 5", "M7 12h10", "M8 18v2", "M16 18v2", "M8 15h.01", "M16 15h.01"],
  heart: ["M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"],
  gamepad: ["M6 9h12a4 4 0 0 1 3.8 5.2l-1 3A2.5 2.5 0 0 1 16.6 18L15 16H9l-1.6 2a2.5 2.5 0 0 1-4.2-.8l-1-3A4 4 0 0 1 6 9Z", "M7 12v4", "M5 14h4", "M16 13h.01", "M19 15h.01"],
  graduation: ["m3 10 9-5 9 5-9 5-9-5Z", "M7 12v5c3 2 7 2 10 0v-5", "M21 10v6"],
  heartPulse: ["M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l7.8-7.6a5.5 5.5 0 0 0 1-7.8Z", "M4.5 13h4l1.5-3 2.2 6 1.6-3H19"],
  receipt: ["M6 3h12v18l-3-2-3 2-3-2-3 2V3Z", "M9 8h6", "M9 12h6", "M9 16h4"],
  creditCard: ["M3 6h18v12H3z", "M3 10h18", "M7 15h3"],
  shoppingBag: ["M5 8h14l-1 13H6L5 8Z", "M9 10V6a3 3 0 0 1 6 0v4"],
  circleMore: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M8 12h.01", "M12 12h.01", "M16 12h.01"],
  repeat: ["M17 2l4 4-4 4", "M3 11V9a3 3 0 0 1 3-3h15", "M7 22l-4-4 4-4", "M21 13v2a3 3 0 0 1-3 3H3"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  checkCircle: ["M22 11.1V12a10 10 0 1 1-5.9-9.1", "m9 11 3 3L22 4"],
  alertTriangle: ["M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z", "M12 9v4", "M12 17h.01"],
  trendingDown: ["M3 7l6 6 4-4 8 8", "M17 17h4v-4"],
  trendingUp: ["M3 17l6-6 4 4 8-8", "M17 7h4v4"],
  lock: ["M6 10V7a6 6 0 0 1 12 0v3", "M5 10h14v11H5z"],
  download: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
  smartphone: ["M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z", "M10 18h4"],
  wifi: ["M5 12.55a11 11 0 0 1 14 0", "M8.5 16a6 6 0 0 1 7 0", "M12 20h.01"],
  wifiOff: ["m2 2 20 20", "M8.5 8.5A11 11 0 0 1 19 12.55", "M5 12.55a11 11 0 0 1 2.16-1.54", "M8.5 16a6 6 0 0 1 7 0", "M12 20h.01"],
  share: ["M12 3v12", "m8 7 4-4 4 4", "M5 12v8h14v-8"],
};

function Icon({ name, size = 18, strokeWidth = 1.8, className = "" }) {
  const paths = iconPaths[name] || iconPaths.info;
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths.map((path, index) => <path d={path} key={`${name}-${index}`} />)}
  </svg>;
}

const systemCategoryIcons = {
  1: "home", 2: "utensils", 3: "car", 4: "heart", 5: "gamepad", 6: "graduation",
  7: "heartPulse", 8: "receipt", 9: "briefcase", 10: "creditCard", 11: "shoppingBag", 12: "circleMore",
};

function CategoryIcon({ category, size = 18 }) {
  const rootId = Number(category?.parentId || category?.id || 0);
  return <Icon name={systemCategoryIcons[rootId] || "tags"} size={size} strokeWidth={1.9} />;
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
  moneyFor: () => "0,00",
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

function chartLabels(period = null) {
  if (!period?.start || !period?.end) {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const month = new Intl.DateTimeFormat("es-DO", { month: "short" }).format(now).replace(".", "");
    return [1, 8, 15, 22, lastDay].map((day) => `${Math.min(day, lastDay)} ${month}`);
  }
  const start = new Date(`${period.start}T12:00:00`);
  const end = new Date(`${period.end}T12:00:00`);
  const days = Math.max(1, Math.round((end - start) / 86_400_000));
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const date = new Date(start.getTime() + Math.round(days * ratio) * 86_400_000);
    return new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "short" }).format(date).replace(".", "");
  });
}

function buildFlowBars(transactions, period, primaryCurrency = "DOP") {
  const start = period?.start || "";
  const end = period?.end || "";
  if (!start || !end) return { hasActivity: false, bars: Array.from({ length: 14 }, () => ({ height: 0, highlight: false })) };

  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const days = Math.max(1, Math.round((endDate - startDate) / 86_400_000) + 1);
  const totals = Array.from({ length: 14 }, () => 0);

  transactions.forEach((transaction) => {
    if (!["income", "expense"].includes(transaction.type)) return;
    if (String(transaction.source || "").toUpperCase() === "GOAL") return;
    if ((transaction.currencyCode || primaryCurrency) !== primaryCurrency) return;
    const dateText = String(transaction.transactionDate || "");
    if (dateText < start || dateText > end) return;
    const current = new Date(`${dateText}T12:00:00`);
    const dayOffset = Math.max(0, Math.round((current - startDate) / 86_400_000));
    const index = Math.min(13, Math.floor((dayOffset / days) * 14));
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
  const [activeView, setActiveView] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    return navItems.some((item) => item.id === requested) ? requested : "inicio";
  });
  const [data, setData] = useState(EMPTY_DATA);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showBalance, setShowBalance] = useState(true);
  const [search, setSearch] = useState("");
  const [transactionFilter, setTransactionFilter] = useState("all");
  const [transactionPeriodFilter, setTransactionPeriodFilter] = useState("current");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [profileWizardOpen, setProfileWizardOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [auth, setAuth] = useState({ checking: true, registrationEnabled: true, user: null });
  const pwa = usePwaManager(token);

  const currencyCode = auth.user?.currencyCode || "DOP";
  const moneyTools = useMemo(() => ({
    currencyCode,
    currencySymbol: currencyInfo(currencyCode).symbol,
    money: (cents) => formatMoney(cents, currencyCode),
    moneyFor: (cents, code) => formatMoney(cents, code || currencyCode),
    shortMoney: (cents) => formatShortMoney(cents, currencyCode),
  }), [currencyCode]);

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    void clearOfflineSnapshots();
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
      void saveOfflineSnapshot("finance-data", result.data);
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
        const storedToken = localStorage.getItem(TOKEN_KEY) || "";
        if (!navigator.onLine) {
          if (storedToken) {
            const [cachedUser, cachedData] = await Promise.all([loadOfflineSnapshot("auth-user"), loadOfflineSnapshot("finance-data")]);
            if (active && cachedUser && cachedData) {
              setToken(storedToken);
              setAuth({ checking: false, registrationEnabled: true, user: cachedUser });
              setData(cachedData);
              setLoading(false);
              setError("");
              return;
            }
          }
          throw new Error("No hay conexión. Abre Clara una vez con internet para preparar el modo offline en este dispositivo.");
        }
        await waitForBackend();
        if (!active) return;

        const { response: statusResponse, result: status } = await apiRequest("/api/auth/status", { cache: "no-store" });
        if (!statusResponse.ok) throw new Error(status?.error || "No se pudo conectar con Clara.");
        if (!active) return;

        const registrationEnabled = status?.registrationEnabled !== false;
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
        void saveOfflineSnapshot("auth-user", meResult.user);
        await refresh(storedToken);
      } catch (requestError) {
        if (!active) return;
        const storedToken = localStorage.getItem(TOKEN_KEY) || "";
        if (storedToken) {
          const [cachedUser, cachedData] = await Promise.all([loadOfflineSnapshot("auth-user"), loadOfflineSnapshot("finance-data")]);
          if (cachedUser && cachedData) {
            setToken(storedToken);
            setAuth({ checking: false, registrationEnabled: true, user: cachedUser });
            setData(cachedData);
            setLoading(false);
            setError("");
            return;
          }
        }
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
    const periodStart = data.period?.start || "";
    const periodEnd = data.period?.end || "";
    return data.transactions.filter((transaction) => {
      const matchesFilter = transactionFilter === "all" || transaction.type === transactionFilter;
      const matchesQuery = !query || `${transaction.description} ${transaction.categoryName ?? ""} ${transaction.parentCategoryName ?? ""} ${transaction.accountName}`.toLocaleLowerCase("es").includes(query);
      const date = String(transaction.transactionDate || "");
      const matchesPeriod = transactionPeriodFilter === "all" || (!periodStart || !periodEnd) || (date >= periodStart && date <= periodEnd);
      return matchesFilter && matchesQuery && matchesPeriod;
    });
  }, [data.transactions, data.period, search, transactionFilter, transactionPeriodFilter]);

  function handleAuthenticated(session) {
    localStorage.setItem(TOKEN_KEY, session.token);
    setToken(session.token);
    setAuth((current) => ({ checking: false, registrationEnabled: current.registrationEnabled, user: session.user }));
    void saveOfflineSnapshot("auth-user", session.user);
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
      if (modal.kind === "budget" || modal.kind === "budget-delete") payload.categoryId = modal.referenceId;
      if (["recurring-update", "recurring-delete", "recurring-paid"].includes(modal.kind)) payload.recurringId = modal.referenceId;
      if (modal.kind === "account-update" || modal.kind === "account-delete") payload.accountId = modal.referenceId;
      if (modal.kind === "category" && modal.referenceId) payload.parentId = modal.referenceId;
      if (modal.kind === "category-update" || modal.kind === "category-delete") payload.categoryId = modal.referenceId;
      if (["credit-card-update", "credit-card-delete", "credit-card-payment", "credit-card-consumption"].includes(modal.kind)) payload.cardId = modal.referenceId;
      if (["debt-update", "debt-delete", "debt-payment"].includes(modal.kind)) payload.debtId = modal.referenceId;
      if (["goal-update", "goal-delete"].includes(modal.kind)) payload.goalId = modal.referenceId;
    }

    if (["transaction", "transfer"].includes(payload.action) && !payload.externalRef) {
      payload.externalRef = "device:" + (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
        void saveOfflineSnapshot("auth-user", result.user);
        await refresh(token);
        setModal(null);
        setNotice("Tu propósito y período quedaron actualizados.");
        window.setTimeout(() => setNotice(""), 3500);
        return;
      }

      const { response, result } = await apiRequest("/api/finance", {
        method: "POST",
        body: JSON.stringify(payload),
      }, token);
      if (response.status === 202 && result?.queued) {
        setModal(null);
        setNotice(`Movimiento guardado sin conexión. Clara lo sincronizará cuando vuelva internet.`);
        void pwa.refreshQueueCount();
        window.setTimeout(() => setNotice(""), 5000);
        return;
      }
      if (response.status === 401) {
        clearSession();
        return;
      }
      if (!response.ok || !result?.data) throw new Error(result?.error || "No se pudo guardar la operación.");
      setData(result.data);
      void saveOfflineSnapshot("finance-data", result.data);
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
    const firstName = fields.get("firstName");
    const lastName = fields.get("lastName");
    try {
      const { response, result } = await apiRequest("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ currencyCode, phone, firstName, lastName }),
      }, token);
      if (response.status === 401) {
        clearSession();
        return;
      }
      if (!response.ok || !result?.user) throw new Error(result?.error || "No se pudieron guardar las preferencias.");
      setAuth((current) => ({ ...current, user: result.user }));
      void saveOfflineSnapshot("auth-user", result.user);
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
      void saveOfflineSnapshot("auth-user", result.user);
      setProfileWizardOpen(false);
      setNotice("Clara ya conoce cómo quieres organizarte.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar tu perfil financiero.");
    } finally {
      setOnboardingSaving(false);
    }
  }

  useEffect(() => {
    const handleSynced = () => { if (token && navigator.onLine) void refresh(token); };
    window.addEventListener("clara:queue-synced", handleSynced);
    return () => window.removeEventListener("clara:queue-synced", handleSynced);
  }, [token]);

  useEffect(() => {
    if (!auth.user || !auth.user.onboardingCompleted) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("quick") === "expense") {
      openModal("expense");
      params.delete("quick");
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    }
  }, [auth.user?.id, auth.user?.onboardingCompleted]);

  async function logout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" }, token);
    } finally {
      await pwa.clearQueue().catch(() => {});
      setSettingsOpen(false);
      clearSession();
    }
  }

  const pwaInstallUi = <>
    {pwa.showInstallPrompt && <PwaInstallPrompt pwa={pwa} />}
    {pwa.showIosGuide && <IosInstallGuide onClose={() => pwa.setShowIosGuide(false)} />}
  </>;

  if (auth.checking) return <><LoadingScreen />{pwaInstallUi}</>;
  if (!auth.user) return <><AuthScreen registrationEnabled={auth.registrationEnabled} onAuthenticated={handleAuthenticated} />{pwaInstallUi}</>;
  if (!auth.user.onboardingCompleted || profileWizardOpen) return <MoneyContext.Provider value={moneyTools}><OnboardingWizard user={auth.user} saving={onboardingSaving} error={error} onSubmit={finishOnboarding} editing={profileWizardOpen && auth.user.onboardingCompleted} onCancel={auth.user.onboardingCompleted ? () => { setProfileWizardOpen(false); setError(""); } : null} />{pwaInstallUi}</MoneyContext.Provider>;

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
            <span className="period-pill"><Icon name="calendar" size={14} /> {data.period?.shortLabel || "Periodo actual"}</span>
            <span className={!pwa.online ? "save-status offline" : loading ? "save-status loading" : "save-status"}>
              <i /> {!pwa.online ? (pwa.queueCount ? `Sin conexión · ${pwa.queueCount} pendiente${pwa.queueCount === 1 ? "" : "s"}` : "Sin conexión") : loading ? "Sincronizando…" : "Todo guardado"}
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
          periodFilter={transactionPeriodFilter}
          setPeriodFilter={setTransactionPeriodFilter}
          period={data.period}
          openModal={openModal}
        />}
        {activeView === "presupuesto" && <BudgetView data={data} openModal={openModal} goTo={setActiveView} />}
        {activeView === "calendario" && <CalendarView data={data} openModal={openModal} />}
        {activeView === "categorias" && <CategoriesView data={data} openModal={openModal} />}
        {activeView === "credito" && <CreditView data={data} openModal={openModal} />}
        {activeView === "metas" && <GoalsView data={data} openModal={openModal} />}
        {activeView === "analisis" && <InsightsView data={data} goTo={setActiveView} />}
        {activeView === "cuentas" && <AccountsView data={data} openModal={openModal} showBalance={showBalance} />}
      </main>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        {mobileNavItems.map((item) => <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => { setActiveView(item.id); setMobileMenuOpen(false); }}><span><Icon name={item.icon} size={22} /></span><small>{item.mobileLabel || item.label}</small></button>)}
        <button className={mobileMoreItems.some((item) => item.id === activeView) || mobileMenuOpen ? "active" : ""} onClick={() => setMobileMenuOpen((value) => !value)}><span><Icon name="circleMore" size={22} /></span><small>Más</small></button>
      </nav>
      {mobileMenuOpen && <div className="mobile-more-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileMenuOpen(false); }}><section className="mobile-more-sheet"><div className="mobile-sheet-handle"/><div className="mobile-sheet-head"><div><p className="eyebrow">Más de Clara</p><h2>Tu centro financiero</h2></div><button className="icon-button" onClick={() => setMobileMenuOpen(false)}><Icon name="close" size={18}/></button></div><div className="mobile-more-grid">{mobileMoreItems.map((item)=><button key={item.id} className={activeView===item.id?"active":""} onClick={()=>{setActiveView(item.id);setMobileMenuOpen(false);}}><span><Icon name={item.icon} size={22}/></span><div><strong>{item.label}</strong><small>{item.id==="analisis"?"Insights y predicciones":item.id==="metas"?"Metas y patrimonio":item.id==="credito"?"Tarjetas y obligaciones":item.id==="cuentas"?"Saldos e instituciones":"Tu organización"}</small></div><Icon name="chevronRight" size={16}/></button>)}</div><button className="mobile-settings-link" onClick={()=>{setMobileMenuOpen(false);setSettingsOpen(true);}}><Icon name="settings" size={20}/><span><strong>Perfil y preferencias</strong><small>Datos personales, moneda y seguridad</small></span><Icon name="chevronRight" size={16}/></button></section></div>}

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
        pwa={pwa}
      />}
      {pwaInstallUi}
    </div>
  </MoneyContext.Provider>;
}

function viewTitle(view) {
  const titles = {
    inicio: "Tu dinero, bien pensado.",
    movimientos: "Cada movimiento cuenta.",
    presupuesto: "Haz que cada monto tenga un propósito.",
    calendario: "Anticípate a lo que viene.",
    categorias: "Ordena tu dinero a tu manera.",
    credito: "Entiende lo que debes y lo que tienes disponible.",
    metas: "Convierte tus planes en avances concretos.",
    analisis: "Clara interpreta tus números contigo.",
    cuentas: "Todo tu dinero, en orden.",
  };
  return titles[view];
}

function Dashboard({ data, showBalance, setShowBalance, openModal, goTo, user }) {
  const { money, moneyFor, shortMoney, currencySymbol, currencyCode } = useMoney();
  const savingsRate = data.summary.monthlyIncome
    ? Math.max(0, Math.round(((data.summary.monthlyIncome - data.summary.monthlyExpenses) / data.summary.monthlyIncome) * 100))
    : 0;
  const flow = buildFlowBars(data.transactions, data.period, currencyCode);
  const labels = chartLabels(data.period);
  const profile = user?.profile || {};
  const planningLabel = profile.planningPeriod === "biweekly" ? "quincena" : "mes";
  const expectedMargin = Math.max(Number(profile.incomeAmount || 0) - Number(profile.fixedExpenses || 0), 0);
  const analytics = data.analytics || EMPTY_DATA.analytics;
  const emergency = data.emergencyFund || EMPTY_DATA.emergencyFund;
  const nextPayday = nextPaydayLabel(profile);

  return <div className="dashboard-grid">
    <div className="dashboard-primary">
      <section className="balance-hero premium-hero">
        <div className="hero-topline">
          <span>Patrimonio neto estimado</span>
          <button className="icon-button" onClick={() => setShowBalance(!showBalance)} aria-label={showBalance ? "Ocultar saldos" : "Mostrar saldos"}>
            <Icon name={showBalance ? "eye" : "eyeOff"} size={16} />
          </button>
        </div>
        <strong className="hero-balance">{showBalance ? money(data.summary.netWorth ?? data.summary.totalBalance) : `${currencySymbol} ••••••`}</strong>
        <div className="hero-meta">
          <span><i className="positive-dot" /> Seguro para gastar <strong>{showBalance ? money(data.summary.safeToSpend ?? data.summary.budgetAvailable) : "••••"}</strong></span>
          <span className="hero-change">{data.summary.budgetAlertCount ? `${data.summary.budgetAlertCount} alerta${data.summary.budgetAlertCount === 1 ? "" : "s"}` : `${savingsRate}% libre`}</span>
        </div>
        {data.summary.hasMixedCurrencies && <div className="currency-total-strip">
          {Object.entries(data.summary.currencyTotals || {}).map(([code, total]) => <span key={code}><small>{code}</small><strong>{showBalance ? moneyFor(total, code) : `${currencyInfo(code).symbol} ••••`}</strong></span>)}
        </div>}
        <div className="quick-actions">
          <button onClick={() => openModal("expense")}><span className="quick-icon coral"><Icon name="minus" size={18} /></span><span><strong>Gasto</strong><small>Registrar salida</small></span></button>
          <button onClick={() => openModal("income")}><span className="quick-icon mint"><Icon name="plus" size={18} /></span><span><strong>Ingreso</strong><small>Sumar dinero</small></span></button>
          <button onClick={() => openModal("transfer")}><span className="quick-icon sky"><Icon name="transfer" size={18} /></span><span><strong>Transferir</strong><small>Entre cuentas</small></span></button>
        </div>
      </section>

      <section className="section-card cashflow-card elevated-card">
        <div className="section-heading">
          <div><p className="eyebrow">{data.period?.label || currentMonthLabel()}</p><h2>Flujo del {data.period?.mode === "biweekly" ? "período" : "mes"}</h2></div>
          <div className="flow-legend">
            <span><i className="income-dot" /> Entró <strong>{shortMoney(data.summary.monthlyIncome)}</strong></span>
            <span><i className="expense-dot" /> Salió <strong>{shortMoney(data.summary.monthlyExpenses)}</strong></span>
          </div>
        </div>
        <div className={flow.hasActivity ? "flow-chart" : "flow-chart empty"} aria-label={`Gráfico del flujo de dinero de ${data.period?.label || monthName()}`}>
          {flow.bars.map((bar, index) => <span className="bar-track" key={index}><i className={bar.highlight ? "chart-bar highlight" : "chart-bar"} style={{ height: `${bar.height}%` }} /></span>)}
          {!flow.hasActivity && <span className="flow-empty-message"><Icon name="chart" size={18} /> Aún no hay movimientos en este período.</span>}
        </div>
        <div className="chart-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div>
      </section>

      <section className="section-card elevated-card">
        <div className="section-heading">
          <div><p className="eyebrow">Plan del período</p><h2>Dinero con propósito</h2></div>
          <button className="text-button" onClick={() => goTo("presupuesto")}>Ver presupuesto <Icon name="chevronRight" size={14} /></button>
        </div>
        <div className="budget-list compact">
          {data.categories.filter((category) => !category.parentId).slice(0, 4).map((category) => <BudgetRow key={category.id} category={category} onEdit={() => openModal("budget", category.id)} compact />)}
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

      <section className="clara-pulse-card dynamic-insight-card"><div className="pulse-card-head"><span className="pulse-icon"><Icon name="pulse" size={18}/></span><span className="pulse-score"><strong>{analytics.claraIndex || 0}</strong><small>/100</small></span></div><div className="pulse-title-row"><div><p className="eyebrow light">Índice Clara</p><h2>{analytics.claraIndexLabel || "Construyendo tu panorama"}</h2></div><span className="pulse-badge">Dinámico</span></div><div className="pulse-track"><i style={{width:`${analytics.claraIndex||0}%`}}/></div><p className="pulse-recommendation">{analytics.primaryRecommendation?.message || "Sigue registrando tus movimientos para que Clara pueda interpretar mejor tus hábitos."}</p><div className="pulse-metrics"><span><Icon name="clock" size={15}/><small>Próximo cobro</small><strong>{nextPayday}</strong></span><span><Icon name="shield" size={15}/><small>Fondo de emergencia</small><strong>{emergency.coverageMonths || 0} meses</strong></span></div><button className="text-button insight-link" onClick={()=>goTo("analisis")}>Ver análisis completo <Icon name="chevronRight" size={14}/></button><small className="pulse-disclaimer">Indicador interno de organización financiera. No es un score bancario ni crediticio.</small></section>

      <section className="section-card accounts-summary elevated-card">
        <div className="section-heading"><div><p className="eyebrow">Saldos</p><h2>Mis cuentas</h2></div><button className="mini-add" onClick={() => openModal("account")} aria-label="Añadir cuenta"><Icon name="plus" size={16} /></button></div>
        <div className="account-stack">
          {data.accounts.map((account) => <div className="account-row" key={account.id}>
            <span className={`account-symbol ${account.color}`}><Icon name={account.institutionType === "cooperative" ? "users" : account.kind === "cash" ? "wallet" : "building"} size={15} /></span>
            <span><strong>{account.name}</strong><small>{accountSubtitle(account)}</small></span>
            <strong>{showBalance ? moneyFor(account.balance, account.currencyCode) : "••••"}</strong>
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
          ? data.summary.budgetAlertCount
            ? `${data.summary.budgetAlertCount} sobre${data.summary.budgetAlertCount === 1 ? "" : "s"} necesita${data.summary.budgetAlertCount === 1 ? "" : "n"} atención. Has utilizado ${Math.round((Number(data.summary.budgetSpent || 0) / Math.max(Number(data.summary.budgetTotal || 0), 1)) * 100)}% de lo planificado.`
            : `Has utilizado ${Math.round((Number(data.summary.budgetSpent || 0) / Math.max(Number(data.summary.budgetTotal || 0), 1)) * 100)}% de lo planificado y Clara mantiene protegidos tus compromisos configurados.`
          : `Tu objetivo de ahorro está en ${profile.savingsTargetPercent || 10}%. Crea sobres para que Clara calcule cuánto puedes gastar con más tranquilidad.`}</strong>
      </section>
    </aside>
  </div>;
}

function TransactionsView({ transactions, search, setSearch, filter, setFilter, periodFilter, setPeriodFilter, period, openModal }) {
  return <section className="page-card">
    <div className="page-intro">
      <div>
        <p className="eyebrow">Motor financiero · {period?.shortLabel || "Periodo actual"}</p>
        <h2>Movimientos</h2>
        <p>Ingresos, gastos y transferencias quedan separados para que mover dinero entre tus cuentas nunca parezca un gasto.</p>
      </div>
      <div className="split-actions"><button className="secondary-action" onClick={() => openModal("income")}><Icon name="plus" size={15} /> Ingreso</button><button className="primary-action" onClick={() => openModal("expense")}><Icon name="plus" size={15} /> Gasto</button></div>
    </div>
    <div className="transaction-toolbar finance-toolbar">
      <label className="search-field"><span><Icon name="search" size={16} /></span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por concepto, cuenta o categoría" aria-label="Buscar movimientos" /></label>
      <div className="toolbar-groups">
        <div className="filter-chips" aria-label="Filtrar movimientos">
          {[["all", "Todos"], ["expense", "Gastos"], ["income", "Ingresos"], ["transfer", "Transferencias"]].map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        <div className="filter-chips period-filter" aria-label="Filtrar por período">
          <button className={periodFilter === "current" ? "active" : ""} onClick={() => setPeriodFilter("current")}>{period?.mode === "biweekly" ? "Esta quincena" : "Este mes"}</button>
          <button className={periodFilter === "all" ? "active" : ""} onClick={() => setPeriodFilter("all")}>Todo</button>
        </div>
      </div>
    </div>
    <div className="period-context-banner"><Icon name="calendar" size={15} /><span><strong>{period?.label || "Periodo actual"}</strong><small>La planificación del perfil define qué fechas forman tu período activo.</small></span></div>
    <div className="table-head"><span>Movimiento</span><span>Categoría</span><span>Cuenta</span><span>Fecha</span><span>Monto</span></div>
    <TransactionList transactions={transactions} detailed />
    {!transactions.length && <div className="empty-state"><span><Icon name="activity" size={24} /></span><h3>No hay movimientos para mostrar</h3><p>Prueba cambiando el período o registra un nuevo ingreso o gasto.</p></div>}
  </section>;
}

function BudgetView({ data, openModal, goTo }) {
  const { money } = useMoney();
  const plan = data.budgetPlan || EMPTY_DATA.budgetPlan;
  const assigned = Number(plan.assigned || data.summary.budgetTotal || 0);
  const used = Number(plan.spent || data.summary.budgetSpent || 0);
  const periodWord = data.period?.mode === "biweekly" ? "quincena" : "mes";
  const safeUntilLabel = plan.safeUntil ? prettyDate(plan.safeUntil) : `fin de ${periodWord}`;
  const roots = data.categories.filter((category) => !category.parentId);

  return <>
    <section className="safe-spend-hero">
      <div className="safe-spend-main">
        <span className="safe-spend-icon"><Icon name="shield" size={22} /></span>
        <div>
          <p className="eyebrow light">Dinero seguro para gastar</p>
          <h2>{money(plan.safeToSpend || 0)}</h2>
          <p>Estimación disponible hasta {safeUntilLabel}, después de proteger tus compromisos conocidos y la reserva de ahorro configurada.</p>
        </div>
      </div>
      <div className="safe-spend-daily">
        <small>Ritmo diario sugerido</small>
        <strong>{money(plan.dailySafeToSpend || 0)}</strong>
        <span>por día · {plan.daysForSafeSpend || 1} día{Number(plan.daysForSafeSpend || 1) === 1 ? "" : "s"}</span>
      </div>
      <div className="safe-spend-breakdown">
        <span><Icon name="wallet" size={15} /><small>Dinero líquido</small><strong>{money(plan.liquidBalance || 0)}</strong></span>
        <span><Icon name="calendar" size={15} /><small>Compromisos protegidos</small><strong>{money(plan.protectedCommitments || plan.fixedReserve || 0)}</strong></span>
        <span><Icon name="target" size={15} /><small>Reserva de ahorro</small><strong>{money(plan.savingsReserve || 0)}</strong></span>
      </div>
      {plan.usingProfileFixedFallback && <p className="safe-spend-note"><Icon name="info" size={14} /> Clara está usando los gastos fijos aproximados de tu perfil. Marca sobres como “Compromiso fijo” para que este cálculo sea más preciso.</p>}
      {Number(plan.recurringReserve || 0) > 0 && <p className="safe-spend-note"><Icon name="repeat" size={14} /> Clara añadió {money(plan.recurringReserve)} de pagos recurrentes que todavía no estaban cubiertos por tus sobres fijos.</p>}
      <p className="safe-spend-disclaimer">Es una estimación basada en lo que has registrado en Clara; no incluye cargos o pagos que todavía no estén configurados.</p>
    </section>

    <section className="budget-overview">
      <div>
        <p className="eyebrow light">Presupuesto · {data.period?.label || monthName()}</p>
        <h2>{money(Math.max(assigned - used, 0))} <span>todavía disponibles en tus sobres</span></h2>
        <p>{assigned ? `Has utilizado ${money(used)} de ${money(assigned)} planificados para esta ${periodWord}.` : `Aún no has creado sobres para esta ${periodWord}. Puedes empezar categoría por categoría o copiar tu plan anterior.`}</p>
      </div>
      <div className="budget-ring" style={{ "--progress": `${percentage(used, assigned) * 3.6}deg` }}>
        <span><strong>{percentage(used, assigned)}%</strong><small>utilizado</small></span>
      </div>
      <div className="overview-metrics">
        <span><small>Ingreso de referencia</small><strong>{money(plan.incomeReference || data.summary.periodIncome || 0)}</strong></span>
        <span><small>Asignado</small><strong>{money(assigned)}</strong></span>
        <span><small>Sin asignar</small><strong>{money(plan.unassigned || 0)}</strong></span>
      </div>
    </section>

    {plan.alerts?.length > 0 && <section className="budget-alert-center">
      <div className="budget-alert-heading">
        <span className="alert-center-icon"><Icon name="pulse" size={18} /></span>
        <div><p className="eyebrow">Alertas del período</p><h2>Hay sobres que necesitan atención</h2></div>
        <strong>{plan.alerts.length}</strong>
      </div>
      <div className="budget-alert-list">
        {plan.alerts.slice(0, 6).map((alert) => <button key={`${alert.categoryId}-${alert.parentId || 0}`} className={`budget-alert ${alert.level}`} onClick={() => openModal("budget", alert.categoryId)}>
          <span><strong>{alert.name}</strong><small>{alert.percentage >= 100 ? "Superaste el límite" : alert.percentage >= 90 ? "Muy cerca del límite" : "Ya usaste más del 70%"}</small></span>
          <span><b>{alert.percentage}%</b><small>{money(alert.remaining)} restantes</small></span>
        </button>)}
      </div>
    </section>}

    <section className="page-card">
      <div className="page-intro compact-intro budget-plan-heading">
        <div><p className="eyebrow">Sobres del período</p><h2>Decide qué trabajo hará cada peso</h2><p>Cada sobre pertenece exclusivamente a <strong>{data.period?.label || "este período"}</strong>. Puedes marcarlo como compromiso fijo, gasto flexible o reserva de ahorro.</p></div>
        <div className="split-actions">
          <button className="secondary-action" onClick={() => openModal("budget-copy")}><Icon name="refresh" size={15} /> Usar plan anterior</button>
          <button className="secondary-action" onClick={() => goTo("categorias")}><Icon name="tags" size={15} /> Categorías</button>
        </div>
      </div>
      {plan.legacyEnvelopes > 0 && <div className="period-context-banner budget-migration-banner"><Icon name="info" size={15} /><span><strong>Plan heredado de Clara 3.0</strong><small>{plan.legacyEnvelopes} límite{plan.legacyEnvelopes === 1 ? "" : "s"} se está usando como referencia. Al editar cada sobre quedará guardado específicamente para esta {periodWord}.</small></span></div>}
      <div className="budget-grid">
        {roots.map((category) => {
          const children = data.categories.filter((child) => child.parentId === category.id);
          return <div className="budget-envelope-group" key={category.id}>
            <BudgetRow category={category} onEdit={() => openModal("budget", category.id)} onDelete={() => openModal("budget-delete", category.id)} />
            {children.length > 0 && <div className="budget-subenvelopes">
              {children.map((child) => <BudgetRow key={child.id} category={child} compact onEdit={() => openModal("budget", child.id)} onDelete={() => openModal("budget-delete", child.id)} />)}
            </div>}
          </div>;
        })}
      </div>
      {!roots.length && <div className="empty-state"><span><Icon name="budget" size={24} /></span><h3>Crea tu primera categoría</h3><p>Después podrás asignarle un sobre para este período.</p></div>}
    </section>
  </>;
}


function CalendarView({ data, openModal }) {
  const { money, moneyFor } = useMoney();
  const calendar = data.calendar || EMPTY_DATA.calendar;
  const recurring = data.recurringPayments || [];
  const start = calendar.monthStart || `${todayIso().slice(0, 7)}-01`;
  const end = calendar.monthEnd || start;
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const firstOffset = (startDate.getDay() + 6) % 7;
  const totalDays = endDate.getDate();
  const cells = Array.from({ length: firstOffset + totalDays }, (_, index) => {
    if (index < firstOffset) return null;
    const day = index - firstOffset + 1;
    return `${start.slice(0, 8)}${String(day).padStart(2, "0")}`;
  });
  while (cells.length % 7) cells.push(null);
  const eventsByDate = new Map();
  for (const event of calendar.events || []) {
    if (!eventsByDate.has(event.date)) eventsByDate.set(event.date, []);
    eventsByDate.get(event.date).push(event);
  }
  const monthLabel = new Intl.DateTimeFormat("es-DO", { month: "long", year: "numeric" }).format(startDate);
  const today = todayIso();
  const next = [...(calendar.overdue || []), ...(calendar.upcoming || [])][0] || null;

  return <section className="calendar-page">
    <div className="page-heading calendar-heading">
      <div><p className="eyebrow">Calendario financiero</p><h2>Lo que viene, antes de que llegue</h2><p>Organiza cobros y compromisos recurrentes. Clara los usa para proteger mejor tu dinero disponible.</p></div>
      <button className="primary-action" onClick={() => openModal("recurring")}><Icon name="plus" size={15} /> Nuevo compromiso</button>
    </div>

    <div className="calendar-kpis">
      <article><span><Icon name="clock" size={18} /></span><small>Próximos 7 días</small><strong>{money(calendar.windows?.days7?.total || 0)}</strong><em>{calendar.windows?.days7?.count || 0} compromiso(s)</em></article>
      <article><span><Icon name="calendar" size={18} /></span><small>Próximos 15 días</small><strong>{money(calendar.windows?.days15?.total || 0)}</strong><em>{calendar.windows?.days15?.count || 0} compromiso(s)</em></article>
      <article><span><Icon name="repeat" size={18} /></span><small>Pagos activos</small><strong>{recurring.length}</strong><em>programados en Clara</em></article>
      <article><span><Icon name="shield" size={18} /></span><small>Protegido hasta cobrar</small><strong>{money(data.budgetPlan?.protectedCommitments || 0)}</strong><em>fijos + recurrentes pendientes</em></article>
    </div>

    {(calendar.overdue || []).length > 0 && <div className="calendar-overdue-banner">
      <span><Icon name="alertTriangle" size={19} /></span>
      <div><strong>Tienes {calendar.overdue.length} compromiso(s) vencido(s)</strong><p>Márcalos como pagados o actualiza la fecha para que el cálculo de Clara vuelva a estar al día.</p></div>
    </div>}

    <div className="calendar-layout">
      <article className="calendar-board page-card">
        <div className="calendar-board-head"><div><p className="eyebrow">Vista mensual</p><h3>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</h3></div><span className="calendar-legend"><i className="payday" /> Cobro <i className="commitment" /> Recurrente <i className="liability" /> Crédito/deuda</span></div>
        <div className="calendar-weekdays">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">
          {cells.map((date, index) => {
            if (!date) return <span className="calendar-day empty" key={`empty-${index}`} />;
            const events = eventsByDate.get(date) || [];
            return <div className={`calendar-day ${date === today ? "today" : ""}`} key={date}>
              <span className="calendar-day-number">{Number(date.slice(8, 10))}</span>
              <div className="calendar-day-events">
                {events.slice(0, 3).map((event) => <button key={event.id} className={`calendar-event ${event.type} ${event.overdue ? "overdue" : ""}`} onClick={() => event.cardId ? openModal("credit-card-update", event.cardId) : event.debtId ? openModal("debt-update", event.debtId) : event.recurringId ? openModal("recurring-update", event.recurringId) : null} title={event.title}>
                  <i /> <span>{event.title}</span>
                </button>)}
                {events.length > 3 && <small>+{events.length - 3} más</small>}
              </div>
            </div>;
          })}
        </div>
      </article>

      <aside className="calendar-side">
        <article className="page-card next-commitment-card">
          <p className="eyebrow">Más próximo</p>
          {next ? <>
            <span className="next-commitment-icon"><Icon name={next.overdue ? "alertTriangle" : "bell"} size={22} /></span>
            <h3>{next.name}</h3>
            <strong>{moneyFor(next.amount, next.currencyCode)}</strong>
            <p>{next.overdue ? `Venció el ${longDate(next.date)}` : `Programado para ${longDate(next.date)}`}</p>
          </> : <><span className="next-commitment-icon"><Icon name="checkCircle" size={22} /></span><h3>Sin compromisos próximos</h3><p>Tu calendario está libre por ahora.</p></>}
        </article>

        <article className="page-card upcoming-list-card">
          <div className="section-heading"><div><p className="eyebrow">Próximos 30 días</p><h3>Compromisos</h3></div></div>
          <div className="upcoming-list">
            {[...(calendar.overdue || []), ...(calendar.upcoming || [])].slice(0, 8).map((item, index) => <button key={`${item.kind || "recurring"}-${item.id}-${item.date}-${index}`} onClick={() => item.kind === "card" ? openModal("credit-card-update", item.referenceId || item.id) : item.kind === "debt" ? openModal("debt-update", item.referenceId || item.id) : openModal("recurring-update", item.referenceId || item.id)}>
              <span className={`upcoming-date ${item.overdue ? "overdue" : ""}`}><strong>{Number(item.date.slice(8, 10))}</strong><small>{new Intl.DateTimeFormat("es-DO", { month: "short" }).format(new Date(`${item.date}T12:00:00`)).replace(".", "")}</small></span>
              <span><strong>{item.name}</strong><small>{item.categoryName || "Compromiso"} · {item.accountName || "Cuenta"}</small></span>
              <b>{moneyFor(item.amount, item.currencyCode)}</b>
            </button>)}
            {!calendar.overdue?.length && !calendar.upcoming?.length && <div className="compact-empty"><Icon name="calendar" size={20} /><span>No hay pagos programados en los próximos 30 días.</span></div>}
          </div>
        </article>
      </aside>
    </div>

    <section className="page-card recurring-section">
      <div className="section-heading"><div><p className="eyebrow">Automatiza tu planificación</p><h2>Pagos recurrentes</h2><p>Alquiler, internet, universidad, seguros, suscripciones y cualquier compromiso que vuelva a repetirse.</p></div><button className="secondary-action" onClick={() => openModal("recurring")}><Icon name="plus" size={15} /> Añadir</button></div>
      <div className="recurring-grid">
        {recurring.map((item) => {
          const category = data.categories.find((categoryItem) => categoryItem.id === item.categoryId) || { id: item.categoryId, parentId: item.parentCategoryId, color: item.categoryColor };
          return <article className={`recurring-card ${item.nextDueDate < today ? "overdue" : ""}`} key={item.id}>
            <div className="recurring-card-top">
              <span className={`category-icon-tile ${item.categoryColor || "mint"}`}><CategoryIcon category={category} size={19} /></span>
              <span><strong>{item.name}</strong><small>{item.frequencyLabel} · {item.categoryName}</small></span>
              <div className="recurring-actions"><button onClick={() => openModal("recurring-update", item.id)} title="Editar"><Icon name="edit" size={14} /></button><button className="danger-icon" onClick={() => openModal("recurring-delete", item.id)} title="Eliminar"><Icon name="trash" size={14} /></button></div>
            </div>
            <div className="recurring-amount"><strong>{moneyFor(item.amount, item.currencyCode)}</strong><span>{item.isMandatory ? "Compromiso obligatorio" : "Pago flexible"}</span></div>
            <div className="recurring-meta"><span><Icon name="calendar" size={13} /> {item.nextDueDate < today ? "Vencido" : "Próximo"}: {prettyDate(item.nextDueDate)}</span><span><Icon name="wallet" size={13} /> {item.accountName}</span></div>
            <button className="recurring-paid-button" onClick={() => openModal("recurring-paid", item.id)}><Icon name="checkCircle" size={15} /> Marcar como pagado</button>
          </article>;
        })}
        {!recurring.length && <button className="recurring-empty-card" onClick={() => openModal("recurring")}><span><Icon name="repeat" size={24} /></span><strong>Crea tu primer compromiso recurrente</strong><small>Clara podrá anticiparlo antes de decirte cuánto dinero es seguro gastar.</small></button>}
      </div>
    </section>
  </section>;
}

function CategoriesView({ data, openModal }) {
  const roots = data.categories.filter((category) => !category.parentId);
  const customCount = data.categories.filter((category) => !category.isSystem).length;
  return <section className="page-card category-manager">
    <div className="page-intro">
      <div><p className="eyebrow">Organización personal</p><h2>Categorías y subcategorías</h2><p>Usa las categorías base de Clara o crea las tuyas. Cada perfil mantiene su propia organización.</p></div>
      <div className="split-actions category-heading-actions">
        {Number(data.hiddenSystemCategoriesCount || 0) > 0 && <button className="secondary-action" onClick={() => openModal("category-restore")}><Icon name="refresh" size={15} /> Restaurar base</button>}
        <button className="primary-action" onClick={() => openModal("category")}><Icon name="plus" size={15} /> Nueva categoría</button>
      </div>
    </div>
    <div className="category-summary-strip">
      <span><Icon name="layers" size={17} /><small>Categorías visibles</small><strong>{data.categories.length}</strong></span>
      <span><Icon name="user" size={17} /><small>Creadas por ti</small><strong>{customCount}</strong></span>
      <span><Icon name="shield" size={17} /><small>Base Clara</small><strong>{data.categories.filter((category) => category.isSystem).length}</strong></span>
    </div>
    <div className="category-groups">
      {roots.map((category) => {
        const children = data.categories.filter((child) => child.parentId === category.id);
        return <article className="category-group-card" key={category.id}>
          <div className="category-group-head">
            <span className={`category-icon-tile ${category.color}`}><CategoryIcon category={category} size={19} /></span>
            <div><strong>{category.name}</strong><small>{category.isSystem ? "Categoría base de Clara" : "Categoría personalizada"}</small></div>
            <div className="category-actions">
              <button onClick={() => openModal("category", category.id)} title="Crear subcategoría"><Icon name="plus" size={14} /></button>
              {!category.isSystem && <button onClick={() => openModal("category-update", category.id)} title="Editar"><Icon name="edit" size={14} /></button>}
              <button className="danger-icon" onClick={() => openModal("category-delete", category.id)} title={category.isSystem ? "Ocultar de mi perfil" : "Eliminar"}><Icon name="trash" size={14} /></button>
            </div>
          </div>
          <div className="subcategory-list">
            {children.map((child) => <div className="subcategory-row" key={child.id}>
              <span className={`subcategory-dot ${child.color}`} />
              <span><strong>{child.name}</strong><small>Dentro de {category.name}</small></span>
              <div className="category-actions">
                {!child.isSystem && <button onClick={() => openModal("category-update", child.id)} title="Editar"><Icon name="edit" size={13} /></button>}
                {!child.isSystem && <button className="danger-icon" onClick={() => openModal("category-delete", child.id)} title="Eliminar"><Icon name="trash" size={13} /></button>}
              </div>
            </div>)}
            {!children.length && <button className="subcategory-empty" onClick={() => openModal("category", category.id)}><Icon name="plus" size={13} /> Añadir subcategoría</button>}
          </div>
        </article>;
      })}
    </div>
    {!roots.length && <div className="empty-state"><span><Icon name="tags" size={24} /></span><h3>Empieza creando una categoría</h3><p>Podrás usarla inmediatamente al registrar gastos.</p></div>}
  </section>;
}

function CreditView({ data, openModal }) {
  const { money, moneyFor } = useMoney();
  const cards = data.creditCards || [];
  const debts = data.debts || [];
  const payments = data.liabilityPayments || [];
  const summary = data.summary || {};
  const primary = summary.primaryCurrency || "DOP";

  return <section className="credit-page">
    <div className="page-heading credit-heading">
      <div><p className="eyebrow">Crédito bajo control</p><h2>Tarjetas y deudas</h2><p>Registra lo que debes, fechas importantes y pagos. Clara separa las obligaciones del dinero disponible para que no confundas crédito con efectivo.</p></div>
      <div className="split-actions"><button className="secondary-action" onClick={() => openModal("debt")}><Icon name="plus" size={15} /> Nueva deuda</button><button className="primary-action" onClick={() => openModal("credit-card")}><Icon name="creditCard" size={15} /> Nueva tarjeta</button></div>
    </div>

    <div className="credit-kpis">
      <article><span><Icon name="creditCard" size={18} /></span><small>Usado en tarjetas</small><strong>{money(summary.creditUsedTotal || 0)}</strong><em>de {money(summary.creditLimitTotal || 0)} de límite</em></article>
      <article><span><Icon name="wallet" size={18} /></span><small>Crédito disponible</small><strong>{money(summary.creditAvailableTotal || 0)}</strong><em>en {cards.filter((card) => card.currencyCode === primary).length} tarjeta(s) principales</em></article>
      <article><span><Icon name="trendingDown" size={18} /></span><small>Deudas pendientes</small><strong>{money(summary.debtBalanceTotal || 0)}</strong><em>sin contar tarjetas</em></article>
      <article><span><Icon name="shield" size={18} /></span><small>Patrimonio neto estimado</small><strong>{money(summary.netWorth || 0)}</strong><em>activos principales menos obligaciones</em></article>
    </div>

    <section className="page-card credit-section">
      <div className="section-heading"><div><p className="eyebrow">Tarjetas de crédito</p><h2>Uso y fechas clave</h2><p>El saldo usado es una obligación, no dinero disponible.</p></div><button className="secondary-action" onClick={() => openModal("credit-card")}><Icon name="plus" size={14} /> Añadir tarjeta</button></div>
      <div className="credit-card-grid">
        {cards.map((card) => <article className={`credit-card-item ${card.utilization >= 80 ? "high" : card.utilization >= 50 ? "medium" : ""}`} key={card.id}>
          <div className="credit-card-head"><span className="credit-card-icon"><Icon name="creditCard" size={19} /></span><span><strong>{card.name}</strong><small>{card.institutionName || "Tarjeta de crédito"} · {card.currencyCode}</small></span><div className="liability-actions"><button onClick={() => openModal("credit-card-update", card.id)} title="Editar"><Icon name="edit" size={14} /></button><button className="danger-icon" onClick={() => openModal("credit-card-delete", card.id)} title="Eliminar"><Icon name="trash" size={14} /></button></div></div>
          <div className="credit-card-balance"><span><small>Saldo utilizado</small><strong>{moneyFor(card.currentBalance, card.currencyCode)}</strong></span><span><small>Disponible</small><strong>{moneyFor(card.availableCredit, card.currencyCode)}</strong></span></div>
          <div className="liability-progress"><span><i style={{ width: `${Math.min(card.utilization, 100)}%` }} /></span><small>{card.utilization}% del límite utilizado</small></div>
          <div className="credit-card-dates"><span><Icon name="calendar" size={13} /><small>Corte</small><strong>Día {card.statementDay}</strong></span><span><Icon name="clock" size={13} /><small>Pago</small><strong>Día {card.dueDay}</strong></span><span><Icon name="coins" size={13} /><small>Mínimo</small><strong>{moneyFor(card.minimumPayment, card.currencyCode)}</strong></span><span><Icon name="shield" size={13} /><small>Recomendado</small><strong>{moneyFor(card.recommendedPayment, card.currencyCode)}</strong></span></div>
          <div className="liability-dual-actions"><button className="liability-consume-button" disabled={card.availableCredit <= 0} onClick={() => openModal("credit-card-consumption", card.id)}><Icon name="shoppingBag" size={15} /> Consumo</button><button className="liability-pay-button" disabled={card.currentBalance <= 0} onClick={() => openModal("credit-card-payment", card.id)}><Icon name="checkCircle" size={15} /> Pagar</button></div>
        </article>)}
        {!cards.length && <button className="liability-empty" onClick={() => openModal("credit-card")}><span><Icon name="creditCard" size={24} /></span><strong>Agrega tu primera tarjeta</strong><small>Podrás controlar límite, saldo utilizado, corte y fecha de pago.</small></button>}
      </div>
    </section>

    <section className="page-card credit-section">
      <div className="section-heading"><div><p className="eyebrow">Préstamos y financiamientos</p><h2>Deudas activas</h2><p>Ve cuánto has pagado, cuánto falta y cuál es tu próxima cuota.</p></div><button className="secondary-action" onClick={() => openModal("debt")}><Icon name="plus" size={14} /> Añadir deuda</button></div>
      <div className="debt-grid">
        {debts.map((debt) => <article className="debt-card" key={debt.id}>
          <div className="debt-card-head"><span className="debt-icon"><Icon name={debt.debtType === "vehicle" ? "car" : debt.debtType === "education" ? "graduation" : debt.debtType === "cooperative" ? "users" : "trendingDown"} size={19} /></span><span><strong>{debt.name}</strong><small>{debt.lender || debt.debtTypeLabel} · {debt.currencyCode}</small></span><div className="liability-actions"><button onClick={() => openModal("debt-update", debt.id)} title="Editar"><Icon name="edit" size={14} /></button><button className="danger-icon" onClick={() => openModal("debt-delete", debt.id)} title="Eliminar"><Icon name="trash" size={14} /></button></div></div>
          <div className="debt-balance"><small>Saldo pendiente</small><strong>{moneyFor(debt.currentBalance, debt.currencyCode)}</strong><span>de {moneyFor(debt.originalAmount, debt.currencyCode)}</span></div>
          <div className="liability-progress"><span><i style={{ width: `${debt.progress}%` }} /></span><small>{debt.progress}% pagado</small></div>
          <div className="debt-meta"><span><small>Cuota</small><strong>{moneyFor(debt.regularPayment, debt.currencyCode)}</strong></span><span><small>Próximo pago</small><strong>{debt.nextDueDate ? prettyDate(debt.nextDueDate) : "Sin fecha"}</strong></span><span><small>Interés anual</small><strong>{Number(debt.annualInterestRate || 0).toLocaleString("es-DO", { maximumFractionDigits: 3 })}%</strong></span><span><small>Fecha final</small><strong>{debt.endDate ? prettyDate(debt.endDate) : "Sin definir"}</strong></span></div>
          <button className="liability-pay-button" disabled={debt.currentBalance <= 0} onClick={() => openModal("debt-payment", debt.id)}><Icon name="checkCircle" size={15} /> Registrar cuota/pago</button>
        </article>)}
        {!debts.length && <button className="liability-empty" onClick={() => openModal("debt")}><span><Icon name="trendingDown" size={24} /></span><strong>Registra una deuda</strong><small>Préstamos, vehículos, cooperativas, educación, hipoteca y otros financiamientos.</small></button>}
      </div>
    </section>

    {(data.cardConsumptions || []).length > 0 && <section className="page-card liability-history-card">
      <div className="section-heading"><div><p className="eyebrow">Tarjetas</p><h2>Consumos recientes</h2><p>Estos consumos sí cuentan como gasto del período; pagar la tarjeta después no los duplica.</p></div></div>
      <div className="liability-history-list">{data.cardConsumptions.slice(0, 12).map((item) => <div key={item.id}><span className="history-icon"><Icon name="shoppingBag" size={14} /></span><span><strong>{item.description}</strong><small>{prettyDate(item.purchaseDate)} · {item.cardName} · {item.categoryName}{item.installments > 1 ? ` · ${item.installments} cuotas` : ""}</small></span><b>{moneyFor(item.amount, item.currencyCode)}</b></div>)}</div>
    </section>}

    {payments.length > 0 && <section className="page-card liability-history-card">
      <div className="section-heading"><div><p className="eyebrow">Trazabilidad</p><h2>Pagos recientes</h2></div></div>
      <div className="liability-history-list">{payments.slice(0, 12).map((payment) => {
        const item = payment.liabilityType === "card" ? cards.find((card) => card.id === payment.liabilityId) : debts.find((debt) => debt.id === payment.liabilityId);
        return <div key={payment.id}><span className="history-icon"><Icon name={payment.liabilityType === "card" ? "creditCard" : "trendingDown"} size={14} /></span><span><strong>{item?.name || (payment.liabilityType === "card" ? "Tarjeta" : "Deuda")}</strong><small>{prettyDate(payment.paymentDate)} · desde {payment.accountName}</small></span><b>{moneyFor(payment.amount, payment.currencyCode)}</b></div>;
      })}</div>
    </section>}
  </section>;
}

function GoalsView({ data, openModal }) {
  const { moneyFor, currencyCode } = useMoney(); const goals=data.goals||[]; const emergency=data.emergencyFund||EMPTY_DATA.emergencyFund; const wealth=data.wealth||EMPTY_DATA.wealth; const active=goals.filter((g)=>g.status!=="completed"); const total=goals.filter((g)=>g.currencyCode===currencyCode).reduce((sum,g)=>sum+g.currentAmount,0);
  return <div className="goals-page smart-goals-page"><section className="goal-hero-card"><div><p className="eyebrow light">Metas con rumbo</p><h2>Lo que quieres lograr, convertido en un plan.</h2><p>Clara calcula cuánto necesitas separar por mes o quincena y te dice si vas al ritmo correcto.</p></div><button className="primary-action light-action" onClick={()=>openModal("goal")}><Icon name="plus" size={16}/> Nueva meta</button><div className="goal-hero-metrics"><span><small>Reservado en {currencyCode}</small><strong>{moneyFor(total,currencyCode)}</strong></span><span><small>Metas activas</small><strong>{active.length}</strong></span><span><small>Patrimonio neto</small><strong>{moneyFor(wealth.netWorth||0,currencyCode)}</strong></span></div></section>
  <div className="goal-command-grid"><section className="section-card emergency-card"><div className="section-heading"><div><p className="eyebrow">Fondo de emergencia</p><h2>Tu colchón financiero</h2></div><span className="goal-round-icon"><Icon name="shield" size={19}/></span></div><div className="emergency-number"><strong>{moneyFor(emergency.currentAmount||0,currencyCode)}</strong><span>de {moneyFor(emergency.targetAmount||0,currencyCode)}</span></div><Progress value={emergency.percentage||0} color="mint"/><div className="emergency-stats"><span><small>Cobertura actual</small><strong>{emergency.coverageMonths||0} meses</strong></span><span><small>Referencia</small><strong>{emergency.recommendedMonths||3} meses</strong></span></div>{emergency.goalId?<button className="secondary-action full" onClick={()=>openModal("goal-contribution",emergency.goalId)}>Aportar al fondo</button>:<button className="secondary-action full" onClick={()=>openModal("goal")}>Crear fondo de emergencia</button>}</section><section className="section-card wealth-mini-card"><div className="section-heading"><div><p className="eyebrow">Patrimonio</p><h2>Evolución reciente</h2></div><Icon name="trendingUp" size={20}/></div><MiniWealthChart points={wealth.accountEvolution||[]}/><div className="wealth-breakdown"><span><small>Dinero líquido</small><strong>{moneyFor(wealth.liquidBalance||0,currencyCode)}</strong></span><span><small>Reservado</small><strong>{moneyFor(wealth.goalReserves||0,currencyCode)}</strong></span><span><small>Obligaciones</small><strong>-{moneyFor(wealth.liabilities||0,currencyCode)}</strong></span></div></section></div>
  <section className="section-card goals-workspace"><div className="page-intro compact-intro"><div><p className="eyebrow">Tus objetivos</p><h2>Planes activos</h2><p>Prioriza, ajusta y aporta sin perder la trazabilidad.</p></div><button className="primary-action" onClick={()=>openModal("goal")}><Icon name="plus" size={15}/> Nueva meta</button></div><div className="goals-grid smart-goals-grid">{goals.map((goal)=><article className={`goal-card smart-goal-card ${goal.color}`} key={goal.id}><div className="goal-card-top"><div className="goal-badge-stack"><span className={`priority-badge p${goal.priority||2}`}>{goal.priorityLabel||"Media"}</span><span className="goal-type-badge">{goal.goalTypeLabel||"Meta"}</span></div><div className="goal-card-actions"><button onClick={()=>openModal("goal-update",goal.id)}><Icon name="edit" size={15}/></button><button className="danger-icon" onClick={()=>openModal("goal-delete",goal.id)}><Icon name="trash" size={15}/></button></div></div><h3>{goal.name}</h3><p>{goal.note||`Fecha objetivo: ${longDate(goal.dueDate)}`}</p><div className="goal-big-number"><strong>{moneyFor(goal.currentAmount,goal.currencyCode)}</strong><span> / {moneyFor(goal.targetAmount,goal.currencyCode)}</span></div><Progress value={goal.progress??percentage(goal.currentAmount,goal.targetAmount)} color={goal.color}/><div className="goal-plan-grid"><span><small>{data.period?.mode==="biweekly"?"Por quincena":"Por mes"}</small><strong>{moneyFor(goal.requiredPerPeriod||0,goal.currencyCode)}</strong></span><span><small>Períodos restantes</small><strong>{goal.periodsRemaining??0}</strong></span></div><div className={`goal-projection ${goal.projectionStatus||"new"}`}><Icon name={goal.projectionStatus==="on-track"||goal.projectionStatus==="completed"?"checkCircle":"clock"} size={15}/><span>{goal.projectionStatus==="completed"?"Meta completada":goal.projectionStatus==="on-track"?"Vas al ritmo proyectado":goal.projectionStatus==="behind"?"Necesitas aumentar el ritmo":goal.projectionStatus==="overdue"?"La fecha objetivo ya pasó":"Comienza con tu primer aporte"}</span></div><div className="goal-card-footer"><span>{goal.sharedReady?<><Icon name="users" size={13}/> Preparada para compartir</>:`${goal.progress??0}% completado`}</span><button onClick={()=>openModal("goal-contribution",goal.id)}>Aportar <Icon name="chevronRight" size={13}/></button></div></article>)}<button className="new-goal-card" onClick={()=>openModal("goal")}><span><Icon name="plus" size={22}/></span><strong>{goals.length?"Crear otra meta":"Crear tu primera meta"}</strong><small>Clara calculará el esfuerzo necesario para llegar a tiempo.</small></button></div></section></div>;
}
function MiniWealthChart({points=[]}) { const values=points.map((p)=>Number(p.balance??p.netWorth??0)); const max=Math.max(...values,1),min=Math.min(...values,0),range=Math.max(max-min,1); return <div className="mini-wealth-chart">{points.length?points.map((point)=><span key={point.key||point.date} className="wealth-bar"><i style={{height:`${22+((Number(point.balance??point.netWorth??0)-min)/range)*68}%`}}/><small>{String(point.key||point.date||"").slice(5,7)}</small></span>):<div className="empty-inline"><Icon name="chart" size={18}/> El historial crecerá con el uso de Clara.</div>}</div>; }
function InsightsView({data,goTo}) { const {money,currencyCode}=useMoney(); const a=data.analytics||EMPTY_DATA.analytics,w=data.wealth||EMPTY_DATA.wealth,e=data.emergencyFund||EMPTY_DATA.emergencyFund; const delta=(v)=>`${v>0?"+":""}${v||0}%`; return <div className="analytics-page"><section className="analytics-hero"><div><p className="eyebrow light">Clara Insights</p><h2>Una lectura clara de cómo te estás moviendo.</h2><p>Comparaciones y proyecciones construidas solo con la información registrada en tu perfil.</p></div><div className="analytics-score-ring"><strong>{a.claraIndex||0}</strong><small>/100</small><span>{a.claraIndexLabel||"Construyendo índice"}</span></div></section><section className="analytics-kpis"><article><span><Icon name="trendingUp" size={18}/></span><small>Capacidad de ahorro</small><strong>{a.savingsCapacityRate||0}%</strong><p>{money(a.savingsCapacityAmount||0)} este mes</p></article><article><span><Icon name="creditCard" size={18}/></span><small>Deuda / ingreso</small><strong>{a.debtToIncomeRate||0}%</strong><p>Pagos mensuales frente al ingreso</p></article><article><span><Icon name="lock" size={18}/></span><small>Gastos fijos / ingreso</small><strong>{a.fixedToIncomeRate||0}%</strong><p>Parte del ingreso comprometida</p></article><article><span><Icon name="shield" size={18}/></span><small>Fondo de emergencia</small><strong>{e.coverageMonths||0} meses</strong><p>{e.percentage||0}% de tu referencia</p></article></section><div className="analytics-main-grid"><section className="section-card"><div className="section-heading"><div><p className="eyebrow">Comparación</p><h2>Este período vs. el anterior</h2></div></div><div className="comparison-grid"><div><small>Gastos del período</small><strong>{money(a.currentPeriod?.expenses||0)}</strong><span className={(a.periodExpenseDelta||0)>0?"delta bad":"delta good"}>{delta(a.periodExpenseDelta)}</span></div><div><small>Gastos del mes</small><strong>{money(a.currentMonth?.expenses||0)}</strong><span className={(a.monthExpenseDelta||0)>0?"delta bad":"delta good"}>{delta(a.monthExpenseDelta)}</span></div><div><small>Ingresos del mes</small><strong>{money(a.currentMonth?.income||0)}</strong><span className={(a.monthIncomeDelta||0)>=0?"delta good":"delta bad"}>{delta(a.monthIncomeDelta)}</span></div></div></section><section className="section-card projection-card"><div className="section-heading"><div><p className="eyebrow">Proyección</p><h2>Así podría cerrar tu mes</h2></div><Icon name="chart" size={20}/></div><strong className="projection-number">{money(a.projectedEndBalance||0)}</strong><p>Saldo estimado si mantienes el ritmo registrado y cumples los compromisos conocidos.</p><div className="projection-line"><span>Gasto mensual proyectado</span><strong>{money(a.projectedMonthExpenses||0)}</strong></div></section></div><div className="analytics-main-grid"><section className="section-card"><div className="section-heading"><div><p className="eyebrow">Tendencias</p><h2>Dónde cambió tu gasto</h2></div></div><div className="trend-list">{(a.categoryTrends||[]).length?a.categoryTrends.map((item)=><div key={item.categoryId}><span className={`category-icon-tile ${item.color}`}><CategoryIcon category={{id:item.categoryId}} size={16}/></span><span><strong>{item.name}</strong><small>Anterior {money(item.previous)}</small></span><b>{money(item.current)}</b><i className={item.delta>0?"trend-up":"trend-down"}>{delta(item.delta)}</i></div>):<div className="empty-inline"><Icon name="chart" size={18}/> Registra más gastos para comparar categorías.</div>}</div></section><section className="section-card"><div className="section-heading"><div><p className="eyebrow">Detección</p><h2>Gastos fuera de tu patrón</h2></div></div><div className="unusual-list">{(a.unusualExpenses||[]).length?a.unusualExpenses.map((item)=><div key={item.id}><span><Icon name="alertTriangle" size={17}/></span><div><strong>{item.description}</strong><small>{item.categoryName} · {prettyDate(item.date)} · {item.multiplier}x tu promedio</small></div><b>{money(item.amount)}</b></div>):<div className="empty-inline"><Icon name="checkCircle" size={18}/> No detectamos gastos anormales con los datos disponibles.</div>}</div></section></div><section className="section-card recommendations-card"><div className="section-heading"><div><p className="eyebrow">Recomendaciones</p><h2>Qué merece tu atención ahora</h2></div></div><div className="recommendation-grid">{(a.recommendations||[]).map((item,index)=><button key={`${item.type}-${index}`} onClick={()=>goTo(item.actionView||"inicio")}><span><Icon name={item.type==="positive"?"checkCircle":item.type==="debt"?"creditCard":item.type==="emergency"?"shield":"sparkles"} size={19}/></span><div><strong>{item.title}</strong><p>{item.message}</p></div><Icon name="chevronRight" size={16}/></button>)}</div></section><section className="section-card wealth-history-card"><div className="section-heading"><div><p className="eyebrow">Patrimonio</p><h2>Tu historia financiera</h2></div><strong>{money(w.netWorth||0)}</strong></div><MiniWealthChart points={(w.snapshots||[]).length>1?w.snapshots:w.accountEvolution||[]}/><div className="wealth-breakdown analytics"><span><small>Líquido</small><strong>{money(w.liquidBalance||0)}</strong></span><span><small>Metas</small><strong>{money(w.goalReserves||0)}</strong></span><span><small>Obligaciones</small><strong>-{money(w.liabilities||0)}</strong></span><span><small>Neto</small><strong>{money(w.netWorth||0)}</strong></span></div></section></div>; }

function AccountsView({ data, openModal, showBalance }) {
  const { money, moneyFor, currencySymbol, currencyCode } = useMoney();
  const totals = Object.entries(data.summary.currencyTotals || {});
  return <>
    <section className="account-overview-card premium-account-overview">
      <div>
        <p className="eyebrow light">{data.summary.hasMixedCurrencies ? `Patrimonio principal · ${currencyCode}` : "Patrimonio combinado"}</p>
        <strong>{showBalance ? money(data.summary.primaryBalance ?? data.summary.totalBalance) : `${currencySymbol} ••••••`}</strong>
        <p>{data.summary.hasMixedCurrencies ? "Clara no suma monedas diferentes sin una tasa de cambio. Cada moneda se mantiene separada." : "La suma de todas las cuentas activas de tu perfil."}</p>
        {data.summary.hasMixedCurrencies && <div className="account-currency-totals">
          {totals.map(([code, amount]) => <span key={code}><small>{code}</small><strong>{showBalance ? moneyFor(amount, code) : "••••"}</strong></span>)}
        </div>}
      </div>
      <div className="account-overview-actions"><button onClick={() => openModal("transfer")}><Icon name="transfer" size={15} /> Transferir</button><button onClick={() => openModal("account")}><Icon name="plus" size={15} /> Añadir cuenta</button></div>
    </section>
    <section className="page-card elevated-card">
      <div className="page-intro compact-intro"><div><p className="eyebrow">Saldos separados</p><h2>Mis cuentas</h2><p>Cada cuenta conserva su institución, moneda y trazabilidad de saldo.</p></div></div>
      <div className="cash-engine-note"><span><Icon name="wallet" size={17} /></span><div><strong>El efectivo también es una cuenta.</strong><p>Si retiras dinero del banco, usa Transferir hacia Efectivo. Tu patrimonio no cambia; solo cambia dónde está el dinero.</p></div></div>
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
          <p className="account-subtitle">{accountSubtitle(account)} · {account.currencyCode}</p>
          <strong>{showBalance ? moneyFor(account.balance, account.currencyCode) : "••••••"}</strong>
          <div className="account-card-foot account-card-foot-dual">
            <button onClick={() => openModal("account-history", account.id)}><Icon name="history" size={13} /> Historial</button>
            <button onClick={() => openModal("transfer")}>Mover dinero <Icon name="chevronRight" size={13} /></button>
          </div>
        </article>)}
        <button className="account-card account-add" onClick={() => openModal("account")}><span><Icon name="plus" size={24} /></span><strong>Añadir otra cuenta</strong><small>Bancos, cooperativas, nómina, inversiones, efectivo y múltiples monedas.</small></button>
      </div>
    </section>
  </>;
}

function BudgetRow({ category, onEdit, onDelete = null, compact = false }) {
  const { money } = useMoney();
  const limit = Number(category.periodLimit ?? category.monthlyLimit ?? 0);
  const spent = Number(category.spent || 0);
  const used = limit > 0 ? Number(category.percentage ?? percentage(spent, limit)) : 0;
  const remaining = Math.max(limit - spent, 0);
  const level = category.alertLevel || (used >= 100 ? "exceeded" : used >= 90 ? "warning" : used >= 70 ? "watch" : "ok");
  const kindLabel = category.budgetKindLabel || (category.budgetKind === "fixed" ? "Compromiso fijo" : category.budgetKind === "savings" ? "Reserva de ahorro" : "Gasto flexible");
  return <article className={`${compact ? "budget-item compact" : "budget-item"} ${category.parentId ? "subcategory-budget" : ""} budget-${level}`}>
    <div className="budget-item-top">
      <span className={`category-icon-tile ${category.color}`}><CategoryIcon category={category} size={compact ? 16 : 19} /></span>
      <span><strong>{category.parentId ? `${category.parentDisplayName || "Categoría"} › ${category.name}` : category.name}</strong><small>{limit > 0 ? `${money(remaining)} disponibles` : "Sin límite todavía"}</small></span>
      <div className="budget-row-actions">
        <button onClick={onEdit} aria-label={`Ajustar presupuesto de ${category.name}`} title="Ajustar"><Icon name="edit" size={14} /><span>{compact ? "" : "Ajustar"}</span></button>
        {onDelete && limit > 0 && <button className="danger-icon" onClick={onDelete} aria-label={`Eliminar presupuesto de ${category.name}`} title="Eliminar sobre"><Icon name="trash" size={14} /><span>{compact ? "" : "Eliminar"}</span></button>}
      </div>
    </div>
    <div className="budget-badges">
      {limit > 0 && <span className={`budget-kind ${category.budgetKind || "flexible"}`}>{kindLabel}</span>}
      {category.budgetIsLegacy && <span className="budget-legacy-badge">Plan anterior</span>}
      {used >= 70 && <span className={`budget-threshold ${level}`}>{used >= 100 ? "Límite superado" : `${used}% utilizado`}</span>}
    </div>
    <Progress value={used} color={category.color} />
    <div className="budget-item-meta"><span>{money(spent)} usado</span><span>{money(limit)} límite del período</span></div>
    {category.budgetNote && <p className="budget-item-note"><Icon name="info" size={12} /> {category.budgetNote}</p>}
  </article>;
}

function Progress({ value, color }) {
  return <span className="progress-track" aria-label={`${value}% completado`}><i className={color} style={{ width: `${Math.min(value, 100)}%` }} /></span>;
}

function sourceLabel(source) {
  return {
    MANUAL: "Manual",
    ASSISTANT: "Clara Assistant",
    EMAIL: "Clara Mail",
    IMPORT: "Importado",
    BANK_API: "Bank Connect",
    GOAL: "Reserva de meta",
  }[String(source || "MANUAL").toUpperCase()] || "Manual";
}

function TransactionList({ transactions, detailed = false }) {
  const { moneyFor } = useMoney();
  if (!transactions.length && !detailed) {
    return <div className="mini-empty"><span><Icon name="activity" size={20} /></span><p>Aún no hay movimientos. Registra tu primer ingreso para comenzar.</p></div>;
  }
  return <div className={detailed ? "transaction-list detailed" : "transaction-list"}>
    {transactions.map((transaction) => {
      const categoryLabel = transaction.type === "income"
        ? "Ingreso"
        : transaction.type === "transfer"
          ? "Transferencia"
          : transaction.parentCategoryName
            ? `${transaction.parentCategoryName} › ${transaction.categoryName}`
            : transaction.categoryName ?? "Sin categoría";
      const amountText = moneyFor(transaction.amount, transaction.currencyCode);
      const destinationText = transaction.type === "transfer" && transaction.destinationAmount && transaction.destinationCurrencyCode && transaction.destinationCurrencyCode !== transaction.currencyCode
        ? ` → ${moneyFor(transaction.destinationAmount, transaction.destinationCurrencyCode)}`
        : "";
      return <article className="transaction-row" key={transaction.id}>
        <div className="transaction-main">
          <span className={`transaction-symbol ${transaction.type === "income" ? "mint" : transaction.type === "transfer" ? "sky" : transaction.categoryColor ?? "coral"}`}>{transaction.type === "income" ? "IN" : transaction.type === "transfer" ? "TR" : transaction.categorySymbol ?? "GA"}</span>
          <span>
            <strong>{transaction.description}</strong>
            <small>{detailed ? <>{transaction.note || "Sin nota"} <i className="source-chip">{sourceLabel(transaction.source)}</i></> : `${transaction.accountName} · ${prettyDate(transaction.transactionDate)}`}</small>
          </span>
        </div>
        {detailed && <span className="transaction-category">{categoryLabel}</span>}
        {detailed && <span className="transaction-account">{transaction.accountName}{transaction.destinationAccountName ? ` → ${transaction.destinationAccountName}` : ""}</span>}
        {detailed && <span className="transaction-date">{prettyDate(transaction.transactionDate)}</span>}
        <strong className={`transaction-amount ${transaction.type}`}>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "−" : ""}{amountText}{destinationText}</strong>
      </article>;
    })}
  </div>;
}


function AccountFields({ account = null, userCurrencyCode = "DOP" }) {
  const inferredType = account?.institutionType || (account?.kind === "cash" ? "cash" : "bank");
  const inferredProduct = account?.productType || (account?.kind === "cash" ? "cash" : account?.kind === "savings" ? "savings" : "checking");
  const [institutionType, setInstitutionType] = useState(inferredType);
  const [institutionName, setInstitutionName] = useState(account?.institutionName || "");
  const [productType, setProductType] = useState(inferredProduct);
  const [nickname, setNickname] = useState(account?.nickname || "");
  const [accountCurrency, setAccountCurrency] = useState(account?.currencyCode || userCurrencyCode || "DOP");
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
      <div><strong>{displayName}</strong><small>Clara combina el producto, la institución y la moneda para que cada cuenta sea fácil de identificar.</small></div>
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
      <small className="field-help">Puedes escoger una sugerencia o escribir cualquier banco, cooperativa o institución que no aparezca.</small>
    </label>}
    <div className="form-grid">
      <label><span>Alias <small>opcional</small></span><input name="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Ej. Nómina, Personal, Viajes" /></label>
      <label><span>Moneda de esta cuenta</span><select name="currencyCode" value={accountCurrency} onChange={(event) => setAccountCurrency(event.target.value)}>
        {currencyOptions.map((currency) => <option key={currency.code} value={currency.code}>{currency.label} ({currency.code})</option>)}
      </select></label>
    </div>
    <label><span>{account ? "Saldo actual" : "Saldo que tienes ahora"}</span><div className="money-field"><span>{currencyInfo(accountCurrency).symbol}</span><input type="number" name="amount" min="0" step="0.01" defaultValue={account ? (Number(account.balance || 0) / 100).toFixed(2) : "0.00"} required /></div></label>
    {account ? <>
      <label><span>Motivo del ajuste <small>opcional</small></span><input name="balanceReason" placeholder="Ej. Actualicé el saldo con mi app bancaria" /></label>
      <p className="form-note"><Icon name="shield" size={14} /> Puedes corregir el saldo sin crear un ingreso ficticio. Si la cuenta ya tiene movimientos, Clara protege su moneda para no dañar el historial.</p>
    </> : <p className="form-note"><Icon name="info" size={14} /> Este es tu saldo de partida. No se contará como ingreso y quedará registrado como saldo inicial.</p>}
  </>;
}

function CategoryFields({ data, category = null, suggestedParentId = null }) {
  const [parentId, setParentId] = useState(category?.parentId || suggestedParentId || "");
  const roots = data.categories.filter((item) => !item.parentId && item.id !== category?.id);
  return <>
    <label><span>Nombre</span><input name="displayName" required autoFocus maxLength="150" defaultValue={category?.name || ""} placeholder="Ej. Mascotas, Iglesia, Negocio" /></label>
    <label><span>¿Es una subcategoría?</span><select name="parentId" value={parentId} onChange={(event) => setParentId(event.target.value)}>
      <option value="">No, será categoría principal</option>
      {roots.map((item) => <option key={item.id} value={item.id}>Dentro de {item.name}</option>)}
    </select></label>
    <label><span>Color</span><select name="color" defaultValue={category?.color || "mint"}>
      <option value="forest">Verde oscuro</option>
      <option value="mint">Menta</option>
      <option value="sky">Azul</option>
      <option value="coral">Coral</option>
      <option value="sun">Amarillo</option>
      <option value="lilac">Lila</option>
    </select></label>
    <p className="form-note"><Icon name="tags" size={14} /> Las categorías que creas son privadas de tu perfil. Clara conserva las categorías base para mantener una estructura clara.</p>
  </>;
}

function TransferFields({ data }) {
  const { moneyFor } = useMoney();
  const [sourceId, setSourceId] = useState(String(data.accounts[0]?.id || ""));
  const [destinationId, setDestinationId] = useState(String(data.accounts[1]?.id || ""));
  const source = data.accounts.find((item) => String(item.id) === sourceId);
  const destination = data.accounts.find((item) => String(item.id) === destinationId);
  const crossCurrency = source && destination && source.currencyCode !== destination.currencyCode;

  return <>
    <label><span>Desde</span><select name="accountId" required value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
      {data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name} — {moneyFor(item.balance, item.currencyCode)}</option>)}
    </select></label>
    <label><span>Hacia</span><select name="destinationAccountId" required value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
      {data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.currencyCode}</option>)}
    </select></label>
    <label><span>Monto que sale</span><div className="money-field"><span>{currencyInfo(source?.currencyCode || "DOP").symbol}</span><input type="number" name="amount" min="0.01" step="0.01" placeholder="0.00" required /></div></label>
    {crossCurrency && <label><span>Monto que llegará en {destination.currencyCode}</span><div className="money-field"><span>{currencyInfo(destination.currencyCode).symbol}</span><input type="number" name="destinationAmount" min="0.01" step="0.01" placeholder="0.00" required /></div><small className="field-help">Clara no inventa tasas de cambio: escribe el monto real que recibirá la cuenta de destino.</small></label>}
    <div className="form-grid"><label><span>Fecha</span><input type="date" name="transactionDate" defaultValue={todayIso()} required /></label><label><span>Nota <small>opcional</small></span><input name="note" placeholder="Motivo" /></label></div>
    <p className="form-note"><Icon name="info" size={14} /> Transferir entre tus cuentas no crea un gasto. Si el destino es Efectivo, Clara lo interpreta como un retiro.</p>
  </>;
}

function AccountHistory({ data, account }) {
  const { moneyFor } = useMoney();
  const rows = data.balanceHistory.filter((item) => item.accountId === account.id).slice(0, 60);
  return <div className="account-history">
    <div className="history-balance-card">
      <span><small>Saldo actual</small><strong>{moneyFor(account.balance, account.currencyCode)}</strong></span>
      <span><small>Moneda</small><strong>{account.currencyCode}</strong></span>
      <span><small>Registros</small><strong>{rows.length}</strong></span>
    </div>
    <div className="history-list">
      {rows.map((item) => <article key={item.id}>
        <span className={`history-icon ${item.type}`}><Icon name={item.type === "adjustment" ? "edit" : item.type.includes("transfer") ? "transfer" : item.type === "income" ? "plus" : "minus"} size={14} /></span>
        <div><strong>{item.description}</strong><small>{prettyDate(item.date)} · {sourceLabel(item.source)}</small></div>
        <div className="history-numbers">
          <strong className={item.amount >= 0 ? "positive" : "negative"}>{item.amount >= 0 ? "+" : "−"}{moneyFor(Math.abs(item.amount), item.currencyCode)}</strong>
          <small>{item.balanceAfter === null ? "Saldo histórico no disponible" : `Quedó en ${moneyFor(item.balanceAfter, item.currencyCode)}`}</small>
        </div>
      </article>)}
      {!rows.length && <div className="mini-empty"><span><Icon name="history" size={20} /></span><p>Aún no hay cambios registrados en esta cuenta.</p></div>}
    </div>
  </div>;
}

function TransactionFields({ kind, data }) {
  const { moneyFor } = useMoney();
  const [accountId, setAccountId] = useState(String(data.accounts[0]?.id || ""));
  const account = data.accounts.find((item) => String(item.id) === accountId);
  const roots = data.categories.filter((category) => !category.parentId);
  return <>
    <label><span>Concepto</span><input name="description" required autoFocus placeholder={kind === "expense" ? "Ej. Supermercado" : "Ej. Pago de nómina"} /></label>
    <label><span>Monto</span><div className="money-field"><span>{currencyInfo(account?.currencyCode || "DOP").symbol}</span><input type="number" name="amount" min="0.01" step="0.01" placeholder="0.00" required /></div></label>
    <label><span>Cuenta</span><select name="accountId" required value={accountId} onChange={(event) => setAccountId(event.target.value)}>
      {data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name} — {moneyFor(item.balance, item.currencyCode)}</option>)}
    </select></label>
    {kind === "expense" && <label><span>Categoría</span><select name="categoryId" required defaultValue={data.categories[0]?.id || ""}>
      {roots.map((root) => <optgroup key={root.id} label={root.name}>
        <option value={root.id}>{root.name}</option>
        {data.categories.filter((child) => child.parentId === root.id).map((child) => <option key={child.id} value={child.id}>↳ {child.name}</option>)}
      </optgroup>)}
    </select></label>}
    <div className="form-grid"><label><span>Fecha</span><input type="date" name="transactionDate" defaultValue={todayIso()} required /></label><label><span>Nota <small>opcional</small></span><input name="note" placeholder="Añade un detalle" /></label></div>
    <input type="hidden" name="source" value="MANUAL" />
    <p className="form-note"><Icon name="shield" size={14} /> Este movimiento quedará marcado como Manual. Clara 3.0 ya está preparada para Assistant, Email, Importación y Bank Connect sin mezclar los orígenes.</p>
  </>;
}


function RecurringFields({ data, item = null }) {
  const { moneyFor } = useMoney();
  const [accountId, setAccountId] = useState(String(item?.accountId || data.accounts[0]?.id || ""));
  const account = data.accounts.find((accountItem) => String(accountItem.id) === accountId);
  const roots = data.categories.filter((category) => !category.parentId);
  return <>
    <label><span>Nombre del compromiso</span><input name="name" required autoFocus maxLength="180" defaultValue={item?.name || ""} placeholder="Ej. Internet, alquiler, universidad" /></label>
    <div className="form-grid">
      <label><span>Monto</span><div className="money-field"><span>{currencyInfo(account?.currencyCode || "DOP").symbol}</span><input type="number" name="amount" min="0.01" step="0.01" required defaultValue={item ? (item.amount / 100).toFixed(2) : ""} placeholder="0.00" /></div></label>
      <label><span>Frecuencia</span><select name="frequency" defaultValue={item?.frequency || "monthly"}><option value="weekly">Semanal</option><option value="biweekly">Cada 2 semanas</option><option value="monthly">Mensual</option><option value="yearly">Anual</option></select></label>
    </div>
    <label><span>Cuenta desde la que normalmente se paga</span><select name="accountId" required value={accountId} onChange={(event) => setAccountId(event.target.value)}>
      {data.accounts.map((accountItem) => <option key={accountItem.id} value={accountItem.id}>{accountItem.name} — {moneyFor(accountItem.balance, accountItem.currencyCode)}</option>)}
    </select></label>
    <label><span>Categoría</span><select name="categoryId" required defaultValue={item?.categoryId || data.categories[0]?.id || ""}>
      {roots.map((root) => <optgroup key={root.id} label={root.name}><option value={root.id}>{root.name}</option>{data.categories.filter((child) => child.parentId === root.id).map((child) => <option key={child.id} value={child.id}>↳ {child.name}</option>)}</optgroup>)}
    </select></label>
    <label><span>Próxima fecha</span><input type="date" name="nextDueDate" required defaultValue={item?.nextDueDate || todayIso()} /></label>
    <label><span>Nota <small>opcional</small></span><input name="note" maxLength="500" defaultValue={item?.note || ""} placeholder="Ej. Se paga desde la app del proveedor" /></label>
    <div className="recurring-options">
      <label className="check-option"><input type="checkbox" name="isMandatory" defaultChecked={item ? item.isMandatory : true} /><span><strong>Es un compromiso obligatorio</strong><small>Clara lo tendrá más presente al calcular cuánto dinero puedes gastar con tranquilidad.</small></span></label>
      <label className="check-option"><input type="checkbox" name="autoCreateTransaction" defaultChecked={item?.autoCreateTransaction || false} /><span><strong>Registrar gasto al marcarlo como pagado</strong><small>Cuando confirmes el pago, Clara descontará el monto de esta cuenta y creará el movimiento automáticamente.</small></span></label>
    </div>
  </>;
}

function CreditCardFields({ card = null, userCurrencyCode = "DOP" }) {
  return <>
    <label><span>Nombre para identificarla</span><input name="name" required autoFocus defaultValue={card?.name || ""} placeholder="Ej. Visa Platinum" /></label>
    <label><span>Banco o institución</span><input name="institutionName" required defaultValue={card?.institutionName || ""} placeholder="Ej. Banreservas" /></label>
    <label><span>Moneda</span><select name="currencyCode" defaultValue={card?.currencyCode || userCurrencyCode}>{currencyOptions.map((currency) => <option key={currency.code} value={currency.code}>{currency.label} ({currency.code})</option>)}</select></label>
    <div className="form-grid"><label><span>Límite de crédito</span><input type="number" name="creditLimit" min="0" step="0.01" required defaultValue={card ? (card.creditLimit / 100).toFixed(2) : ""} placeholder="0.00" /></label><label><span>Saldo utilizado hoy</span><input type="number" name="currentBalance" min="0" step="0.01" required defaultValue={card ? (card.currentBalance / 100).toFixed(2) : "0.00"} /></label></div>
    <div className="form-grid"><label><span>Día de corte</span><input type="number" name="statementDay" min="1" max="31" required defaultValue={card?.statementDay || 1} /></label><label><span>Día límite de pago</span><input type="number" name="dueDay" min="1" max="31" required defaultValue={card?.dueDay || 20} /></label></div>
    <div className="form-grid"><label><span>Pago mínimo actual</span><input type="number" name="minimumPayment" min="0" step="0.01" required defaultValue={card ? (card.minimumPayment / 100).toFixed(2) : "0.00"} /></label><label><span>Interés anual %</span><input type="number" name="annualInterestRate" min="0" max="999.999" step="0.001" required defaultValue={card?.annualInterestRate || 0} /></label></div>
    <label><span>Nota <small>opcional</small></span><textarea name="note" rows="3" maxLength="500" defaultValue={card?.note || ""} placeholder="Ej. La uso para compras del hogar" /></label>
    <p className="form-note"><Icon name="info" size={14} /> El saldo utilizado puede colocarse directamente al registrar la tarjeta. No se crea un ingreso ni un gasto por ese saldo inicial.</p>
  </>;
}

function DebtFields({ debt = null, userCurrencyCode = "DOP" }) {
  return <>
    <label><span>Nombre de la deuda</span><input name="name" required autoFocus defaultValue={debt?.name || ""} placeholder="Ej. Préstamo del vehículo" /></label>
    <div className="form-grid"><label><span>Entidad o persona</span><input name="lender" defaultValue={debt?.lender || ""} placeholder="Ej. Cooperativa La Altagracia" /></label><label><span>Tipo</span><select name="debtType" defaultValue={debt?.debtType || "personal"}><option value="personal">Préstamo personal</option><option value="vehicle">Vehículo</option><option value="mortgage">Hipoteca</option><option value="education">Educación</option><option value="cooperative">Cooperativa</option><option value="family">Familiar</option><option value="business">Negocio</option><option value="other">Otra</option></select></label></div>
    <label><span>Moneda</span><select name="currencyCode" defaultValue={debt?.currencyCode || userCurrencyCode}>{currencyOptions.map((currency) => <option key={currency.code} value={currency.code}>{currency.label} ({currency.code})</option>)}</select></label>
    <div className="form-grid"><label><span>Monto original</span><input type="number" name="originalAmount" min="0.01" step="0.01" required defaultValue={debt ? (debt.originalAmount / 100).toFixed(2) : ""} placeholder="0.00" /></label><label><span>Saldo pendiente actual</span><input type="number" name="currentBalance" min="0" step="0.01" required defaultValue={debt ? (debt.currentBalance / 100).toFixed(2) : ""} placeholder="0.00" /></label></div>
    <div className="form-grid"><label><span>Cuota habitual</span><input type="number" name="regularPayment" min="0" step="0.01" required defaultValue={debt ? (debt.regularPayment / 100).toFixed(2) : "0.00"} /></label><label><span>Frecuencia</span><select name="paymentFrequency" defaultValue={debt?.paymentFrequency || "monthly"}><option value="weekly">Semanal</option><option value="biweekly">Cada 2 semanas</option><option value="monthly">Mensual</option><option value="yearly">Anual</option></select></label></div>
    <div className="form-grid"><label><span>Interés anual %</span><input type="number" name="annualInterestRate" min="0" max="999.999" step="0.001" required defaultValue={debt?.annualInterestRate || 0} /></label><label><span>Próximo pago</span><input type="date" name="nextDueDate" defaultValue={debt?.nextDueDate || ""} /></label></div>
    <label><span>Fecha estimada de finalización <small>opcional</small></span><input type="date" name="endDate" defaultValue={debt?.endDate || ""} /></label>
    <label><span>Nota <small>opcional</small></span><textarea name="note" rows="3" maxLength="500" defaultValue={debt?.note || ""} /></label>
  </>;
}

function CardConsumptionFields({ card, data }) {
  const { moneyFor } = useMoney();
  const categories = data.categories;
  return <>
    <div className="modal-context"><span className="goal-round-icon"><Icon name="creditCard" size={18} /></span><span><small>Crédito disponible</small><strong>{moneyFor(card?.availableCredit || 0, card?.currencyCode || "DOP")}</strong></span></div>
    <label><span>Concepto</span><input name="description" required autoFocus maxLength="255" placeholder="Ej. Supermercado, gasolina, compra online" /></label>
    <label><span>Monto total cargado</span><input type="number" name="amount" min="0.01" max={((card?.availableCredit || 0) / 100).toFixed(2)} step="0.01" required placeholder="0.00" /></label>
    <label><span>Categoría</span><select name="categoryId" required defaultValue={categories[0]?.id || ""}>{categories.map((category) => <option key={category.id} value={category.id}>{category.parentId ? `${category.parentDisplayName || "Categoría"} › ${category.name}` : category.name}</option>)}</select></label>
    <div className="form-grid"><label><span>Fecha de compra</span><input type="date" name="purchaseDate" required defaultValue={todayIso()} /></label><label><span>Número de cuotas</span><input type="number" name="installments" min="1" max="120" required defaultValue="1" /></label></div>
    <label><span>Nota <small>opcional</small></span><input name="note" maxLength="500" /></label>
    <p className="form-note"><Icon name="info" size={14} /> Clara suma este consumo al saldo de la tarjeta y lo incluye como gasto del período. Las cuotas quedan registradas como referencia; la distribución automática por estado de cuenta podrá evolucionar en versiones posteriores.</p>
  </>;
}

function LiabilityPaymentFields({ item, type, data }) {
  const { moneyFor } = useMoney();
  const currencyCode = item?.currencyCode || "DOP";
  const balance = Number(item?.currentBalance || 0);
  const suggested = type === "card" ? Math.min(Number(item?.minimumPayment || 0), balance) : Math.min(Number(item?.regularPayment || 0), balance);
  const accounts = data.accounts.filter((account) => account.currencyCode === currencyCode);
  return <>
    <div className="modal-context"><span className="goal-round-icon"><Icon name={type === "card" ? "creditCard" : "trendingDown"} size={18} /></span><span><small>Saldo pendiente</small><strong>{moneyFor(balance, currencyCode)}</strong></span></div>
    <label><span>Monto del pago</span><input type="number" name="amount" min="0.01" max={(balance / 100).toFixed(2)} step="0.01" required autoFocus defaultValue={suggested > 0 ? (suggested / 100).toFixed(2) : ""} /></label>
    <label><span>Pagar desde</span><select name="accountId" required defaultValue={accounts[0]?.id || ""}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {moneyFor(account.balance, account.currencyCode)}</option>)}</select></label>
    <label><span>Fecha del pago</span><input type="date" name="paymentDate" required defaultValue={todayIso()} /></label>
    <label><span>Nota <small>opcional</small></span><input name="note" maxLength="500" placeholder="Ej. Pago realizado desde la app bancaria" /></label>
    {!accounts.length && <p className="form-error">No tienes una cuenta activa en {currencyCode}. Agrega una cuenta con esa moneda antes de registrar el pago.</p>}
    <p className="form-note"><Icon name="info" size={14} /> Clara descontará el dinero de la cuenta seleccionada y reducirá la obligación. Este pago no se vuelve a contar automáticamente como un gasto para evitar duplicar consumos ya registrados.</p>
  </>;
}

function GoalFields({goal,userCurrencyCode}) { const code=goal?.currencyCode||userCurrencyCode||"DOP"; return <><label><span>Nombre de la meta</span><input name="name" required autoFocus defaultValue={goal?.name||""} placeholder="Ej. Fondo de emergencia"/></label><div className="form-grid two"><label><span>Tipo</span><select name="goalType" defaultValue={goal?.goalType||"general"}><option value="general">Meta general</option><option value="emergency">Fondo de emergencia</option><option value="purchase">Compra importante</option><option value="travel">Viaje</option><option value="education">Educación</option><option value="debt">Salir de deuda</option><option value="investment">Inversión</option><option value="other">Otra</option></select></label><label><span>Prioridad</span><select name="priority" defaultValue={String(goal?.priority||2)}><option value="1">Alta</option><option value="2">Media</option><option value="3">Baja</option></select></label></div><div className="form-grid two"><label><span>Moneda</span><select name="currencyCode" defaultValue={code}>{currencyOptions.map((c)=><option key={c.code} value={c.code}>{c.label} ({c.symbol})</option>)}</select></label><label><span>Monto objetivo</span><input type="number" name="targetAmount" min={goal?Math.max((goal.currentAmount||0)/100,.01):.01} step="0.01" defaultValue={goal?(goal.targetAmount/100).toFixed(2):""} required/></label></div><label><span>Fecha objetivo</span><input type="date" name="dueDate" min={goal?.dueDate||todayIso()} defaultValue={goal?.dueDate||""} required/></label><label><span>Nota <small>opcional</small></span><textarea name="note" rows="3" maxLength="500" defaultValue={goal?.note||""}/></label><input type="hidden" name="sharedReady" value="false"/><label className="check-option standalone"><input type="checkbox" name="sharedReady" value="true" defaultChecked={Boolean(goal?.sharedReady)}/><span><strong>Prepararla para una meta compartida</strong><small>No la comparte todavía. La deja lista para el futuro modo pareja/familia.</small></span></label></>; }

function OperationModal({ modal, data, saving, error, user, onClose, onSubmit }) {
  const { money, moneyFor, currencySymbol } = useMoney();
  const category = data.categories.find((item) => item.id === modal.referenceId);
  const goal = data.goals.find((item) => item.id === modal.referenceId);
  const account = data.accounts.find((item) => item.id === modal.referenceId);
  const recurring = data.recurringPayments?.find((item) => item.id === modal.referenceId);
  const creditCard = data.creditCards?.find((item) => item.id === modal.referenceId);
  const debt = data.debts?.find((item) => item.id === modal.referenceId);
  const suggestedParent = modal.kind === "category" && modal.referenceId ? data.categories.find((item) => item.id === modal.referenceId) : null;
  const titles = {
    expense: { eyebrow: "Nuevo movimiento", title: "Registrar gasto", submit: "Guardar gasto" },
    income: { eyebrow: "Nuevo movimiento", title: "Registrar ingreso", submit: "Guardar ingreso" },
    transfer: { eyebrow: "Entre tus cuentas", title: "Hacer transferencia", submit: "Transferir dinero" },
    budget: { eyebrow: "Sobre del período", title: `Ajustar ${category?.name ?? "categoría"}`, submit: "Guardar sobre" },
    "budget-delete": { eyebrow: "Quitar sobre", title: category?.name ?? "Eliminar sobre", submit: "Eliminar sobre", danger: true },
    "budget-copy": { eyebrow: "Plan rápido", title: "Usar el plan anterior", submit: "Copiar plan" },
    recurring: { eyebrow: "Nuevo compromiso", title: "Programar pago recurrente", submit: "Guardar compromiso" },
    "recurring-update": { eyebrow: "Editar compromiso", title: recurring?.name ?? "Editar pago recurrente", submit: "Guardar cambios" },
    "recurring-paid": { eyebrow: "Confirmar pago", title: recurring?.name ?? "Marcar como pagado", submit: "Confirmar pago" },
    "recurring-delete": { eyebrow: "Eliminar compromiso", title: recurring?.name ?? "Eliminar pago recurrente", submit: "Eliminar compromiso", danger: true },
    goal: { eyebrow: "Ahorro con destino", title: "Crear nueva meta", submit: "Crear meta" },
    "goal-update": { eyebrow: "Editar meta", title: goal?.name ?? "Editar meta", submit: "Guardar cambios" },
    "goal-delete": { eyebrow: "Archivar meta", title: goal?.name ?? "Archivar meta", submit: "Archivar meta", danger: true },
    "goal-contribution": { eyebrow: "Avanza un poco más", title: `Aportar a ${goal?.name ?? "la meta"}`, submit: "Guardar aporte" },
    account: { eyebrow: "Nueva cuenta", title: "Añadir cuenta", submit: "Crear cuenta" },
    "account-update": { eyebrow: "Editar cuenta", title: account?.name ?? "Editar cuenta", submit: "Guardar cambios" },
    "account-delete": { eyebrow: "Eliminar cuenta", title: account?.name ?? "Eliminar cuenta", submit: "Eliminar cuenta", danger: true },
    "account-history": { eyebrow: "Trazabilidad del saldo", title: account?.name ?? "Historial de cuenta", submit: "Cerrar" },
    category: { eyebrow: suggestedParent ? "Nueva subcategoría" : "Nueva categoría", title: suggestedParent ? `Dentro de ${suggestedParent.name}` : "Crear categoría", submit: "Crear categoría" },
    "category-update": { eyebrow: "Editar categoría", title: category?.name ?? "Editar categoría", submit: "Guardar categoría" },
    "category-delete": { eyebrow: category?.isSystem ? "Ocultar categoría" : "Eliminar categoría", title: category?.name ?? "Eliminar categoría", submit: category?.isSystem ? "Ocultar de mi perfil" : "Eliminar categoría", danger: true },
    "category-restore": { eyebrow: "Categorías base", title: "Restaurar categorías ocultas", submit: "Restaurar categorías" },
    "credit-card": { eyebrow: "Nueva tarjeta", title: "Registrar tarjeta de crédito", submit: "Guardar tarjeta" },
    "credit-card-update": { eyebrow: "Editar tarjeta", title: creditCard?.name ?? "Editar tarjeta", submit: "Guardar cambios" },
    "credit-card-consumption": { eyebrow: "Nuevo consumo", title: creditCard?.name ?? "Registrar consumo", submit: "Registrar consumo" },
    "credit-card-delete": { eyebrow: "Eliminar tarjeta", title: creditCard?.name ?? "Eliminar tarjeta", submit: "Eliminar tarjeta", danger: true },
    "credit-card-payment": { eyebrow: "Pago de tarjeta", title: creditCard?.name ?? "Registrar pago", submit: "Registrar pago" },
    debt: { eyebrow: "Nueva deuda", title: "Registrar préstamo o financiamiento", submit: "Guardar deuda" },
    "debt-update": { eyebrow: "Editar deuda", title: debt?.name ?? "Editar deuda", submit: "Guardar cambios" },
    "debt-delete": { eyebrow: "Eliminar deuda", title: debt?.name ?? "Eliminar deuda", submit: "Eliminar deuda", danger: true },
    "debt-payment": { eyebrow: "Pago de deuda", title: debt?.name ?? "Registrar pago", submit: "Registrar pago" },
    "plan-purpose": { eyebrow: "Tu enfoque", title: "Propósito del período", submit: "Guardar propósito" },
  };
  const copy = titles[modal.kind] || titles.expense;
  const isHistory = modal.kind === "account-history";

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className={`modal-card premium-modal ${isHistory ? "history-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="modal-close" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={17} /></button>
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2 id="modal-title">{copy.title}</h2>

      {isHistory && account ? <>
        <AccountHistory data={data} account={account} />
        <div className="modal-actions"><button type="button" className="primary-action" onClick={onClose}>Cerrar historial</button></div>
      </> : <form onSubmit={onSubmit}>
        {(modal.kind === "expense" || modal.kind === "income") && <TransactionFields kind={modal.kind} data={data} />}

        {modal.kind === "transfer" && <TransferFields data={data} />}

        {modal.kind === "budget" && <>
          <div className="modal-context"><span className={`category-icon-tile ${category?.color ?? "mint"}`}><CategoryIcon category={category} size={19} /></span><span><small>{data.period?.label || "Período actual"}</small><strong>{money(category?.periodLimit ?? 0)}</strong></span></div>
          <label><span>Límite para este período</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="periodLimit" min="0" step="0.01" defaultValue={((category?.periodLimit ?? 0) / 100).toFixed(2)} required autoFocus /></div></label>
          <label><span>¿Qué tipo de sobre es?</span><select name="budgetKind" defaultValue={category?.budgetKind || "flexible"}>
            <option value="fixed">Compromiso fijo</option>
            <option value="flexible">Gasto flexible</option>
            <option value="savings">Reserva de ahorro</option>
          </select></label>
          <label><span>Nota <small>opcional</small></span><input name="budgetNote" maxLength="240" defaultValue={category?.budgetNote || ""} placeholder="Ej. Internet, renta o compras del supermercado" /></label>
          <div className="budget-kind-explainer">
            <span><Icon name="calendar" size={14} /><strong>Fijo</strong><small>Clara protege lo que todavía falta de este compromiso.</small></span>
            <span><Icon name="wallet" size={14} /><strong>Flexible</strong><small>Sirve para controlar gastos sin tratarlos como obligación.</small></span>
            <span><Icon name="target" size={14} /><strong>Ahorro</strong><small>Separa dinero que prefieres no gastar en este período.</small></span>
          </div>
          <p className="form-note"><Icon name="info" size={14} /> Este límite pertenece únicamente a {data.period?.label || "tu período actual"}. El próximo mes o quincena tendrá su propio plan.</p>
        </>}

        {modal.kind === "budget-copy" && <div className="copy-budget-confirmation">
          <span><Icon name="refresh" size={21} /></span>
          <div><strong>¿Copiar el plan anterior?</strong><p>Clara traerá los sobres del período anterior a <b>{data.period?.label || "este período"}</b>. Si ya configuraste alguno aquí, se actualizará con el valor anterior.</p></div>
        </div>}

        {modal.kind === "recurring" && <RecurringFields data={data} />}
        {modal.kind === "recurring-update" && recurring && <RecurringFields data={data} item={recurring} />}

        {modal.kind === "recurring-paid" && recurring && <>
          <div className="modal-context recurring-context"><span className={`category-icon-tile ${recurring.categoryColor || "mint"}`}><CategoryIcon category={{ id: recurring.categoryId, parentId: recurring.parentCategoryId }} size={19} /></span><span><small>Vencimiento actual</small><strong>{moneyFor(recurring.amount, recurring.currencyCode)}</strong></span></div>
          <p className="recurring-payment-copy">Programado para <b>{longDate(recurring.nextDueDate)}</b> desde <b>{recurring.accountName}</b>.</p>
          <label><span>Fecha en que se pagó</span><input type="date" name="paidDate" required defaultValue={todayIso()} /></label>
          <input type="hidden" name="registerExpense" value="false" />
          <label className="check-option standalone"><input type="checkbox" name="registerExpense" value="true" defaultChecked={recurring.autoCreateTransaction} /><span><strong>Registrar también el gasto</strong><small>Si lo activas, Clara descontará {moneyFor(recurring.amount, recurring.currencyCode)} de {recurring.accountName} y creará el movimiento.</small></span></label>
        </>}

        {modal.kind === "recurring-delete" && recurring && <div className="danger-confirmation">
          <span><Icon name="trash" size={20} /></span>
          <div><strong>¿Eliminar {recurring.name}?</strong><p>Dejará de aparecer en el calendario y en tus próximos compromisos. Los gastos que ya hayas registrado se conservarán.</p></div>
        </div>}

        {(modal.kind === "goal" || modal.kind === "goal-update") && <GoalFields goal={modal.kind === "goal-update" ? goal : null} userCurrencyCode={user?.currencyCode} />}
        {modal.kind === "goal-delete" && goal && <div className="danger-confirmation"><span><Icon name="trash" size={20}/></span><div><strong>¿Archivar {goal.name}?</strong><p>Clara conservará sus aportes y el historial. La meta dejará de aparecer entre tus planes activos.</p></div></div>}
        {modal.kind === "goal-contribution" && <><div className="modal-context goal-context"><span className="goal-round-icon"><Icon name="target" size={18}/></span><span><small>Faltan</small><strong>{moneyFor(Math.max((goal?.targetAmount??0)-(goal?.currentAmount??0),0),goal?.currencyCode)}</strong></span></div><label><span>Monto del aporte</span><input type="number" name="amount" min="0.01" step="0.01" required autoFocus placeholder="0.00"/></label><label><span>Tomar dinero de</span><select name="accountId" required defaultValue={data.accounts.find((item)=>item.currencyCode===goal?.currencyCode)?.id||""}>{data.accounts.filter((item)=>item.currencyCode===goal?.currencyCode).map((item)=><option key={item.id} value={item.id}>{item.name} — {moneyFor(item.balance,item.currencyCode)}</option>)}</select></label><label><span>Fecha del aporte</span><input type="date" name="contributionDate" defaultValue={todayIso()} required/></label><label><span>Nota <small>opcional</small></span><input name="note" maxLength="500" placeholder="Ej. Aporte de esta quincena"/></label><p className="form-note"><Icon name="info" size={14}/> Esta meta usa {goal?.currencyCode||user?.currencyCode}. El aporte se reserva sin contarlo como gasto de consumo.</p></>}

        {modal.kind === "account" && <AccountFields userCurrencyCode={user?.currencyCode} />}

        {modal.kind === "account-update" && account && <AccountFields account={account} userCurrencyCode={user?.currencyCode} />}

        {modal.kind === "account-delete" && account && <div className="danger-confirmation">
          <span><Icon name="trash" size={20} /></span>
          <div><strong>¿Eliminar esta cuenta?</strong><p>Debe estar en saldo 0. Si tiene movimientos, Clara la archivará y conservará toda la trazabilidad financiera.</p></div>
        </div>}

        {modal.kind === "category" && <CategoryFields data={data} suggestedParentId={modal.referenceId} />}
        {modal.kind === "category-update" && category && <CategoryFields data={data} category={category} />}
        {modal.kind === "category-delete" && category && <div className="danger-confirmation">
          <span><Icon name="trash" size={20} /></span>
          <div><strong>{category.isSystem ? `¿Ocultar ${category.name} de tu perfil?` : `¿Eliminar ${category.name}?`}</strong><p>{category.isSystem ? "No se elimina la categoría global de Clara. Solo dejará de aparecer para este usuario y podrás restaurarla después." : "Si ya tiene movimientos, Clara la ocultará para nuevos registros pero conservará el historial anterior."}</p></div>
        </div>}

        {modal.kind === "category-restore" && <div className="copy-budget-confirmation"><span><Icon name="refresh" size={21} /></span><div><strong>Restaurar categorías base</strong><p>Volverán a mostrarse todas las categorías base de Clara que hayas ocultado. Tus categorías personalizadas no cambian.</p></div></div>}

        {modal.kind === "credit-card" && <CreditCardFields userCurrencyCode={user?.currencyCode} />}
        {modal.kind === "credit-card-update" && creditCard && <CreditCardFields card={creditCard} userCurrencyCode={user?.currencyCode} />}
        {modal.kind === "credit-card-consumption" && creditCard && <CardConsumptionFields card={creditCard} data={data} />}
        {modal.kind === "credit-card-payment" && creditCard && <LiabilityPaymentFields item={creditCard} type="card" data={data} />}
        {modal.kind === "credit-card-delete" && creditCard && <div className="danger-confirmation"><span><Icon name="trash" size={20} /></span><div><strong>¿Eliminar {creditCard.name}?</strong><p>Se archivará la tarjeta y se conservará el historial de pagos registrado en Clara.</p></div></div>}

        {modal.kind === "debt" && <DebtFields userCurrencyCode={user?.currencyCode} />}
        {modal.kind === "debt-update" && debt && <DebtFields debt={debt} userCurrencyCode={user?.currencyCode} />}
        {modal.kind === "debt-payment" && debt && <LiabilityPaymentFields item={debt} type="debt" data={data} />}
        {modal.kind === "debt-delete" && debt && <div className="danger-confirmation"><span><Icon name="trash" size={20} /></span><div><strong>¿Eliminar {debt.name}?</strong><p>Se archivará la deuda y sus pagos anteriores seguirán disponibles en el historial.</p></div></div>}

        {modal.kind === "plan-purpose" && <>
          <label><span>¿Cómo quieres organizarte?</span><select name="planningPeriod" defaultValue={user?.profile?.planningPeriod || "monthly"}><option value="monthly">Por mes</option><option value="biweekly">Por quincena</option></select></label>
          <label><span>Propósito del período</span><textarea name="planPurpose" rows="4" maxLength="240" required autoFocus defaultValue={user?.profile?.planPurpose || ""} placeholder="Ej. Ahorrar para mi vehículo sin descuidar mis gastos fijos." /></label>
          <p className="form-note"><Icon name="calendar" size={14} /> Cambiar entre mensual y quincenal modifica inmediatamente el período activo que usa Clara para resumir tus movimientos.</p>
        </>}

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button type="submit" className={copy.danger ? "danger-action" : "primary-action"} disabled={saving}>{saving ? "Guardando…" : copy.submit}</button></div>
      </form>}
    </section>
  </div>;
}

function SettingsModal({ user, saving, error, onClose, onSubmit, onLogout, onEditProfile, pwa }) {
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
        <div className="form-grid">
          <label><span>Nombre</span><input name="firstName" autoComplete="given-name" required defaultValue={user.firstName || user.name?.split(" ")[0] || ""} /></label>
          <label><span>Apellido</span><input name="lastName" autoComplete="family-name" required defaultValue={user.lastName || user.name?.split(" ").slice(1).join(" ") || ""} /></label>
        </div>
        <div className="generated-user settings-generated-user">
          <span><Icon name="user" size={16} /> Usuario de acceso</span>
          <strong>@{user.username}</strong>
          <small>Tu usuario se genera al registrarte y no cambia cuando editas tu nombre.</small>
        </div>
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
      <section className="pwa-settings-card">
        <div className="pwa-settings-head"><span><Icon name="smartphone" size={19} /></span><div><strong>Clara en este dispositivo</strong><small>{pwa.installed ? "Instalada como app" : "Puedes instalarla y usarla como una app"}</small></div></div>
        <div className="pwa-status-grid">
          <span><Icon name={pwa.online ? "wifi" : "wifiOff"} size={16}/><small>Conexión</small><strong>{pwa.online ? "En línea" : "Sin conexión"}</strong></span>
          <span><Icon name="repeat" size={16}/><small>Cola offline</small><strong>{pwa.queueCount} pendiente{pwa.queueCount === 1 ? "" : "s"}</strong></span>
        </div>
        {!pwa.installed && <button type="button" className="pwa-action" onClick={() => void pwa.install()} disabled={pwa.busy}><Icon name="download" size={17}/><span><strong>Instalar Clara</strong><small>{pwa.ios ? "En iPhone te guiamos con los pasos de Apple" : "Abrir como app a pantalla completa"}</small></span><Icon name="chevronRight" size={15}/></button>}
        <button type="button" className="pwa-action" onClick={() => void (pwa.pushEnabled ? pwa.disableNotifications() : pwa.enableNotifications()).catch((err) => pwa.setMessage(err.message))} disabled={pwa.busy}><Icon name="bell" size={17}/><span><strong>{pwa.pushEnabled ? "Notificaciones activadas" : "Activar notificaciones"}</strong><small>{pwa.pushAvailable ? "Recordatorios de pagos, tarjetas, deudas y metas" : "Requiere configurar Web Push en Render"}</small></span><span className={pwa.pushEnabled ? "pwa-toggle on" : "pwa-toggle"}><i/></span></button>
        {pwa.pushEnabled && <button type="button" className="pwa-test-button" onClick={() => void pwa.testNotification().catch((err)=>pwa.setMessage(err.message))}>Enviar notificación de prueba</button>}
        {pwa.message && <p className="pwa-settings-message">{pwa.message}</p>}
      </section>
      <DeveloperMark />
      <div className="settings-security">
        <div><strong>Sesión segura</strong><small>Cierra tu sesión cuando uses un equipo compartido.</small></div>
        <button className="logout-button" type="button" onClick={onLogout}><Icon name="logout" size={15} /> Cerrar sesión</button>
      </div>
    </section>
  </div>;
}

function PwaInstallPrompt({ pwa }) {
  return <div className="pwa-install-backdrop" role="presentation">
    <section className="pwa-install-card" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <div className="pwa-install-icon"><Brand compact /></div>
      <p className="eyebrow">Clara para tu teléfono</p>
      <h2 id="pwa-install-title">¿Instalar Clara en este dispositivo?</h2>
      <p>Ábrela desde tu pantalla de inicio, a pantalla completa, con acceso offline básico y recordatorios.</p>
      <div className="pwa-install-benefits"><span><Icon name="smartphone" size={17}/> Experiencia tipo app</span><span><Icon name="wifiOff" size={17}/> Funciona sin conexión básica</span><span><Icon name="bell" size={17}/> Recordatorios financieros</span></div>
      <div className="pwa-install-actions"><button className="secondary-action" onClick={pwa.dismissInstall}>Ahora no</button><button className="primary-action" onClick={() => void pwa.install()} disabled={pwa.busy}><Icon name="download" size={16}/>{pwa.busy ? "Preparando…" : "Sí, instalar"}</button></div>
      {pwa.ios && <small className="pwa-platform-note">En iPhone, iOS exige confirmar la instalación desde el menú de compartir; Clara te mostrará exactamente dónde tocar.</small>}
    </section>
  </div>;
}

function IosInstallGuide({ onClose }) {
  return <div className="pwa-install-backdrop" role="presentation">
    <section className="pwa-install-card ios-guide" role="dialog" aria-modal="true" aria-labelledby="ios-guide-title">
      <button className="modal-close" onClick={onClose} aria-label="Cerrar"><Icon name="close" size={17}/></button>
      <div className="pwa-install-icon"><Brand compact /></div>
      <p className="eyebrow">Instalar en iPhone</p>
      <h2 id="ios-guide-title">Apple requiere tres toques.</h2>
      <p>iOS no permite que una web se instale silenciosamente. Haz esto una sola vez:</p>
      <div className="ios-install-steps"><span><b>1</b><Icon name="share" size={19}/><div><strong>Toca Compartir</strong><small>El botón de compartir del navegador.</small></div></span><span><b>2</b><Icon name="plus" size={19}/><div><strong>Agregar a pantalla de inicio</strong><small>Busca esa opción en el menú.</small></div></span><span><b>3</b><Icon name="check" size={19}/><div><strong>Toca Agregar</strong><small>Clara aparecerá como una app.</small></div></span></div>
      <button className="primary-action ios-guide-done" onClick={onClose}>Entendido</button>
    </section>
  </div>;
}

function MoneyInput({ label = "Monto" }) {
  const { currencySymbol } = useMoney();
  return <label><span>{label}</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="amount" min="0.01" step="0.01" placeholder="0.00" required /></div></label>;
}

export { SavingsApp };
