const express = require("express");
const cors = require("cors");
const path = require("path");
const { readDb, writeDb, genId, DB_FILE } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Simple optional access code protection.
// Set ACCESS_CODE in Railway env vars to require it; leave unset to disable.
app.use("/api", (req, res, next) => {
  const required = process.env.ACCESS_CODE;
  if (!required) return next();
  const supplied = req.header("x-access-code");
  if (supplied === required) return next();
  return res.status(401).json({ error: "unauthorized" });
});

const COLLECTIONS = ["trades", "income", "goals", "journal", "habits"];

// ---- Generic CRUD for each collection ----
COLLECTIONS.forEach((name) => {
  // list
  app.get(`/api/${name}`, (req, res) => {
    const db = readDb();
    res.json(db[name]);
  });

  // create
  app.post(`/api/${name}`, (req, res) => {
    const db = readDb();
    const item = { id: genId(), createdAt: new Date().toISOString(), ...req.body };
    db[name].push(item);
    writeDb(db);
    res.status(201).json(item);
  });

  // update
  app.put(`/api/${name}/:id`, (req, res) => {
    const db = readDb();
    const idx = db[name].findIndex((x) => x.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "not found" });
    db[name][idx] = { ...db[name][idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeDb(db);
    res.json(db[name][idx]);
  });

  // delete
  app.delete(`/api/${name}/:id`, (req, res) => {
    const db = readDb();
    const before = db[name].length;
    db[name] = db[name].filter((x) => x.id !== req.params.id);
    writeDb(db);
    res.json({ deleted: before !== db[name].length });
  });
});

// ---- Summary / dashboard stats ----
app.get("/api/summary", (req, res) => {
  const db = readDb();

  const tradePnl = db.trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
  const wins = db.trades.filter((t) => Number(t.pnl) > 0).length;
  const losses = db.trades.filter((t) => Number(t.pnl) < 0).length;
  const winRate = db.trades.length ? Math.round((wins / db.trades.length) * 100) : 0;

  const byCategory = { trading: 0, business: 0, personal: 0 };
  db.income.forEach((i) => {
    const amt = Number(i.amount) || 0;
    const signed = i.type === "expense" ? -amt : amt;
    if (byCategory[i.category] !== undefined) byCategory[i.category] += signed;
  });

  const totalNet = byCategory.trading + byCategory.business + byCategory.personal + tradePnl;

  const goalsActive = db.goals.filter((g) => g.status !== "done").length;
  const goalsDone = db.goals.filter((g) => g.status === "done").length;

  const habitsDone = db.habits.filter((h) => h.done).length;
  const habitsTotal = db.habits.length;

  res.json({
    tradePnl,
    wins,
    losses,
    winRate,
    tradeCount: db.trades.length,
    byCategory,
    totalNet,
    goalsActive,
    goalsDone,
    journalCount: db.journal.length,
    habitsDone,
    habitsTotal,
  });
});

// ---- Smart AI assistant ----
// Builds a plain-text snapshot of the user's real logged data so the model
// answers from what's actually in the ledger instead of making things up.
function buildSnapshot(db) {
  const tradePnl = db.trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
  const wins = db.trades.filter((t) => Number(t.pnl) > 0).length;
  const losses = db.trades.filter((t) => Number(t.pnl) < 0).length;
  const winRate = db.trades.length ? Math.round((wins / db.trades.length) * 100) : 0;
  const recentTrades = [...db.trades]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8)
    .map((t) => `${t.date} ${t.symbol} ${t.side || ""} pnl=${t.pnl}${t.notes ? " note=" + t.notes : ""}`)
    .join("\n") || "none logged yet";

  const byCategory = { trading: 0, business: 0, personal: 0 };
  db.income.forEach((i) => {
    const amt = Number(i.amount) || 0;
    const signed = i.type === "expense" ? -amt : amt;
    if (byCategory[i.category] !== undefined) byCategory[i.category] += signed;
  });

  const goalsText = db.goals.length
    ? db.goals.map((g) => `${g.title} [${g.category}] ${g.current || 0}/${g.target}${g.unit || ""} (${g.status})`).join("\n")
    : "none set yet";

  const habitsText = db.habits.length
    ? db.habits.map((h) => `${h.done ? "[x]" : "[ ]"} ${h.label}`).join("\n")
    : "none set yet";

  const recentJournal = [...db.journal]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((j) => `${j.date} [${j.category}] ${j.title}: ${(j.content || "").slice(0, 200)}`)
    .join("\n") || "none logged yet";

  return `TRADING
- Total trade P&L: $${tradePnl}
- Win rate: ${winRate}% (${wins}W / ${losses}L, ${db.trades.length} trades)
- Recent trades:
${recentTrades}

INCOME (net by category)
- Trading: $${byCategory.trading}
- Business: $${byCategory.business}
- Personal: $${byCategory.personal}

GOALS
${goalsText}

DAILY HABITS
${habitsText}

RECENT JOURNAL
${recentJournal}`;
}

const AI_SYSTEM_PROMPT = `You are the "Smart AI" assistant embedded in Balloutt Trades, a personal
trading, business and life dashboard. You will be given the user's real logged
data (trades, income, goals, habits, journal) below their message. Answer
using that real data — be specific and reference actual numbers/entries when
relevant.

Hard rules:
- You do not have live market data, prices, or news. Never invent specific
  price levels, tickers' current prices, or market predictions. If asked for
  live market calls, say plainly that you don't have live data, and instead
  help them analyze patterns in their own trade history.
- Don't state or imply financial advice as a recommendation to buy/sell.
  You can offer observations, questions, and general risk-management
  principles, but frame these as things for the user to weigh, not directives.
- Keep replies concise (a few short paragraphs or a tight list), practical,
  and encouraging without being saccharine. Match the trader's tone: direct,
  no fluff.`;

async function callAI(message, db) {
  const provider =
    process.env.AI_PROVIDER ||
    (process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.DEEPSEEK_API_KEY ? "deepseek" : null);

  if (!provider) {
    return {
      connected: false,
      reply:
        "The AI assistant isn't connected yet. Add an ANTHROPIC_API_KEY (or DEEPSEEK_API_KEY) " +
        "in your Railway service's Variables tab, redeploy, and this chat will start answering for real.",
    };
  }

  const snapshot = buildSnapshot(db);
  const userContent = `${message}\n\n---\nCurrent logged data:\n${snapshot}`;

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: AI_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Anthropic API error (${res.status})`);
    const reply = (data.content || []).map((c) => c.text).filter(Boolean).join("\n");
    return { connected: true, provider: "anthropic", reply };
  }

  if (provider === "deepseek") {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        max_tokens: 600,
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `DeepSeek API error (${res.status})`);
    const reply = data.choices?.[0]?.message?.content || "";
    return { connected: true, provider: "deepseek", reply };
  }

  return { connected: false, reply: `Unknown AI_PROVIDER "${provider}". Use "anthropic" or "deepseek".` };
}

app.post("/api/ai/chat", async (req, res) => {
  const message = (req.body && req.body.message) || "";
  if (!message.trim()) return res.status(400).json({ error: "message is required" });
  try {
    const db = readDb();
    const result = await callAI(message.trim(), db);
    res.json(result);
  } catch (err) {
    console.error("AI chat error:", err);
    res.status(500).json({ connected: false, reply: `AI request failed: ${err.message}` });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true, dbFile: DB_FILE }));

// fallback to index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Ledger running on port ${PORT}`);
  console.log(`Data file: ${DB_FILE}`);
});
