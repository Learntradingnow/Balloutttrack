const fs = require("fs");
const path = require("path");

// Prefer a mounted Railway volume at /data if it exists, otherwise fall
// back to a local ./data folder (used for local dev / first boot).
const DATA_DIR = fs.existsSync("/data") ? "/data" : path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const DEFAULT_DB = {
  trades: [],      // trading activity: date, symbol, side, entry, exit, size, pnl, notes
  income: [],      // any income/expense entry: date, category(trading|business|personal), type(income|expense), amount, source, notes
  goals: [],       // title, category(trading|business|personal), target, current, unit, deadline, status, notes
  journal: [],     // date, category(personal|business), title, content
  habits: []       // label, done (bool), streak (number)
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw);
    // guard against missing keys if schema grows later
    return { ...DEFAULT_DB, ...parsed };
  } catch (e) {
    console.error("DB parse error, resetting to default:", e);
    return { ...DEFAULT_DB };
  }
}

function writeDb(data) {
  ensureDb();
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic on same filesystem
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = { readDb, writeDb, genId, DB_FILE, DATA_DIR };
