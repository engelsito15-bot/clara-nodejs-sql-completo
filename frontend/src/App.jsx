import { createContext, useContext, useEffect, useMemo, useState } from "react";

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
  { id: "inicio", label: "Inicio", icon: "⌂" },
  { id: "movimientos", label: "Movimientos", icon: "↕" },
  { id: "presupuesto", label: "Presupuesto", icon: "▦" },
  { id: "metas", label: "Metas", icon: "◎" },
  { id: "cuentas", label: "Cuentas", icon: "▣" },
];

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

function AuthScreen({ registrationEnabled, onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isRegister = mode === "register";

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

  return <div className="auth-shell">
    <section className="auth-visual">
      <div className="auth-brand">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <strong>clara</strong>
      </div>
      <div className="auth-message">
        <p className="auth-kicker">Finanzas personales</p>
        <h1>Tu dinero, con más claridad.</h1>
        <p>Cada persona tiene su propio perfil, sus cuentas, sus movimientos, sus metas y su moneda. Nada se mezcla entre usuarios.</p>
      </div>
      <div className="auth-points">
        <span><i>01</i><strong>Perfil independiente</strong><small>Tus datos pertenecen solo a tu cuenta.</small></span>
        <span><i>02</i><strong>Todo desde cero</strong><small>Cada perfil inicia con sus cuentas en 0.</small></span>
        <span><i>03</i><strong>Acceso protegido</strong><small>La información requiere una sesión válida.</small></span>
      </div>
    </section>

    <section className="auth-form-area">
      <div className="auth-card">
        {registrationEnabled && <div className="auth-switch" role="tablist" aria-label="Acceso a Clara">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Iniciar sesión</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Crear cuenta</button>
        </div>}

        <p className="eyebrow">{isRegister ? "Nuevo perfil" : "Acceso seguro"}</p>
        <h2>{isRegister ? "Crea tu espacio personal" : "Bienvenido de nuevo"}</h2>
        <p className="auth-description">
          {isRegister
            ? "Tu perfil se crea separado de todos los demás y comienza con sus saldos en cero."
            : "Ingresa tus credenciales para continuar a tu panel personal."}
        </p>

        <form onSubmit={submit}>
          {isRegister && <label>
            <span>Nombre</span>
            <input name="name" autoComplete="name" required autoFocus placeholder="Ej. María Pérez" />
          </label>}
          <label>
            <span>Usuario</span>
            <input name="username" autoComplete="username" required autoFocus={!isRegister} placeholder="Ej. maria.perez" />
          </label>
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
          </button>
        </form>
        <p className="auth-footnote">
          {isRegister ? "Tus cuentas iniciales se crean en 0 y solo serán visibles dentro de tu perfil." : "Clara no muestra información financiera sin una sesión válida."}
        </p>
      </div>
    </section>
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
    }

    try {
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
    try {
      const { response, result } = await apiRequest("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ currencyCode }),
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

  return <MoneyContext.Provider value={moneyTools}>
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActiveView("inicio")} aria-label="Ir al inicio">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>clara</span>
        </button>

        <nav className="side-nav" aria-label="Navegación principal">
          <p className="nav-label">Mi dinero</p>
          {navItems.map((item) => <button
            key={item.id}
            className={activeView === item.id ? "nav-item active" : "nav-item"}
            onClick={() => setActiveView(item.id)}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === "movimientos" && <span className="nav-count">{data.transactions.length}</span>}
          </button>)}
        </nav>

        <div className="sidebar-tip">
          <span className="tip-icon" aria-hidden="true">✦</span>
          <p>Consejo del mes</p>
          <strong>Registra primero tus ingresos y después decide cuánto quieres reservar.</strong>
          <button onClick={() => setActiveView("metas")}>Ver mis metas <span aria-hidden="true">→</span></button>
        </div>

        <button className="profile-chip profile-button" onClick={() => setSettingsOpen(true)} aria-label="Abrir preferencias">
          <span className="avatar">{initials(auth.user.name)}</span>
          <span>
            <strong>{auth.user.name}</strong>
            <small>{currencyInfo(currencyCode).label}</small>
          </span>
          <span className="profile-gear" aria-hidden="true">⚙</span>
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
              <span aria-hidden="true">＋</span> Registrar gasto
            </button>
          </div>
        </header>

        {error && !modal && !settingsOpen && <div className="inline-alert" role="alert">
          <span>No pudimos sincronizar tus datos. La aplicación no mostrará saldos de ejemplo.</span>
          <button onClick={() => void refresh()}>Reintentar</button>
        </div>}
        {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}

        {activeView === "inicio" && <Dashboard
          data={data}
          showBalance={showBalance}
          setShowBalance={setShowBalance}
          openModal={openModal}
          goTo={setActiveView}
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
          <span aria-hidden="true">{item.icon}</span>
          <small>{item.label}</small>
        </button>)}
      </nav>

      {modal && <OperationModal
        modal={modal}
        data={data}
        saving={saving}
        error={error}
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

function Dashboard({ data, showBalance, setShowBalance, openModal, goTo }) {
  const { money, shortMoney, currencySymbol } = useMoney();
  const savingsRate = data.summary.monthlyIncome
    ? Math.max(0, Math.round(((data.summary.monthlyIncome - data.summary.monthlyExpenses) / data.summary.monthlyIncome) * 100))
    : 0;
  const flow = buildFlowBars(data.transactions);
  const labels = chartLabels();

  return <div className="dashboard-grid">
    <div className="dashboard-primary">
      <section className="balance-hero">
        <div className="hero-topline">
          <span>Patrimonio total</span>
          <button className="icon-button" onClick={() => setShowBalance(!showBalance)} aria-label={showBalance ? "Ocultar saldos" : "Mostrar saldos"}>
            {showBalance ? "◉" : "○"}
          </button>
        </div>
        <strong className="hero-balance">{showBalance ? money(data.summary.totalBalance) : `${currencySymbol} ••••••`}</strong>
        <div className="hero-meta">
          <span><i className="positive-dot" /> Disponible en presupuesto <strong>{showBalance ? money(data.summary.budgetAvailable) : "••••"}</strong></span>
          <span className="hero-change">{savingsRate}% libre</span>
        </div>
        <div className="quick-actions">
          <button onClick={() => openModal("expense")}><span className="quick-icon coral">−</span><span><strong>Gasto</strong><small>Registrar salida</small></span></button>
          <button onClick={() => openModal("income")}><span className="quick-icon mint">＋</span><span><strong>Ingreso</strong><small>Sumar dinero</small></span></button>
          <button onClick={() => openModal("transfer")}><span className="quick-icon sky">↔</span><span><strong>Transferir</strong><small>Entre cuentas</small></span></button>
        </div>
      </section>

      <section className="section-card cashflow-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{currentMonthLabel()}</p>
            <h2>Flujo del mes</h2>
          </div>
          <div className="flow-legend">
            <span><i className="income-dot" /> Entró <strong>{shortMoney(data.summary.monthlyIncome)}</strong></span>
            <span><i className="expense-dot" /> Salió <strong>{shortMoney(data.summary.monthlyExpenses)}</strong></span>
          </div>
        </div>
        <div className={flow.hasActivity ? "flow-chart" : "flow-chart empty"} aria-label={`Gráfico del flujo de dinero de ${monthName()}`}>
          {flow.bars.map((bar, index) => <span className="bar-track" key={index}>
            <i className={bar.highlight ? "chart-bar highlight" : "chart-bar"} style={{ height: `${bar.height}%` }} />
          </span>)}
          {!flow.hasActivity && <span className="flow-empty-message">Aún no hay movimientos este mes.</span>}
        </div>
        <div className="chart-labels">{labels.map((label) => <span key={label}>{label}</span>)}</div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Plan del mes</p><h2>Dinero con propósito</h2></div>
          <button className="text-button" onClick={() => goTo("presupuesto")}>Ver presupuesto <span aria-hidden="true">→</span></button>
        </div>
        <div className="budget-list compact">
          {data.categories.slice(0, 4).map((category) => <BudgetRow key={category.id} category={category} onEdit={() => openModal("budget", category.id)} compact />)}
        </div>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <div><p className="eyebrow">Actividad reciente</p><h2>Últimos movimientos</h2></div>
          <button className="text-button" onClick={() => goTo("movimientos")}>Ver todos <span aria-hidden="true">→</span></button>
        </div>
        <TransactionList transactions={data.transactions.slice(0, 5)} />
      </section>
    </div>

    <aside className="dashboard-aside">
      <section className="section-card accounts-summary">
        <div className="section-heading"><div><p className="eyebrow">Saldos</p><h2>Mis cuentas</h2></div><button className="mini-add" onClick={() => openModal("account")} aria-label="Añadir cuenta">＋</button></div>
        <div className="account-stack">
          {data.accounts.map((account) => <div className="account-row" key={account.id}>
            <span className={`account-symbol ${account.color}`}>{account.kind === "cash" ? "EF" : account.kind === "savings" ? "AH" : "CP"}</span>
            <span><strong>{account.name}</strong><small>{account.kind === "cash" ? "Dinero físico" : account.kind === "savings" ? "Reserva" : "Uso diario"}</small></span>
            <strong>{showBalance ? money(account.balance) : "••••"}</strong>
          </div>)}
        </div>
        <button className="secondary-action full" onClick={() => openModal("transfer")}>↔ Hacer transferencia</button>
      </section>

      <section className="section-card goal-spotlight">
        <div className="goal-illustration" aria-hidden="true"><span>◎</span><i /><i /></div>
        <p className="eyebrow">Meta destacada</p>
        <h2>{data.goals[0]?.name ?? "Tu próxima meta"}</h2>
        {data.goals[0] ? <>
          <div className="goal-numbers"><strong>{money(data.goals[0].currentAmount)}</strong><span>de {money(data.goals[0].targetAmount)}</span></div>
          <Progress value={percentage(data.goals[0].currentAmount, data.goals[0].targetAmount)} color={data.goals[0].color} />
          <div className="goal-footer"><span>{percentage(data.goals[0].currentAmount, data.goals[0].targetAmount)}% logrado</span><span>Faltan {money(data.goals[0].targetAmount - data.goals[0].currentAmount)}</span></div>
          <button className="primary-action full" onClick={() => openModal("goal-contribution", data.goals[0].id)}>Aportar a la meta</button>
        </> : <>
          <p className="goal-empty-copy">Crea una meta para separar dinero con un objetivo concreto.</p>
          <button className="primary-action full" onClick={() => openModal("goal")}>Crear mi primera meta</button>
        </>}
      </section>

      <section className="insight-card">
        <span className="insight-mark">✦</span>
        <p>{data.summary.budgetTotal ? "Resumen del mes" : "Empieza con un plan"}</p>
        <strong>{data.summary.budgetTotal
          ? `Has utilizado ${Math.round((data.summary.monthlyExpenses / Math.max(data.summary.budgetTotal, 1)) * 100)}% de tu presupuesto mensual.`
          : "Define límites por categoría para saber cuánto puedes gastar sin perder de vista tus metas."}</strong>
      </section>
    </aside>
  </div>;
}

function TransactionsView({ transactions, search, setSearch, filter, setFilter, openModal }) {
  return <section className="page-card">
    <div className="page-intro">
      <div><p className="eyebrow">Historial completo</p><h2>Movimientos</h2><p>Busca, revisa y entiende exactamente a dónde fue tu dinero.</p></div>
      <div className="split-actions"><button className="secondary-action" onClick={() => openModal("income")}>＋ Ingreso</button><button className="primary-action" onClick={() => openModal("expense")}>＋ Gasto</button></div>
    </div>
    <div className="transaction-toolbar">
      <label className="search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, cuenta o categoría" aria-label="Buscar movimientos" /></label>
      <div className="filter-chips" aria-label="Filtrar movimientos">
        {[["all", "Todos"], ["expense", "Gastos"], ["income", "Ingresos"], ["transfer", "Transferencias"]].map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
    </div>
    <div className="table-head"><span>Movimiento</span><span>Categoría</span><span>Cuenta</span><span>Fecha</span><span>Monto</span></div>
    <TransactionList transactions={transactions} detailed />
    {!transactions.length && <div className="empty-state"><span>↕</span><h3>No hay movimientos para mostrar</h3><p>Registra un ingreso o gasto para comenzar tu historial.</p></div>}
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
      <button className="primary-action" onClick={() => openModal("goal")}>＋ Nueva meta</button>
    </div>
    <div className="goal-summary-strip">
      <span><small>Total reservado</small><strong>{money(totalSaved)}</strong></span>
      <span><small>Metas activas</small><strong>{data.goals.length}</strong></span>
      <span><small>Próxima fecha</small><strong>{data.goals[0] ? longDate(data.goals[0].dueDate) : "Sin fecha"}</strong></span>
    </div>
    <div className="goals-grid">
      {data.goals.map((goal, index) => <article className={`goal-card ${goal.color}`} key={goal.id}>
        <div className="goal-card-top"><span className="goal-badge">{index === 0 ? "Prioridad" : "En progreso"}</span><span className="goal-round-icon">{index % 2 ? "✦" : "◎"}</span></div>
        <p>Meta para {longDate(goal.dueDate)}</p>
        <h3>{goal.name}</h3>
        <div className="goal-big-number"><strong>{money(goal.currentAmount)}</strong><span> / {money(goal.targetAmount)}</span></div>
        <Progress value={percentage(goal.currentAmount, goal.targetAmount)} color={goal.color} />
        <div className="goal-card-footer"><span>{percentage(goal.currentAmount, goal.targetAmount)}% completado</span><button onClick={() => openModal("goal-contribution", goal.id)}>Aportar →</button></div>
      </article>)}
      <button className="new-goal-card" onClick={() => openModal("goal")}><span>＋</span><strong>{data.goals.length ? "Crear otra meta" : "Crear tu primera meta"}</strong><small>Define cuánto quieres y para cuándo.</small></button>
    </div>
  </section>;
}

function AccountsView({ data, openModal, showBalance }) {
  const { money, currencySymbol } = useMoney();
  return <>
    <section className="account-overview-card">
      <div><p className="eyebrow light">Patrimonio combinado</p><strong>{showBalance ? money(data.summary.totalBalance) : `${currencySymbol} ••••••`}</strong><p>La suma de todas tus cuentas registradas.</p></div>
      <div className="account-overview-actions"><button onClick={() => openModal("transfer")}>↔ Transferir</button><button onClick={() => openModal("account")}>＋ Añadir cuenta</button></div>
    </section>
    <section className="page-card">
      <div className="page-intro compact-intro"><div><p className="eyebrow">Saldos separados</p><h2>Mis cuentas</h2><p>Mantén el banco, los ahorros y el efectivo en una sola vista.</p></div></div>
      <div className="accounts-grid">
        {data.accounts.map((account) => <article className={`account-card ${account.color}`} key={account.id}>
          <div className="account-card-top"><span className="account-symbol large">{account.kind === "cash" ? "EF" : account.kind === "savings" ? "AH" : "CP"}</span><span className="account-kind">{account.kind === "cash" ? "Efectivo" : account.kind === "savings" ? "Ahorros" : "Cuenta bancaria"}</span></div>
          <h3>{account.name}</h3>
          <strong>{showBalance ? money(account.balance) : "••••••"}</strong>
          <div className="account-card-foot"><span>Actualizado ahora</span><button onClick={() => openModal("transfer")}>Mover dinero →</button></div>
        </article>)}
        <button className="account-card account-add" onClick={() => openModal("account")}><span>＋</span><strong>Añadir otra cuenta</strong><small>Banco, ahorros o efectivo.</small></button>
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
      <button onClick={onEdit} aria-label={`Ajustar presupuesto de ${category.name}`}>{compact ? "•••" : "Ajustar"}</button>
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
    return <div className="mini-empty"><span>↕</span><p>Aún no hay movimientos. Registra tu primer ingreso para comenzar.</p></div>;
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

function OperationModal({ modal, data, saving, error, onClose, onSubmit }) {
  const { money, currencySymbol } = useMoney();
  const category = data.categories.find((item) => item.id === modal.referenceId);
  const goal = data.goals.find((item) => item.id === modal.referenceId);
  const titles = {
    expense: { eyebrow: "Nuevo movimiento", title: "Registrar gasto", submit: "Guardar gasto" },
    income: { eyebrow: "Nuevo movimiento", title: "Registrar ingreso", submit: "Guardar ingreso" },
    transfer: { eyebrow: "Entre tus cuentas", title: "Hacer transferencia", submit: "Transferir dinero" },
    budget: { eyebrow: "Plan mensual", title: `Ajustar ${category?.name ?? "categoría"}`, submit: "Guardar presupuesto" },
    goal: { eyebrow: "Ahorro con destino", title: "Crear nueva meta", submit: "Crear meta" },
    "goal-contribution": { eyebrow: "Avanza un poco más", title: `Aportar a ${goal?.name ?? "la meta"}`, submit: "Guardar aporte" },
    account: { eyebrow: "Nuevo saldo", title: "Añadir cuenta", submit: "Crear cuenta" },
  };
  const copy = titles[modal.kind];

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
      <p className="eyebrow">{copy.eyebrow}</p>
      <h2 id="modal-title">{copy.title}</h2>
      <form onSubmit={onSubmit}>
        {(modal.kind === "expense" || modal.kind === "income") && <>
          <label><span>Concepto</span><input name="description" required autoFocus placeholder={modal.kind === "expense" ? "Ej. Supermercado" : "Ej. Pago mensual"} /></label>
          <MoneyInput />
          <label><span>Cuenta</span><select name="accountId" required defaultValue={data.accounts[0]?.id}>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.balance)}</option>)}</select></label>
          {modal.kind === "expense" && <label><span>Categoría</span><select name="categoryId" required defaultValue={data.categories[0]?.id}>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name} — quedan {money(Math.max(item.monthlyLimit - item.spent, 0))}</option>)}</select></label>}
          <div className="form-grid"><label><span>Fecha</span><input type="date" name="transactionDate" defaultValue={todayIso()} required /></label><label><span>Nota <small>opcional</small></span><input name="note" placeholder="Añade un detalle" /></label></div>
        </>}

        {modal.kind === "transfer" && <>
          <label><span>Desde</span><select name="accountId" required defaultValue={data.accounts[0]?.id}>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.balance)}</option>)}</select></label>
          <label><span>Hacia</span><select name="destinationAccountId" required defaultValue={data.accounts[1]?.id}>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <MoneyInput />
          <div className="form-grid"><label><span>Fecha</span><input type="date" name="transactionDate" defaultValue={todayIso()} required /></label><label><span>Nota <small>opcional</small></span><input name="note" placeholder="Motivo" /></label></div>
          <p className="form-note">La transferencia mueve el saldo entre tus cuentas sin registrarlo como gasto.</p>
        </>}

        {modal.kind === "budget" && <>
          <div className="modal-context"><span className={`category-symbol ${category?.color ?? "mint"}`}>{category?.symbol ?? "CA"}</span><span><small>Actualmente</small><strong>{money(category?.monthlyLimit ?? 0)} al mes</strong></span></div>
          <label><span>Nuevo límite mensual</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="monthlyLimit" min="0" step="0.01" defaultValue={((category?.monthlyLimit ?? 0) / 100).toFixed(2)} required autoFocus /></div></label>
          <p className="form-note">Este cambio no modifica lo que ya gastaste; solo ajusta cuánto separas para la categoría.</p>
        </>}

        {modal.kind === "goal" && <>
          <label><span>Nombre de la meta</span><input name="name" required autoFocus placeholder="Ej. Computadora nueva" /></label>
          <label><span>¿Cuánto necesitas?</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="targetAmount" min="0.01" step="0.01" placeholder="0.00" required /></div></label>
          <label><span>¿Para cuándo?</span><input type="date" name="dueDate" min={todayIso()} required /></label>
        </>}

        {modal.kind === "goal-contribution" && <>
          <div className="modal-context goal-context"><span className="goal-round-icon">◎</span><span><small>Faltan</small><strong>{money(Math.max((goal?.targetAmount ?? 0) - (goal?.currentAmount ?? 0), 0))}</strong></span></div>
          <MoneyInput label="Monto del aporte" />
          <label><span>Tomar dinero de</span><select name="accountId" required defaultValue={data.accounts[0]?.id}>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.balance)}</option>)}</select></label>
          <p className="form-note">El aporte se descontará de la cuenta elegida y quedará reservado dentro de la meta.</p>
        </>}

        {modal.kind === "account" && <>
          <label><span>Nombre de la cuenta</span><input name="name" required autoFocus placeholder="Ej. Banco Popular" /></label>
          <label><span>Tipo</span><select name="kind" defaultValue="bank"><option value="bank">Cuenta bancaria</option><option value="savings">Cuenta de ahorros</option><option value="cash">Efectivo</option></select></label>
          <label><span>Saldo actual</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="amount" min="0" step="0.01" defaultValue="0.00" required /></div></label>
        </>}

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando…" : copy.submit}</button></div>
      </form>
    </section>
  </div>;
}

function SettingsModal({ user, saving, error, onClose, onSubmit, onLogout }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="modal-card settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
      <p className="eyebrow">Preferencias</p>
      <h2 id="settings-title">Tu cuenta</h2>
      <div className="settings-user">
        <span className="avatar settings-avatar">{initials(user.name)}</span>
        <span><strong>{user.name}</strong><small>@{user.username}</small></span>
      </div>
      <form onSubmit={onSubmit}>
        <label><span>Moneda del sistema</span>
          <select name="currencyCode" defaultValue={user.currencyCode || "DOP"}>
            {currencyOptions.map((currency) => <option value={currency.code} key={currency.code}>{currency.label} ({currency.code})</option>)}
          </select>
        </label>
        <p className="form-note">La moneda cambia el símbolo y el formato visual. No convierte automáticamente los saldos existentes.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
      </form>
      <div className="settings-security">
        <div><strong>Sesión segura</strong><small>Cierra tu sesión cuando uses un equipo compartido.</small></div>
        <button className="logout-button" type="button" onClick={onLogout}>Cerrar sesión</button>
      </div>
    </section>
  </div>;
}

function MoneyInput({ label = "Monto" }) {
  const { currencySymbol } = useMoney();
  return <label><span>{label}</span><div className="money-field"><span>{currencySymbol}</span><input type="number" name="amount" min="0.01" step="0.01" placeholder="0.00" required /></div></label>;
}

export { SavingsApp };
