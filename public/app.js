const state = {
  trades: [],
  income: [],
  goals: [],
  journal: [],
  habits: [],
  summary: {},
};

function accessHeaders() {
  const code = document.getElementById("access-code").value;
  return code ? { "x-access-code": code } : {};
}

// persist access code locally in-memory per session only (not localStorage,
// so it simply needs re-entering on reload — kept intentionally simple)

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...accessHeaders(), ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    alert("Access code required or incorrect.");
    throw new Error("unauthorized");
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function fmtMoney(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  return `${sign}$${Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ---------- Navigation ----------
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
  });
});

// ---------- Load all data ----------
async function loadAll() {
  const [trades, income, goals, journal, habits, summary] = await Promise.all([
    api("/trades"),
    api("/income"),
    api("/goals"),
    api("/journal"),
    api("/habits"),
    api("/summary"),
  ]);
  state.trades = trades;
  state.income = income;
  state.goals = goals;
  state.journal = journal;
  state.habits = habits;
  state.summary = summary;
  renderAll();
}

function renderAll() {
  renderTicker();
  renderDashboard();
  renderTrades();
  renderIncome();
  renderGoals();
  renderJournal("personal");
  renderJournal("business");
  renderHabits();
}

// ---------- Ticker ----------
function renderTicker() {
  const s = state.summary;
  const items = [
    `TOTAL NET ${s.totalNet >= 0 ? "▲" : "▼"} ${fmtMoney(s.totalNet)}`,
    `TRADE P&L ${fmtMoney(s.tradePnl)}`,
    `WIN RATE ${s.winRate || 0}%`,
    `TRADES LOGGED ${s.tradeCount || 0}`,
    `GOALS ACTIVE ${s.goalsActive || 0}`,
    `GOALS DONE ${s.goalsDone || 0}`,
    `HABITS ${s.habitsDone || 0}/${s.habitsTotal || 0}`,
  ];
  const el = document.getElementById("ticker");
  el.innerHTML = items
    .map((t) => {
      const cls = t.includes("▲") ? "up" : t.includes("▼") ? "down" : "";
      return `<span class="${cls}">${t}</span>`;
    })
    .join("") + items.map((t) => `<span>${t}</span>`).join(""); // duplicate for seamless loop
}

// ---------- Dashboard ----------
function renderDashboard() {
  const s = state.summary;
  const cards = [
    { label: "Total Net", value: fmtMoney(s.totalNet), cls: s.totalNet >= 0 ? "profit" : "loss" },
    { label: "Trading P&L", value: fmtMoney(s.tradePnl), cls: s.tradePnl >= 0 ? "profit" : "loss" },
    { label: "Win Rate", value: `${s.winRate || 0}%`, cls: "gold" },
    { label: "Business Net", value: fmtMoney(s.byCategory?.business), cls: (s.byCategory?.business || 0) >= 0 ? "profit" : "loss" },
    { label: "Personal Net", value: fmtMoney(s.byCategory?.personal), cls: (s.byCategory?.personal || 0) >= 0 ? "profit" : "loss" },
    { label: "Active Goals", value: s.goalsActive || 0, cls: "gold" },
  ];
  document.getElementById("summary-cards").innerHTML = cards
    .map((c) => `<div class="card"><div class="label">${c.label}</div><div class="value ${c.cls}">${c.value}</div></div>`)
    .join("");

  const recentTrades = [...state.trades].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  document.getElementById("recent-trades").innerHTML = recentTrades.length
    ? recentTrades.map((t) => `
      <div class="list-item">
        <span>${t.symbol} <span class="meta">· ${fmtDate(t.date)}</span></span>
        <span class="${Number(t.pnl) >= 0 ? "profit" : "loss"}" style="font-family:var(--font-mono)">${fmtMoney(t.pnl)}</span>
      </div>`).join("")
    : `<div class="empty">No trades logged yet.</div>`;

  const activeGoals = state.goals.filter((g) => g.status === "active").slice(0, 5);
  document.getElementById("dash-goals").innerHTML = activeGoals.length
    ? activeGoals.map((g) => {
        const pct = g.target ? Math.min(100, Math.round((Number(g.current) / Number(g.target)) * 100)) : 0;
        return `<div class="list-item"><span>${g.title}</span><span class="meta">${pct}%</span></div>`;
      }).join("")
    : `<div class="empty">No active goals.</div>`;

  const recentJournal = [...state.journal].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  document.getElementById("dash-journal").innerHTML = recentJournal.length
    ? recentJournal.map((j) => `<div class="list-item"><span>${j.title} <span class="meta">· ${j.category}</span></span><span class="meta">${fmtDate(j.date)}</span></div>`).join("")
    : `<div class="empty">No journal entries yet.</div>`;
}

// ---------- Generic form handling ----------
function setupForm(formId, collection, onSaved) {
  const form = document.getElementById(formId);
  const cancelBtn = form.querySelector(".btn-cancel");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const id = data.id;
    delete data.id;
    try {
      if (id) {
        await api(`/${collection}/${id}`, { method: "PUT", body: JSON.stringify(data) });
      } else {
        await api(`/${collection}`, { method: "POST", body: JSON.stringify(data) });
      }
      form.reset();
      form.querySelector('[name="id"]').value = "";
      cancelBtn.style.display = "none";
      await loadAll();
      if (onSaved) onSaved();
    } catch (err) {
      alert("Could not save: " + err.message);
    }
  });

  cancelBtn.addEventListener("click", () => {
    form.reset();
    form.querySelector('[name="id"]').value = "";
    cancelBtn.style.display = "none";
  });
}

function fillFormForEdit(formId, item) {
  const form = document.getElementById(formId);
  Object.keys(item).forEach((key) => {
    const field = form.querySelector(`[name="${key}"]`);
    if (field) field.value = item[key];
  });
  form.querySelector(".btn-cancel").style.display = "inline-block";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteItem(collection, id) {
  if (!confirm("Delete this entry?")) return;
  await api(`/${collection}/${id}`, { method: "DELETE" });
  await loadAll();
}

// ---------- Trades ----------
setupForm("form-trades", "trades");
function renderTrades() {
  const rows = [...state.trades].sort((a, b) => new Date(b.date) - new Date(a.date));
  document.querySelector("#table-trades tbody").innerHTML = rows.length
    ? rows.map((t) => `
      <tr>
        <td>${fmtDate(t.date)}</td>
        <td>${t.symbol}</td>
        <td>${t.side || ""}</td>
        <td class="num">${t.size ?? ""}</td>
        <td class="num">${t.entry ?? ""}</td>
        <td class="num">${t.exit ?? ""}</td>
        <td class="num ${Number(t.pnl) >= 0 ? "profit" : "loss"}">${fmtMoney(t.pnl)}</td>
        <td>${t.notes || ""}</td>
        <td class="row-actions">
          <button onclick='editTrade("${t.id}")'>Edit</button>
          <button onclick='deleteItem("trades","${t.id}")'>Delete</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="9" class="empty">No trades yet — log your first one above.</td></tr>`;
}
window.editTrade = (id) => fillFormForEdit("form-trades", state.trades.find((t) => t.id === id));

// ---------- Income ----------
setupForm("form-income", "income");
function renderIncome() {
  const rows = [...state.income].sort((a, b) => new Date(b.date) - new Date(a.date));
  document.querySelector("#table-income tbody").innerHTML = rows.length
    ? rows.map((i) => `
      <tr>
        <td>${fmtDate(i.date)}</td>
        <td>${i.category}</td>
        <td>${i.type}</td>
        <td class="num ${i.type === "expense" ? "loss" : "profit"}">${i.type === "expense" ? "-" : ""}${fmtMoney(i.amount)}</td>
        <td>${i.source || ""}</td>
        <td>${i.notes || ""}</td>
        <td class="row-actions">
          <button onclick='editIncome("${i.id}")'>Edit</button>
          <button onclick='deleteItem("income","${i.id}")'>Delete</button>
        </td>
      </tr>`).join("")
    : `<tr><td colspan="7" class="empty">No income or expenses logged yet.</td></tr>`;
}
window.editIncome = (id) => fillFormForEdit("form-income", state.income.find((i) => i.id === id));

// ---------- Goals ----------
setupForm("form-goals", "goals");
function renderGoals() {
  const container = document.getElementById("goal-cards");
  if (!state.goals.length) {
    container.innerHTML = `<div class="empty">No goals yet — set your first target above.</div>`;
    return;
  }
  container.innerHTML = state.goals.map((g) => {
    const pct = g.target ? Math.min(100, Math.max(0, Math.round((Number(g.current) / Number(g.target)) * 100))) : 0;
    return `
      <div class="goal-card">
        <span class="cat">${g.category}${g.status && g.status !== "active" ? " · " + g.status : ""}</span>
        <h3>${g.title}</h3>
        <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${pct}%"></div></div>
        <div class="goal-meta"><span>${g.current || 0}${g.unit || ""} / ${g.target}${g.unit || ""}</span><span>${pct}%</span></div>
        ${g.deadline ? `<div class="goal-meta"><span>Deadline</span><span>${fmtDate(g.deadline)}</span></div>` : ""}
        ${g.notes ? `<div class="notes">${g.notes}</div>` : ""}
        <div class="row-actions">
          <button onclick='editGoal("${g.id}")'>Edit</button>
          <button onclick='deleteItem("goals","${g.id}")'>Delete</button>
        </div>
      </div>`;
  }).join("");
}
window.editGoal = (id) => fillFormForEdit("form-goals", state.goals.find((g) => g.id === id));

// ---------- Journal (personal / business) ----------
setupForm("form-personal", "journal");
setupForm("form-business", "journal");

function renderJournal(category) {
  const rows = state.journal.filter((j) => j.category === category).sort((a, b) => new Date(b.date) - new Date(a.date));
  const el = document.getElementById(`list-${category}`);
  el.innerHTML = rows.length
    ? rows.map((j) => `
      <div class="list-item" style="flex-direction:column; align-items:stretch; gap:6px;">
        <div style="display:flex; justify-content:space-between;">
          <strong>${j.title}</strong>
          <span class="meta">${fmtDate(j.date)}</span>
        </div>
        <div style="color:var(--text-muted); font-size:13px;">${(j.content || "").replace(/</g, "&lt;")}</div>
        <div class="row-actions">
          <button onclick='editJournal("${j.id}","${category}")'>Edit</button>
          <button onclick='deleteItem("journal","${j.id}")'>Delete</button>
        </div>
      </div>`).join("")
    : `<div class="empty">No entries yet.</div>`;
}
window.editJournal = (id, category) => {
  const item = state.journal.find((j) => j.id === id);
  fillFormForEdit(`form-${category}`, item);
};

window.deleteItem = deleteItem;

// ---------- Habits ----------
setupForm("form-habits", "habits");

function renderHabits() {
  const el = document.getElementById("habit-list");
  el.innerHTML = state.habits.length
    ? state.habits.map((h) => `
      <div class="habit-row">
        <input type="checkbox" ${h.done ? "checked" : ""} onchange='toggleHabit("${h.id}", this.checked)' />
        <span class="habit-label ${h.done ? "done" : ""}">${h.label}</span>
        <button onclick='deleteItem("habits","${h.id}")'>Delete</button>
      </div>`).join("")
    : `<div class="empty">No habits yet — add your first routine above.</div>`;
}

async function toggleHabit(id, done) {
  await api(`/habits/${id}`, { method: "PUT", body: JSON.stringify({ done }) });
  await loadAll();
}
window.toggleHabit = toggleHabit;

document.getElementById("reset-habits-btn").addEventListener("click", async () => {
  if (!state.habits.length) return;
  if (!confirm("Reset all habits back to unchecked for a new day?")) return;
  await Promise.all(state.habits.map((h) => api(`/habits/${h.id}`, { method: "PUT", body: JSON.stringify({ done: false }) })));
  await loadAll();
});

// ---------- Smart AI chat ----------
const chatBox = document.getElementById("chat-box");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

function appendChatLine(text, cls) {
  const div = document.createElement("div");
  div.className = `chat-line ${cls}`;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function askAI(message) {
  appendChatLine(message, "user");
  const thinking = document.createElement("div");
  thinking.className = "chat-line bot";
  thinking.textContent = "…";
  chatBox.appendChild(thinking);
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...accessHeaders() },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    thinking.remove();
    appendChatLine(data.reply || "(no reply)", data.connected ? "bot" : "error");
  } catch (err) {
    thinking.remove();
    appendChatLine("Couldn't reach the AI: " + err.message, "error");
  }
}

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;
  chatInput.value = "";
  askAI(msg);
});

document.querySelectorAll(".quick-ask").forEach((btn) => {
  btn.addEventListener("click", () => askAI(btn.dataset.prompt));
});

// ---------- Init ----------
loadAll().catch((e) => console.error(e));
