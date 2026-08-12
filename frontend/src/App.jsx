"use client";
import { useEffect, useMemo, useState } from "react";
const DEMO_DATA = {
  accounts: [
    { id: "acc-main", name: "Cuenta principal", kind: "bank", balance: 986e3, color: "forest" },
    { id: "acc-savings", name: "Ahorros", kind: "savings", balance: 765060, color: "mint" },
    { id: "acc-cash", name: "Efectivo", kind: "cash", balance: 123e3, color: "sun" }
  ],
  categories: [
    { id: "cat-home", name: "Vivienda", symbol: "VI", monthlyLimit: 25e4, spent: 155e3, color: "forest" },
    { id: "cat-food", name: "Alimentaci\xF3n", symbol: "AL", monthlyLimit: 12e4, spent: 74250, color: "coral" },
    { id: "cat-transport", name: "Transporte", symbol: "TR", monthlyLimit: 6e4, spent: 25800, color: "sky" },
    { id: "cat-wellness", name: "Bienestar", symbol: "BI", monthlyLimit: 45e3, spent: 18540, color: "lilac" },
    { id: "cat-leisure", name: "Ocio", symbol: "OC", monthlyLimit: 4e4, spent: 21e3, color: "sun" },
    { id: "cat-learning", name: "Educaci\xF3n", symbol: "ED", monthlyLimit: 5e4, spent: 12e3, color: "mint" }
  ],
  transactions: [
    { id: "tx-light", type: "expense", description: "Electricidad", amount: 16e3, accountId: "acc-main", categoryId: "cat-home", transactionDate: "2026-08-09", note: "", accountName: "Cuenta principal", categoryName: "Vivienda", categorySymbol: "VI", categoryColor: "forest" },
    { id: "tx-cinema", type: "expense", description: "Cine y caf\xE9", amount: 21e3, accountId: "acc-main", categoryId: "cat-leisure", transactionDate: "2026-08-08", note: "", accountName: "Cuenta principal", categoryName: "Ocio", categorySymbol: "OC", categoryColor: "sun" },
    { id: "tx-course", type: "expense", description: "Curso de dise\xF1o", amount: 12e3, accountId: "acc-main", categoryId: "cat-learning", transactionDate: "2026-08-08", note: "", accountName: "Cuenta principal", categoryName: "Educaci\xF3n", categorySymbol: "ED", categoryColor: "mint" },
    { id: "tx-taxi", type: "expense", description: "Transporte urbano", amount: 12800, accountId: "acc-cash", categoryId: "cat-transport", transactionDate: "2026-08-07", note: "", accountName: "Efectivo", categoryName: "Transporte", categorySymbol: "TR", categoryColor: "sky" },
    { id: "tx-gym", type: "expense", description: "Gimnasio", amount: 18540, accountId: "acc-main", categoryId: "cat-wellness", transactionDate: "2026-08-05", note: "", accountName: "Cuenta principal", categoryName: "Bienestar", categorySymbol: "BI", categoryColor: "lilac" },
    { id: "tx-pay", type: "income", description: "Pago mensual", amount: 68e4, accountId: "acc-main", transactionDate: "2026-08-01", note: "Ingreso principal", accountName: "Cuenta principal" }
  ],
  goals: [
    { id: "goal-emergency", name: "Fondo de emergencia", targetAmount: 15e5, currentAmount: 765060, dueDate: "2027-03-31", color: "mint" },
    { id: "goal-trip", name: "Viaje a Per\xFA", targetAmount: 85e4, currentAmount: 245e3, dueDate: "2027-01-15", color: "sun" }
  ],
  summary: {
    totalBalance: 1874060,
    monthlyIncome: 68e4,
    monthlyExpenses: 306590,
    budgetTotal: 565e3,
    budgetAvailable: 258410
  }
};
const navItems = [
  { id: "inicio", label: "Inicio", icon: "\u2302" },
  { id: "movimientos", label: "Movimientos", icon: "\u2195" },
  { id: "presupuesto", label: "Presupuesto", icon: "\u25A6" },
  { id: "metas", label: "Metas", icon: "\u25CE" },
  { id: "cuentas", label: "Cuentas", icon: "\u25A3" }
];
const chartBars = [42, 58, 38, 68, 52, 77, 49, 61, 88, 56, 72, 64, 92, 70];
const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
function money(cents) {
  return `Bs ${(cents / 100).toLocaleString("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
function shortMoney(cents) {
  const amount = cents / 100;
  if (amount >= 1e3) return `Bs ${(amount / 1e3).toFixed(1)}k`;
  return `Bs ${amount.toFixed(0)}`;
}
function prettyDate(value) {
  const date = /* @__PURE__ */ new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short" }).format(date).replace(".", "");
}
function longDate(value) {
  const date = /* @__PURE__ */ new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "long", year: "numeric" }).format(date);
}
function percentage(value, total) {
  if (!total) return 0;
  return Math.min(Math.round(value / total * 100), 100);
}
function todayIso() {
  const now = /* @__PURE__ */ new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 6e4);
  return localDate.toISOString().slice(0, 10);
}
function todayLabel() {
  return new Intl.DateTimeFormat("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(/* @__PURE__ */ new Date());
}
function currentMonthLabel() {
  const label = new Intl.DateTimeFormat("es-BO", {
    month: "long",
    year: "numeric"
  }).format(/* @__PURE__ */ new Date());
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function SavingsApp() {
  const [activeView, setActiveView] = useState("inicio");
  const [data, setData] = useState(DEMO_DATA);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showBalance, setShowBalance] = useState(true);
  const [search, setSearch] = useState("");
  const [transactionFilter, setTransactionFilter] = useState("all");
  async function refresh() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/finance`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.data) throw new Error(result.error ?? "No se pudieron cargar los datos.");
      setData(result.data);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo conectar con tus datos.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return data.transactions.filter((transaction) => {
      const matchesFilter = transactionFilter === "all" || transaction.type === transactionFilter;
      const matchesQuery = !query || `${transaction.description} ${transaction.categoryName ?? ""} ${transaction.accountName}`.toLocaleLowerCase("es").includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [data.transactions, search, transactionFilter]);
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
      const response = await fetch(`${API_BASE_URL}/api/finance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.data) throw new Error(result.error ?? "No se pudo guardar la operaci\xF3n.");
      setData(result.data);
      setModal(null);
      setNotice("Listo, el movimiento qued\xF3 guardado.");
      window.setTimeout(() => setNotice(""), 3500);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar la operaci\xF3n.");
    } finally {
      setSaving(false);
    }
  }
  return <div className="app-shell">
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
          <strong>Separa tu ahorro apenas recibas un ingreso.</strong>
          <button onClick={() => setActiveView("metas")}>Ver mis metas <span aria-hidden="true">→</span></button>
        </div>

        <div className="profile-chip">
          <span className="avatar">EG</span>
          <span>
            <strong>Engels</strong>
            <small>Plan personal</small>
          </span>
          <span className="status-dot" title="Datos guardados" />
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">{todayLabel()}</p>
            <h1>{viewTitle(activeView)}</h1>
          </div>
          <div className="topbar-actions">
            <span className={loading ? "save-status loading" : "save-status"}>
              <i /> {loading ? "Conectando\u2026" : "Todo guardado"}
            </span>
            <button className="primary-action" onClick={() => openModal("expense")}>
              <span aria-hidden="true">＋</span> Registrar gasto
            </button>
          </div>
        </header>

        {error && !modal && <div className="inline-alert" role="alert">
            <span>La vista usa los datos de ejemplo mientras se restablece la conexión.</span>
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
        {navItems.slice(0, 5).map((item) => <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}>
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
    </div>;
}
function viewTitle(view) {
  const titles = {
    inicio: "Tu dinero, bien pensado.",
    movimientos: "Cada movimiento cuenta.",
    presupuesto: "Dale un trabajo a cada peso.",
    metas: "Ahorra con un destino.",
    cuentas: "Todo tu dinero, en orden."
  };
  return titles[view];
}
function Dashboard({
  data,
  showBalance,
  setShowBalance,
  openModal,
  goTo
}) {
  const savingsRate = data.summary.monthlyIncome ? Math.round((data.summary.monthlyIncome - data.summary.monthlyExpenses) / data.summary.monthlyIncome * 100) : 0;
  return <div className="dashboard-grid">
      <div className="dashboard-primary">
        <section className="balance-hero">
          <div className="hero-topline">
            <span>Patrimonio total</span>
            <button className="icon-button" onClick={() => setShowBalance(!showBalance)} aria-label={showBalance ? "Ocultar saldos" : "Mostrar saldos"}>
              {showBalance ? "\u25C9" : "\u25CB"}
            </button>
          </div>
          <strong className="hero-balance">{showBalance ? money(data.summary.totalBalance) : "Bs \u2022\u2022\u2022\u2022\u2022\u2022"}</strong>
          <div className="hero-meta">
            <span><i className="positive-dot" /> Disponible en presupuesto <strong>{showBalance ? money(data.summary.budgetAvailable) : "\u2022\u2022\u2022\u2022"}</strong></span>
            <span className="hero-change">↑ {savingsRate}% libre</span>
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
          <div className="flow-chart" aria-label="Gráfico del flujo de dinero de agosto">
            {chartBars.map((height, index) => <span className="bar-track" key={index}>
                <i className={index === 12 ? "chart-bar highlight" : "chart-bar"} style={{ height: `${height}%` }} />
              </span>)}
          </div>
          <div className="chart-labels"><span>1 ago</span><span>8 ago</span><span>15 ago</span><span>22 ago</span><span>31 ago</span></div>
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
                <span><strong>{account.name}</strong><small>{account.kind === "cash" ? "Dinero f\xEDsico" : account.kind === "savings" ? "Reserva" : "Uso diario"}</small></span>
                <strong>{showBalance ? money(account.balance) : "\u2022\u2022\u2022\u2022"}</strong>
              </div>)}
          </div>
          <button className="secondary-action full" onClick={() => openModal("transfer")}>↔ Hacer transferencia</button>
        </section>

        <section className="section-card goal-spotlight">
          <div className="goal-illustration" aria-hidden="true"><span>◎</span><i /><i /></div>
          <p className="eyebrow">Meta destacada</p>
          <h2>{data.goals[0]?.name ?? "Nueva meta"}</h2>
          {data.goals[0] ? <>
              <div className="goal-numbers"><strong>{money(data.goals[0].currentAmount)}</strong><span>de {money(data.goals[0].targetAmount)}</span></div>
              <Progress value={percentage(data.goals[0].currentAmount, data.goals[0].targetAmount)} color={data.goals[0].color} />
              <div className="goal-footer"><span>{percentage(data.goals[0].currentAmount, data.goals[0].targetAmount)}% logrado</span><span>Faltan {money(data.goals[0].targetAmount - data.goals[0].currentAmount)}</span></div>
              <button className="primary-action full" onClick={() => openModal("goal-contribution", data.goals[0].id)}>Aportar a la meta</button>
            </> : <button className="primary-action full" onClick={() => openModal("goal")}>Crear mi primera meta</button>}
        </section>

        <section className="insight-card">
          <span className="insight-mark">✦</span>
          <p>Vas por buen camino</p>
          <strong>Tus gastos están {Math.max(0, 100 - Math.round(data.summary.monthlyExpenses / Math.max(data.summary.budgetTotal, 1) * 100))}% por debajo de tu presupuesto mensual.</strong>
        </section>
      </aside>
    </div>;
}
function TransactionsView({
  transactions,
  search,
  setSearch,
  filter,
  setFilter,
  openModal
}) {
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
      {!transactions.length && <div className="empty-state"><span>⌕</span><h3>No encontramos movimientos</h3><p>Prueba otra búsqueda o cambia los filtros.</p></div>}
    </section>;
}
function BudgetView({ data, openModal }) {
  const used = data.categories.reduce((total, category) => total + category.spent, 0);
  const assigned = data.categories.reduce((total, category) => total + category.monthlyLimit, 0);
  return <>
      <section className="budget-overview">
        <div>
          <p className="eyebrow light">Presupuesto de agosto</p>
          <h2>{money(data.summary.budgetAvailable)} <span>todavía disponibles</span></h2>
          <p>Has usado {money(used)} de los {money(assigned)} que planeaste para este mes.</p>
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
            <div className="goal-card-top"><span className="goal-badge">{index === 0 ? "Prioridad" : "En progreso"}</span><span className="goal-round-icon">{index % 2 ? "\u2726" : "\u25CE"}</span></div>
            <p>Meta para {longDate(goal.dueDate)}</p>
            <h3>{goal.name}</h3>
            <div className="goal-big-number"><strong>{money(goal.currentAmount)}</strong><span> / {money(goal.targetAmount)}</span></div>
            <Progress value={percentage(goal.currentAmount, goal.targetAmount)} color={goal.color} />
            <div className="goal-card-footer"><span>{percentage(goal.currentAmount, goal.targetAmount)}% completado</span><button onClick={() => openModal("goal-contribution", goal.id)}>Aportar →</button></div>
          </article>)}
        <button className="new-goal-card" onClick={() => openModal("goal")}><span>＋</span><strong>Crear otra meta</strong><small>Define cuánto quieres y para cuándo.</small></button>
      </div>
    </section>;
}
function AccountsView({ data, openModal, showBalance }) {
  return <>
      <section className="account-overview-card">
        <div><p className="eyebrow light">Patrimonio combinado</p><strong>{showBalance ? money(data.summary.totalBalance) : "Bs \u2022\u2022\u2022\u2022\u2022\u2022"}</strong><p>La suma de todas tus cuentas registradas.</p></div>
        <div className="account-overview-actions"><button onClick={() => openModal("transfer")}>↔ Transferir</button><button onClick={() => openModal("account")}>＋ Añadir cuenta</button></div>
      </section>
      <section className="page-card">
        <div className="page-intro compact-intro"><div><p className="eyebrow">Saldos separados</p><h2>Mis cuentas</h2><p>Mantén el banco, los ahorros y el efectivo en una sola vista.</p></div></div>
        <div className="accounts-grid">
          {data.accounts.map((account) => <article className={`account-card ${account.color}`} key={account.id}>
              <div className="account-card-top"><span className="account-symbol large">{account.kind === "cash" ? "EF" : account.kind === "savings" ? "AH" : "CP"}</span><span className="account-kind">{account.kind === "cash" ? "Efectivo" : account.kind === "savings" ? "Ahorros" : "Cuenta bancaria"}</span></div>
              <h3>{account.name}</h3>
              <strong>{showBalance ? money(account.balance) : "\u2022\u2022\u2022\u2022\u2022\u2022"}</strong>
              <div className="account-card-foot"><span>Actualizado ahora</span><button onClick={() => openModal("transfer")}>Mover dinero →</button></div>
            </article>)}
          <button className="new-goal-card account-add" onClick={() => openModal("account")}><span>＋</span><strong>Añadir cuenta</strong><small>Banco, ahorro o efectivo.</small></button>
        </div>
      </section>
    </>;
}
function BudgetRow({ category, onEdit, compact = false }) {
  const used = percentage(category.spent, category.monthlyLimit);
  const remaining = Math.max(category.monthlyLimit - category.spent, 0);
  return <article className={compact ? "budget-item compact" : "budget-item"}>
      <div className="budget-item-top">
        <span className={`category-symbol ${category.color}`}>{category.symbol}</span>
        <span><strong>{category.name}</strong><small>{money(remaining)} disponibles</small></span>
        <button onClick={onEdit} aria-label={`Ajustar presupuesto de ${category.name}`}>{compact ? "\u2022\u2022\u2022" : "Ajustar"}</button>
      </div>
      <Progress value={used} color={category.color} />
      <div className="budget-item-meta"><span>{money(category.spent)} usado</span><span>{money(category.monthlyLimit)} límite</span></div>
    </article>;
}
function Progress({ value, color }) {
  return <span className="progress-track" aria-label={`${value}% completado`}><i className={color} style={{ width: `${Math.min(value, 100)}%` }} /></span>;
}
function TransactionList({ transactions, detailed = false }) {
  return <div className={detailed ? "transaction-list detailed" : "transaction-list"}>
      {transactions.map((transaction) => <article className="transaction-row" key={transaction.id}>
          <div className="transaction-main">
            <span className={`transaction-symbol ${transaction.type === "income" ? "mint" : transaction.type === "transfer" ? "sky" : transaction.categoryColor ?? "coral"}`}>{transaction.type === "income" ? "IN" : transaction.type === "transfer" ? "TR" : transaction.categorySymbol ?? "GA"}</span>
            <span><strong>{transaction.description}</strong><small>{detailed ? transaction.note || "Sin nota" : `${transaction.accountName} \xB7 ${prettyDate(transaction.transactionDate)}`}</small></span>
          </div>
          {detailed && <span className="transaction-category">{transaction.type === "income" ? "Ingreso" : transaction.type === "transfer" ? "Transferencia" : transaction.categoryName ?? "Sin categor\xEDa"}</span>}
          {detailed && <span className="transaction-account">{transaction.accountName}</span>}
          {detailed && <span className="transaction-date">{prettyDate(transaction.transactionDate)}</span>}
          <strong className={`transaction-amount ${transaction.type}`}>{transaction.type === "income" ? "+" : transaction.type === "expense" ? "\u2212" : ""}{money(transaction.amount)}</strong>
        </article>)}
    </div>;
}
function OperationModal({
  modal,
  data,
  saving,
  error,
  onClose,
  onSubmit
}) {
  const category = data.categories.find((item) => item.id === modal.referenceId);
  const goal = data.goals.find((item) => item.id === modal.referenceId);
  const titles = {
    expense: { eyebrow: "Nuevo movimiento", title: "Registrar gasto", submit: "Guardar gasto" },
    income: { eyebrow: "Nuevo movimiento", title: "Registrar ingreso", submit: "Guardar ingreso" },
    transfer: { eyebrow: "Entre tus cuentas", title: "Hacer transferencia", submit: "Transferir dinero" },
    budget: { eyebrow: "Plan mensual", title: `Ajustar ${category?.name ?? "categor\xEDa"}`, submit: "Guardar presupuesto" },
    goal: { eyebrow: "Ahorro con destino", title: "Crear nueva meta", submit: "Crear meta" },
    "goal-contribution": { eyebrow: "Avanza un poco m\xE1s", title: `Aportar a ${goal?.name ?? "la meta"}`, submit: "Guardar aporte" },
    account: { eyebrow: "Nuevo saldo", title: "A\xF1adir cuenta", submit: "Crear cuenta" }
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
              <p className="form-note">La transferencia moverá el saldo entre tus cuentas sin registrarlo como gasto.</p>
            </>}

          {modal.kind === "budget" && <>
              <div className="modal-context"><span className={`category-symbol ${category?.color ?? "mint"}`}>{category?.symbol ?? "CA"}</span><span><small>Actualmente</small><strong>{money(category?.monthlyLimit ?? 0)} al mes</strong></span></div>
              <label><span>Nuevo límite mensual</span><div className="money-field"><span>Bs</span><input type="number" name="monthlyLimit" min="0.01" step="0.01" defaultValue={((category?.monthlyLimit ?? 0) / 100).toFixed(2)} required autoFocus /></div></label>
              <p className="form-note">Este cambio no modifica lo que ya gastaste; solo ajusta cuánto separas para la categoría.</p>
            </>}

          {modal.kind === "goal" && <>
              <label><span>Nombre de la meta</span><input name="name" required autoFocus placeholder="Ej. Computadora nueva" /></label>
              <label><span>¿Cuánto necesitas?</span><div className="money-field"><span>Bs</span><input type="number" name="targetAmount" min="0.01" step="0.01" placeholder="0.00" required /></div></label>
              <label><span>¿Para cuándo?</span><input type="date" name="dueDate" min={todayIso()} required /></label>
            </>}

          {modal.kind === "goal-contribution" && <>
              <div className="modal-context goal-context"><span className="goal-round-icon">◎</span><span><small>Faltan</small><strong>{money(Math.max((goal?.targetAmount ?? 0) - (goal?.currentAmount ?? 0), 0))}</strong></span></div>
              <MoneyInput label="Monto del aporte" />
              <label><span>Tomar dinero de</span><select name="accountId" required defaultValue={data.accounts[0]?.id}>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.balance)}</option>)}</select></label>
              <p className="form-note">El aporte se descontará de la cuenta elegida y quedará reservado dentro de la meta.</p>
            </>}

          {modal.kind === "account" && <>
              <label><span>Nombre de la cuenta</span><input name="name" required autoFocus placeholder="Ej. Banco Mercantil" /></label>
              <label><span>Tipo</span><select name="kind" defaultValue="bank"><option value="bank">Cuenta bancaria</option><option value="savings">Cuenta de ahorros</option><option value="cash">Efectivo</option></select></label>
              <label><span>Saldo actual</span><div className="money-field"><span>Bs</span><input type="number" name="amount" min="0" step="0.01" defaultValue="0.00" required /></div></label>
            </>}

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions"><button type="button" className="secondary-action" onClick={onClose}>Cancelar</button><button type="submit" className="primary-action" disabled={saving}>{saving ? "Guardando\u2026" : copy.submit}</button></div>
        </form>
      </section>
    </div>;
}
function MoneyInput({ label = "Monto" }) {
  return <label><span>{label}</span><div className="money-field"><span>Bs</span><input type="number" name="amount" min="0.01" step="0.01" placeholder="0.00" required /></div></label>;
}
export {
  SavingsApp
};
