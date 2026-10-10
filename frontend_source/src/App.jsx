import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Pencil, Trash2, ChevronLeft, ChevronRight, X, Check, Target, Download, Upload,
  Sun, Moon, Copy, ArrowUp, ArrowDown, SlidersHorizontal, Repeat, Wallet, Search, Tag,
  Share2, FileSpreadsheet, AlertTriangle, PartyPopper, Lightbulb, LogOut, Undo2, ShieldCheck,
} from "lucide-react";
import Auth, { ResetPasswordScreen } from "./Auth";
import { api } from "./api";
import { LockScreen, LockSettings, isLockEnabled, disableLock } from "./AppLock";

const LIGHT = {
  paper: "#F7F4EE", card: "#FFFFFF", ink: "#2B2A27", inkSoft: "#635E56", line: "#E5DFD3",
  sage: "#3F5E48", sageSoft: "#E7EEE6", clay: "#96432B", claySoft: "#F6E7E0",
  warn: "#8A6413", warnSoft: "#F3E8D2", focus: "#2F6FDB", overlay: "rgba(43,42,39,0.45)",
};
const DARK = {
  paper: "#1E1C18", card: "#28251F", ink: "#F2EFE9", inkSoft: "#B7B0A3", line: "#3C3830",
  sage: "#8CC39A", sageSoft: "#2A3B2E", clay: "#E39B7C", claySoft: "#3E2C24",
  warn: "#E3C270", warnSoft: "#3B3221", focus: "#7FB0FF", overlay: "rgba(0,0,0,0.6)",
};
const FONTS = {
  displayFont: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
  bodyFont: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
};
const CATEGORY_COLORS = {
  Food: "#B0583C", Transport: "#5C87A0", Housing: "#7C8351", Utilities: "#B08A34", Shopping: "#846685",
  Health: "#4C7259", Entertainment: "#93683F", Education: "#5D7690", Other: "#847D70",
  Salary: "#4C7259", Freelance: "#5C87A0", Gift: "#846685", Investment: "#7C8351",
};
const FALLBACK_PALETTE = Object.values(CATEGORY_COLORS);
function categoryColor(name) {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}
const REPEAT_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];
const MILESTONE_THRESHOLDS = [10, 50, 100, 250, 500];
const UNDO_WINDOW_MS = 5000;

function buildGlobalStyles(C) {
  return `
    .ft-focus:focus-visible { outline: 2px solid ${C.focus}; outline-offset: 2px; border-radius: 6px; }
    .ft-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    @keyframes ft-pulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
    .ft-skeleton { animation: ft-pulse 1.6s ease-in-out infinite; background: ${C.line}; border-radius: 8px; }
  `;
}

// ---------- helpers ----------
function toISODate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function startOfWeek(d) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}
function getRange(view, refDate) {
  const d = new Date(refDate);
  d.setHours(0, 0, 0, 0);
  if (view === "daily") return { start: d, end: d };
  if (view === "weekly") {
    const start = startOfWeek(d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start, end };
}
function shiftRef(view, refDate, dir) {
  const d = new Date(refDate);
  if (view === "daily") d.setDate(d.getDate() + dir);
  else if (view === "weekly") d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  return d;
}
function rangeLabel(view, refDate) {
  const { start, end } = getRange(view, refDate);
  const dOpts = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
  if (view === "daily") return start.toLocaleDateString("en-IN", dOpts);
  if (view === "weekly") {
    const sameMonth = start.getMonth() === end.getMonth();
    const s = start.toLocaleDateString("en-IN", { day: "numeric", month: sameMonth ? undefined : "short" });
    const e = end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    return `${s} \u2013 ${e}`;
  }
  return start.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
function fmtMoney(n) {
  return Number(n).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}
function fmtEntryDate(iso) {
  return parseISODate(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function buildTrendMonths(entries, now) {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), date: d, income: 0, expense: 0 });
  }
  const map = Object.fromEntries(months.map((m) => [m.key, m]));
  entries.forEach((e) => {
    const key = monthKey(parseISODate(e.date));
    if (map[key]) {
      if (e.type === "income") map[key].income += Number(e.amount);
      else map[key].expense += Number(e.amount);
    }
  });
  return months.map((m) => ({ ...m, net: m.income - m.expense }));
}
function budgetState(spent, limit) {
  if (!limit || limit <= 0) return null;
  const pct = spent / limit;
  if (pct >= 1) return "over";
  if (pct >= 0.8) return "warn";
  return "ok";
}
function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function entriesToCSV(entries, accounts) {
  const accName = (id) => accounts.find((a) => a.id === id)?.name || "";
  const header = ["Date", "Type", "Category", "Amount", "Note", "Account", "Recurring"];
  const rows = entries.map((e) => [`'${e.date}`, e.type, e.category, e.amount, e.note || "", accName(e.accountId), e.recurring || ""]);
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}
function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function emptyForm(accountId, defaultCategory) {
  return { type: "expense", date: toISODate(new Date()), amount: "", category: defaultCategory || "", note: "", repeat: "none", accountId: accountId ?? "" };
}

// ============================================================
export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [locked, setLocked] = useState(false);

  // A password-reset email link lands here as ?reset_uid=...&reset_token=...
  const resetParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get("reset_uid");
    const token = params.get("reset_token");
    return uid && token ? { uid, token } : null;
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("tally-session");
    if (raw) {
      try {
        setSession(JSON.parse(raw));
        setLocked(isLockEnabled());
      } catch (e) {
        /* ignore */
      }
    }
    setBooting(false);
  }, []);

  // Re-lock whenever the app is backgrounded (switch apps, lock the phone,
  // etc.), so returning to it always shows the lock screen again rather
  // than only locking once per cold start.
  useEffect(() => {
    function onVisibility() {
      if (document.hidden && isLockEnabled()) setLocked(true);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function handleAuthed(result) {
    const next = { token: result.token, name: result.name, email: result.email };
    localStorage.setItem("tally-session", JSON.stringify(next));
    setSession(next);
    setLocked(isLockEnabled());
  }
  function handleLogout() {
    localStorage.removeItem("tally-session");
    setSession(null);
  }
  function clearResetParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete("reset_uid");
    url.searchParams.delete("reset_token");
    window.history.replaceState({}, "", url.toString());
  }

  if (booting) return null;

  if (resetParams) {
    return (
      <ResetPasswordScreen
        uid={resetParams.uid}
        token={resetParams.token}
        onDone={(result) => {
          clearResetParams();
          handleAuthed(result);
        }}
      />
    );
  }

  if (!session) return <Auth onAuthed={handleAuthed} />;
  if (locked) {
    return (
      <LockScreen
        onUnlock={() => setLocked(false)}
        onForgot={() => {
          disableLock();
          setLocked(false);
          handleLogout();
        }}
      />
    );
  }
  return <Tracker session={session} onLogout={handleLogout} onNameChange={(name) => setSession((s) => ({ ...s, name }))} />;
}

// ============================================================
function Tracker({ session, onLogout, onNameChange }) {
  const { token } = session;
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categoryLists, setCategoryLists] = useState({ expense: [], income: [] });
  const [categoryIds, setCategoryIds] = useState({}); // name -> id
  const [budgets, setBudgets] = useState({}); // category -> limit
  const [budgetIds, setBudgetIds] = useState({}); // category -> budget id
  const [goal, setGoal] = useState({ name: "Emergency Fund", target: 50000 });
  const [mode, setMode] = useState("light");
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());

  const [notifStatus, setNotifStatus] = useState("default"); // default | granted | denied | unsupported
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifError, setNotifError] = useState("");

  const C = mode === "dark" ? DARK : LIGHT;
  const now = useMemo(() => new Date(), []);

  // Register the service worker once on load — it's what lets a push
  // notification arrive even when the app isn't open. Subscribing to actual
  // pushes only happens when the user taps "Enable" (handleEnableNotifications).
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNotifStatus("unsupported");
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (typeof Notification !== "undefined") {
      setNotifStatus(Notification.permission === "granted" ? "granted" : "default");
      if (Notification.permission === "granted") resubscribePush();
    }
  }, []);

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  async function resubscribePush() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const { publicKey } = await api.getVapidPublicKey(token);
      if (!publicKey) return; // backend has no VAPID keys configured yet
      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const json = sub.toJSON();
      await api.subscribePush(token, { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
    } catch (e) {
      // Non-fatal — the in-app banner still works even if push setup fails.
    }
  }

  // Stop notifications to this browser before logging out, so budget amounts
  // don't keep appearing on a phone that's no longer signed in.
  async function handleLogoutClick() {
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await api.unsubscribePush(token, sub.endpoint);
          await sub.unsubscribe();
        }
      }
    } catch (e) {
      // Don't block logging out if this cleanup fails.
    }
    onLogout();
  }

  async function handleEnableNotifications() {
    setNotifBusy(true);
    setNotifError("");
    try {
      const permission = await Notification.requestPermission();
      setNotifStatus(permission);
      if (permission === "granted") {
        await resubscribePush();
      } else if (permission === "denied") {
        setNotifError("Notifications are blocked for this site in your browser settings.");
      }
    } catch (e) {
      setNotifError("Couldn't enable notifications on this device.");
    } finally {
      setNotifBusy(false);
    }
  }

  async function loadAll() {
    setLoadError("");
    try {
      const [accs, cats, ents, buds, g, prefs] = await Promise.all([
        api.listAccounts(token), api.listCategories(token), api.listEntries(token),
        api.listBudgets(token), api.getGoal(token), api.getPreferences(token),
      ]);
      setAccounts(accs);
      const catLists = { expense: [], income: [] };
      const catIds = {};
      cats.forEach((c) => { catLists[c.type].push(c.name); catIds[c.name] = c.id; });
      setCategoryLists(catLists);
      setCategoryIds(catIds);
      setEntries(ents.map((e) => ({ ...e, accountId: e.account })));
      const budMap = {}, budIdMap = {};
      buds.forEach((b) => { budMap[b.category] = Number(b.monthly_limit); budIdMap[b.category] = b.id; });
      setBudgets(budMap);
      setBudgetIds(budIdMap);
      setGoal({ name: g.name, target: Number(g.target) });
      setMode(prefs.theme || "light");
      setDismissedAlerts(new Set(prefs.dismissed_alerts || []));
    } catch (err) {
      setLoadError(err.message || "Could not load your data.");
    } finally {
      setReady(true);
    }
  }
  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  async function persistPreferences(next) {
    try { await api.setPreferences(token, next); } catch (e) { /* non-fatal */ }
  }
  async function toggleMode() {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    persistPreferences({ theme: next, dismissed_alerts: [...dismissedAlerts] });
  }
  function dismissAlert(id) {
    const next = new Set(dismissedAlerts);
    next.add(id);
    setDismissedAlerts(next);
    persistPreferences({ theme: mode, dismissed_alerts: [...next] });
  }

  // ---------- accounts ----------
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [editingAccounts, setEditingAccounts] = useState(false);
  const [accountForm, setAccountForm] = useState([]);
  const [accountError, setAccountError] = useState("");

  function openAccountsEdit() {
    setAccountForm(accounts.map((a) => ({ ...a, isNew: false })));
    setAccountError("");
    setEditingAccounts(true);
  }
  function addAccountRow() {
    setAccountForm((f) => [...f, { id: `new-${Date.now()}`, name: "", isNew: true }]);
  }
  function updateAccountName(id, name) {
    setAccountForm((f) => f.map((a) => (a.id === id ? { ...a, name } : a)));
  }
  function removeAccountRow(id) {
    setAccountForm((f) => f.filter((a) => a.id !== id));
  }
  async function submitAccounts() {
    const cleaned = accountForm.map((a) => ({ ...a, name: a.name.trim() }));
    if (cleaned.length === 0) return setAccountError("You need at least one account.");
    if (cleaned.some((a) => !a.name)) return setAccountError("Account names can't be empty.");
    const names = cleaned.map((a) => a.name.toLowerCase());
    if (new Set(names).size !== names.length) return setAccountError("Account names must be unique.");
    const removed = accounts.filter((a) => !cleaned.some((c) => c.id === a.id));
    try {
      for (const r of removed) await api.deleteAccount(token, r.id);
      for (const a of cleaned) {
        if (a.isNew) await api.createAccount(token, a.name);
        else {
          const orig = accounts.find((o) => o.id === a.id);
          if (orig && orig.name !== a.name) await api.updateAccount(token, a.id, a.name);
        }
      }
      const fresh = await api.listAccounts(token);
      setAccounts(fresh);
      if (selectedAccountId !== "all" && !fresh.some((a) => a.id === selectedAccountId)) setSelectedAccountId("all");
      setEditingAccounts(false);
      setAccountError("");
    } catch (err) {
      setAccountError(err.message || "Could not save accounts.");
    }
  }

  // ---------- categories (immediate persist — fixes the "not selectable" bug) ----------
  const [editingCategories, setEditingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState({ expense: "", income: "" });
  const [categoryError, setCategoryError] = useState("");

  function openCategoriesEdit() {
    setNewCategoryName({ expense: "", income: "" });
    setCategoryError("");
    setEditingCategories(true);
  }
  async function addCategory(type) {
    const name = newCategoryName[type].trim();
    if (!name) return;
    if (categoryLists[type].some((c) => c.toLowerCase() === name.toLowerCase())) {
      setCategoryError(`"${name}" already exists.`);
      return;
    }
    try {
      const created = await api.createCategory(token, type, name);
      setCategoryLists((cl) => ({ ...cl, [type]: [...cl[type], name] }));
      setCategoryIds((ci) => ({ ...ci, [name]: created.id }));
      setNewCategoryName((n) => ({ ...n, [type]: "" }));
      setCategoryError("");
    } catch (err) {
      setCategoryError(err.message || "Could not add category.");
    }
  }
  async function removeCategory(type, name) {
    if (categoryLists[type].length <= 1) return setCategoryError("Each type needs at least one category.");
    try {
      await api.deleteCategory(token, categoryIds[name]);
      setCategoryLists((cl) => ({ ...cl, [type]: cl[type].filter((c) => c !== name) }));
    } catch (err) {
      setCategoryError(err.message || "Could not remove category.");
    }
  }

  // ---------- budgets ----------
  const [editingBudgets, setEditingBudgets] = useState(false);
  const [budgetForm, setBudgetForm] = useState({});
  function openBudgetsEdit() {
    const f = {};
    categoryLists.expense.forEach((c) => { f[c] = budgets[c] ? String(budgets[c]) : ""; });
    setBudgetForm(f);
    setEditingBudgets(true);
  }
  async function submitBudgets() {
    const nextAmounts = { ...budgets };
    const nextIds = { ...budgetIds };
    for (const [cat, val] of Object.entries(budgetForm)) {
      const n = parseFloat(val);
      if (n > 0) {
        const saved = await api.setBudget(token, cat, n);
        nextAmounts[cat] = n;
        nextIds[cat] = saved.id;
      } else if (budgetIds[cat]) {
        await api.deleteBudget(token, budgetIds[cat]);
        delete nextAmounts[cat];
        delete nextIds[cat];
      }
    }
    setBudgets(nextAmounts);
    setBudgetIds(nextIds);
    setEditingBudgets(false);
  }

  // ---------- goal ----------
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalForm, setGoalForm] = useState({ name: goal.name, target: String(goal.target) });
  const [goalError, setGoalError] = useState("");
  function openGoalEdit() {
    setGoalForm({ name: goal.name, target: String(goal.target) });
    setGoalError("");
    setEditingGoal(true);
  }
  async function submitGoal() {
    const target = parseFloat(goalForm.target);
    if (!goalForm.name.trim()) return setGoalError("Give the goal a name.");
    if (!target || target <= 0) return setGoalError("Enter a target amount greater than zero.");
    const saved = await api.setGoal(token, { name: goalForm.name.trim(), target });
    setGoal({ name: saved.name, target: Number(saved.target) });
    setEditingGoal(false);
  }

  // ---------- user name ----------
  const [renamingUser, setRenamingUser] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.name);
  async function submitName() {
    const name = nameDraft.trim();
    if (!name) return;
    await api.updateMe(token, name);
    onNameChange(name);
    const stored = JSON.parse(localStorage.getItem("tally-session") || "{}");
    localStorage.setItem("tally-session", JSON.stringify({ ...stored, name }));
    setRenamingUser(false);
  }

  // ---------- period / scoping ----------
  const [view, setView] = useState("daily");
  const [refDate, setRefDate] = useState(new Date());
  const { start, end } = useMemo(() => getRange(view, refDate), [view, refDate]);
  const scopedEntries = useMemo(
    () => (selectedAccountId === "all" ? entries : entries.filter((e) => e.accountId === selectedAccountId)),
    [entries, selectedAccountId]
  );
  const periodEntries = useMemo(
    () => scopedEntries.filter((e) => { const d = parseISODate(e.date); return d >= start && d <= end; })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [scopedEntries, start, end]
  );

  // ---------- search & filter ----------
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const displayEntries = useMemo(() => {
    const min = parseFloat(amountMin), max = parseFloat(amountMax);
    return periodEntries.filter((e) => {
      if (filterType !== "all" && e.type !== filterType) return false;
      if (filterCategory !== "all" && e.category !== filterCategory) return false;
      if (!isNaN(min) && Number(e.amount) < min) return false;
      if (!isNaN(max) && Number(e.amount) > max) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        if (!`${e.note || ""} ${e.category}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [periodEntries, searchText, filterType, filterCategory, amountMin, amountMax]);
  const filtersActive = searchText.trim() || filterType !== "all" || filterCategory !== "all" || amountMin || amountMax;
  function clearFilters() { setSearchText(""); setFilterType("all"); setFilterCategory("all"); setAmountMin(""); setAmountMax(""); }

  const totalIn = periodEntries.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const totalOut = periodEntries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const net = totalIn - totalOut;
  const allTimeBalance = useMemo(() => scopedEntries.reduce((s, e) => s + (e.type === "income" ? Number(e.amount) : -Number(e.amount)), 0), [scopedEntries]);
  const allTimeIn = useMemo(() => scopedEntries.filter((e) => e.type === "income").reduce((s, e) => s + Number(e.amount), 0), [scopedEntries]);
  const allTimeOut = useMemo(() => scopedEntries.filter((e) => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0), [scopedEntries]);
  const globalBalance = useMemo(() => entries.reduce((s, e) => s + (e.type === "income" ? Number(e.amount) : -Number(e.amount)), 0), [entries]);
  const goalPct = goal.target > 0 ? Math.round(Math.min(Math.max(globalBalance / goal.target, 0), 1) * 100) : 0;
  const goalRemaining = Math.max(goal.target - globalBalance, 0);
  const goalReached = globalBalance >= goal.target;

  const categoryTotals = useMemo(() => {
    const map = {};
    periodEntries.filter((e) => e.type === "expense").forEach((e) => { map[e.category] = (map[e.category] || 0) + Number(e.amount); });
    return Object.entries(map).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  }, [periodEntries]);
  const maxCategory = categoryTotals.length ? categoryTotals[0].amount : 0;

  const currentMonthSpend = useMemo(() => {
    const key = monthKey(now), map = {};
    entries.forEach((e) => { if (e.type === "expense" && monthKey(parseISODate(e.date)) === key) map[e.category] = (map[e.category] || 0) + Number(e.amount); });
    return map;
  }, [entries, now]);
  const lastMonthSpend = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1), key = monthKey(d), map = {};
    entries.forEach((e) => { if (e.type === "expense" && monthKey(parseISODate(e.date)) === key) map[e.category] = (map[e.category] || 0) + Number(e.amount); });
    return map;
  }, [entries, now]);
  const budgetRows = categoryLists.expense.filter((c) => budgets[c] > 0).map((c) => ({
    category: c, limit: budgets[c], spent: currentMonthSpend[c] || 0, state: budgetState(currentMonthSpend[c] || 0, budgets[c]),
  }));

  const trendMonths = useMemo(() => buildTrendMonths(entries, now), [entries, now]);
  const trendMax = Math.max(1, ...trendMonths.map((m) => Math.max(m.income, m.expense)));
  const thisMonth = trendMonths[trendMonths.length - 1];
  const lastMonthTrend = trendMonths[trendMonths.length - 2];
  const netDelta = thisMonth.net - lastMonthTrend.net;
  const netDeltaPct = lastMonthTrend.net !== 0 ? Math.round((netDelta / Math.abs(lastMonthTrend.net)) * 100) : null;

  const insights = useMemo(() => {
    const list = [];
    if (thisMonth.income > 0) list.push(`You're saving ${Math.round((thisMonth.net / thisMonth.income) * 100)}% of your income this month.`);
    let topMover = null;
    new Set([...Object.keys(currentMonthSpend), ...Object.keys(lastMonthSpend)]).forEach((cat) => {
      const cur = currentMonthSpend[cat] || 0, prev = lastMonthSpend[cat] || 0, delta = cur - prev;
      if (prev > 0 && (!topMover || Math.abs(delta) > Math.abs(topMover.delta))) topMover = { cat, delta, prev };
    });
    if (topMover && topMover.delta !== 0) {
      const pct = Math.round((Math.abs(topMover.delta) / topMover.prev) * 100);
      list.push(topMover.delta > 0
        ? `${topMover.cat} spending is up ${pct}% vs last month (${fmtMoney(topMover.delta)} more).`
        : `${topMover.cat} spending is down ${pct}% vs last month — nice work.`);
    }
    if (periodEntries.length > 0) {
      const biggest = [...periodEntries].sort((a, b) => b.amount - a.amount)[0];
      list.push(`Your largest entry this period was ${fmtMoney(biggest.amount)} on ${biggest.category}${biggest.note ? ` (${biggest.note})` : ""}.`);
    }
    const recentMonths = trendMonths.slice(-3);
    const avgNet = recentMonths.reduce((s, m) => s + m.net, 0) / recentMonths.length;
    if (!goalReached && avgNet > 0) {
      const months = Math.ceil(goalRemaining / avgNet);
      if (months > 0 && months < 240) list.push(`At your recent savings pace, you're about ${months} ${months === 1 ? "month" : "months"} from reaching "${goal.name}".`);
    }
    return list.slice(0, 4);
  }, [thisMonth, currentMonthSpend, lastMonthSpend, periodEntries, trendMonths, goalReached, goalRemaining, goal.name]);

  const alerts = useMemo(() => {
    const list = [];
    if (goalReached) list.push({ id: `goal-reached-${goal.name}`, level: "success", text: `Goal reached: "${goal.name}" is fully funded!` });
    budgetRows.forEach((b) => {
      if (b.state === "over") list.push({ id: `budget-${b.category}-${monthKey(now)}-over`, level: "danger", text: `${b.category} budget exceeded by ${fmtMoney(b.spent - b.limit)} this month.` });
      else if (b.state === "warn") list.push({ id: `budget-${b.category}-${monthKey(now)}-warn`, level: "warning", text: `${b.category} budget is at ${Math.round((b.spent / b.limit) * 100)}% for this month.` });
    });
    const crossed = MILESTONE_THRESHOLDS.filter((t) => entries.length >= t);
    if (crossed.length) list.push({ id: `milestone-entries-${crossed[crossed.length - 1]}`, level: "success", text: `Milestone: you've logged ${crossed[crossed.length - 1]}+ entries!` });
    return list.filter((a) => !dismissedAlerts.has(a.id));
  }, [goalReached, goal.name, budgetRows, now, entries.length, dismissedAlerts]);

  // ---------- entry form ----------
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingRecurring, setEditingRecurring] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [submittingForm, setSubmittingForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  function openAdd() {
    const accId = selectedAccountId !== "all" ? selectedAccountId : accounts[0]?.id;
    setForm(emptyForm(accId, categoryLists.expense[0]));
    setEditingId(null); setEditingRecurring(null); setFormError(""); setShowForm(true);
  }
  function openEdit(entry) {
    setForm({ type: entry.type, date: entry.date, amount: String(entry.amount), category: entry.category, note: entry.note || "", repeat: "none", accountId: entry.accountId });
    setEditingId(entry.id); setEditingRecurring(entry.recurring || null); setFormError(""); setShowForm(true);
  }
  function openDuplicate(entry) {
    setForm({ type: entry.type, date: toISODate(new Date()), amount: String(entry.amount), category: entry.category, note: entry.note || "", repeat: "none", accountId: entry.accountId });
    setEditingId(null); setEditingRecurring(null); setFormError(""); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditingId(null); setEditingRecurring(null); setFormError(""); }
  function onTypeChange(type) { setForm((f) => ({ ...f, type, category: categoryLists[type][0] || "" })); }

  async function submitForm() {
    const amt = parseFloat(form.amount);
    if (!form.date) return setFormError("Pick a date.");
    if (!amt || amt <= 0) return setFormError("Enter an amount greater than zero.");
    if (!form.accountId) return setFormError("Choose an account.");
    setFormError("");
    setSubmittingForm(true);
    try {
      if (editingId) {
        const saved = await api.updateEntry(token, editingId, {
          account: form.accountId, type: form.type, date: form.date, amount: amt, category: form.category, note: form.note.trim(),
        });
        setEntries((es) => es.map((e) => (e.id === editingId ? { ...saved, accountId: saved.account } : e)));
      } else {
        const result = await api.createEntry(token, {
          account: form.accountId, type: form.type, date: form.date, amount: amt, category: form.category, note: form.note.trim(), repeat: form.repeat,
        });
        const created = (Array.isArray(result) ? result : [result]).map((e) => ({ ...e, accountId: e.account }));
        setEntries((es) => [...es, ...created]);
      }
      closeForm();
    } catch (err) {
      setFormError(err.message || "Could not save entry.");
    } finally {
      setSubmittingForm(false);
    }
  }

  // ---------- delete with undo ----------
  const [toasts, setToasts] = useState([]); // { id, text, undo() }
  const pendingTimers = useRef({});
  function pushToast(text, undo) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((t) => [...t, { id, text }]);
    const timer = setTimeout(() => { setToasts((t) => t.filter((x) => x.id !== id)); }, UNDO_WINDOW_MS);
    return { id, timer, undo };
  }
  function doDelete(entry) {
    setEntries((es) => es.filter((e) => e.id !== entry.id));
    setConfirmDeleteId(null);
    const toast = pushToast(`Deleted ${entry.category} entry`, () => {
      clearTimeout(pendingTimers.current[toast.id]);
      delete pendingTimers.current[toast.id];
      setEntries((es) => [...es, entry]);
      setToasts((t) => t.filter((x) => x.id !== toast.id));
    });
    pendingTimers.current[toast.id] = setTimeout(async () => {
      try { await api.deleteEntry(token, entry.id); } catch (e) { /* already optimistic */ }
      delete pendingTimers.current[toast.id];
    }, UNDO_WINDOW_MS);
  }
  function dismissToast(id) { setToasts((t) => t.filter((x) => x.id !== id)); }

  // ---------- bulk actions ----------
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  function toggleSelectMode() { setSelectMode((v) => !v); setSelectedIds(new Set()); setBulkDeleteConfirm(false); }
  function toggleSelect(id) { setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleSelectAll() { setSelectedIds((prev) => (prev.size === displayEntries.length ? new Set() : new Set(displayEntries.map((e) => e.id)))); }
  const selectedEntries = displayEntries.filter((e) => selectedIds.has(e.id));
  const selectedTypes = new Set(selectedEntries.map((e) => e.type));
  const bulkCategoryOptions = selectedTypes.size === 1 ? (selectedTypes.has("income") ? categoryLists.income : categoryLists.expense) : [];
  async function applyBulkRecategorize() {
    if (!bulkCategory || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    await api.bulkRecategorize(token, ids, bulkCategory);
    setEntries((es) => es.map((e) => (selectedIds.has(e.id) ? { ...e, category: bulkCategory } : e)));
    setSelectedIds(new Set()); setBulkCategory("");
  }
  function applyBulkDelete() {
    const ids = [...selectedIds];
    const removed = entries.filter((e) => ids.includes(e.id));
    setEntries((es) => es.filter((e) => !ids.includes(e.id)));
    setSelectedIds(new Set()); setBulkDeleteConfirm(false);
    const toast = pushToast(`Deleted ${removed.length} ${removed.length === 1 ? "entry" : "entries"}`, () => {
      clearTimeout(pendingTimers.current[toast.id]);
      delete pendingTimers.current[toast.id];
      setEntries((es) => [...es, ...removed]);
      setToasts((t) => t.filter((x) => x.id !== toast.id));
    });
    pendingTimers.current[toast.id] = setTimeout(async () => {
      try { await api.bulkDeleteEntries(token, ids); } catch (e) { /* already optimistic */ }
      delete pendingTimers.current[toast.id];
    }, UNDO_WINDOW_MS);
  }

  // ---------- export / import ----------
  const fileInputRef = useRef(null);
  const [importError, setImportError] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const [importDone, setImportDone] = useState("");

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function handleExportJSON() {
    downloadBlob(JSON.stringify({ exportedAt: new Date().toISOString(), entries, goal, budgets, categoryLists, accounts }, null, 2), `tally-backup-${toISODate(new Date())}.json`, "application/json");
  }
  function handleExportCSV() {
    downloadBlob(entriesToCSV(entries, accounts), `tally-entries-${toISODate(new Date())}.csv`, "text/csv");
  }
  function handleShareSnapshot() {
    const rows = categoryTotals.map((c) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #E5DFD3"><span>${escapeHTML(c.category)}</span><span>${escapeHTML(fmtMoney(c.amount))}</span></div>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tally snapshot</title></head>
<body style="font-family:-apple-system,sans-serif;background:#F7F4EE;color:#2B2A27;padding:32px;max-width:560px;margin:0 auto;">
<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#635E56;margin-bottom:8px;">Read-only snapshot &middot; ${escapeHTML(session.name)}'s Tally</div>
<h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 4px;">${escapeHTML(rangeLabel(view, refDate))}</h1>
<p style="color:#635E56;font-size:13px;margin:0 0 24px;">Generated ${escapeHTML(new Date().toLocaleString("en-IN"))}. Static file — does not update, cannot be edited.</p>
<div style="display:flex;gap:12px;margin-bottom:24px;">
  <div style="flex:1;background:#E7EEE6;border-radius:12px;padding:12px;"><div style="font-size:12px;color:#635E56;">Money In</div><div style="font-size:18px;font-family:Georgia,serif;color:#3F5E48;">${escapeHTML(fmtMoney(totalIn))}</div></div>
  <div style="flex:1;background:#F6E7E0;border-radius:12px;padding:12px;"><div style="font-size:12px;color:#635E56;">Money Out</div><div style="font-size:18px;font-family:Georgia,serif;color:#96432B;">${escapeHTML(fmtMoney(totalOut))}</div></div>
  <div style="flex:1;background:#FFFFFF;border:1px solid #E5DFD3;border-radius:12px;padding:12px;"><div style="font-size:12px;color:#635E56;">Net</div><div style="font-size:18px;font-family:Georgia,serif;color:${net >= 0 ? "#3F5E48" : "#96432B"};">${escapeHTML(fmtMoney(net))}</div></div>
</div>
<h2 style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#635E56;">Spending by category</h2>
${rows || '<p style="color:#635E56;font-size:13px;">No expenses in this period.</p>'}
</body></html>`;
    downloadBlob(html, `tally-snapshot-${toISODate(new Date())}.html`, "text/html");
  }
  function handleImportClick() { setImportError(""); setImportDone(""); fileInputRef.current?.click(); }
  function handleFileSelected(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.entries)) { setImportError("That file doesn't contain a list of entries."); return; }
        setImportError("");
        setPendingImport(data);
      } catch (e) { setImportError("That file isn't valid JSON."); }
    };
    reader.readAsText(file);
    ev.target.value = "";
  }
  async function confirmImport() {
    if (!pendingImport) return;
    await api.importBackup(token, pendingImport);
    setPendingImport(null);
    setImportDone(`Imported ${pendingImport.entries.length} ${pendingImport.entries.length === 1 ? "entry" : "entries"}.`);
    loadAll();
  }
  function cancelImport() { setPendingImport(null); }

  const activeCategoryList = categoryLists[form.type] || [];
  const formCategories = activeCategoryList.includes(form.category) ? activeCategoryList : [...activeCategoryList, form.category].filter(Boolean);
  const monthShort = (d) => d.toLocaleDateString("en-IN", { month: "short" });
  const filterCategoryOptions = [...new Set([...categoryLists.expense, ...categoryLists.income])];

  return (
    <div style={{ background: C.paper, fontFamily: FONTS.bodyFont, color: C.ink, minHeight: "100vh", overflowX: "hidden" }} className="w-full">
      <style>{buildGlobalStyles(C)}</style>

      {/* Undo toasts */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 w-full max-w-sm px-4">
        {toasts.map((t) => (
          <div key={t.id} style={{ background: C.ink, color: C.paper }} className="rounded-lg px-4 py-3 flex items-center justify-between gap-3 shadow-lg text-sm">
            <span>{t.text}</span>
            <div className="flex items-center gap-2 shrink-0">
              {t.undo && (
                <button onClick={t.undo} className="ft-focus flex items-center gap-1 text-xs font-semibold underline underline-offset-2 focus:outline-none">
                  <Undo2 size={13} aria-hidden="true" /> Undo
                </button>
              )}
              <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="ft-focus focus:outline-none opacity-70 hover:opacity-100">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {(renamingUser) && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 flex items-center justify-center p-4" style={{ background: C.overlay, zIndex: 60 }}
          onKeyDown={(e) => { if (e.key === "Enter") submitName(); if (e.key === "Escape") setRenamingUser(false); }}>
          <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-6 max-w-sm w-full shadow-lg">
            <h2 style={{ fontFamily: FONTS.displayFont }} className="text-xl mb-4">Update your name</h2>
            <input autoFocus type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
              style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }}
              className="ft-focus w-full text-sm px-3 py-2 rounded-lg focus:outline-none mb-4" />
            <div className="flex gap-2">
              <button onClick={submitName} style={{ background: C.ink, color: C.paper }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 focus:outline-none">Save</button>
              <button onClick={() => setRenamingUser(false)} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-70 focus:outline-none">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8 sm:px-6">
        <div className="flex items-start justify-end gap-2 mb-6">
          <button onClick={toggleMode} aria-pressed={mode === "dark"} aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }}
            className="ft-focus p-2 rounded-full hover:opacity-80 transition-opacity focus:outline-none">
            {mode === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </button>
          <button onClick={handleLogoutClick} aria-label="Log out" style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }}
            className="ft-focus p-2 rounded-full hover:opacity-80 transition-opacity focus:outline-none">
            <LogOut size={16} aria-hidden="true" />
          </button>
          <Logo C={C} />
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <h1 style={{ color: C.inkSoft, letterSpacing: "0.14em" }} className="text-xs font-semibold uppercase">
              Welcome, {session.name}
            </h1>
            <button onClick={() => { setNameDraft(session.name); setRenamingUser(true); }} aria-label="Edit your name" style={{ color: C.inkSoft }} className="ft-focus hover:opacity-70 focus:outline-none">
              <Pencil size={11} aria-hidden="true" />
            </button>
          </div>
          {!ready ? (
            <div className="ft-skeleton" style={{ width: "220px", height: "48px" }} />
          ) : (
            <div className="flex items-end flex-wrap gap-x-4 gap-y-2">
              <div style={{ fontFamily: FONTS.displayFont, color: C.ink, lineHeight: 1 }} className="text-5xl sm:text-6xl">{fmtMoney(allTimeBalance)}</div>
              <div className="flex gap-2 mb-1">
                <span style={{ background: C.sageSoft, color: C.sage }} className="text-xs font-medium px-2 py-1 rounded-full">In {fmtMoney(allTimeIn)}</span>
                <span style={{ background: C.claySoft, color: C.clay }} className="text-xs font-medium px-2 py-1 rounded-full">Out {fmtMoney(allTimeOut)}</span>
              </div>
            </div>
          )}
          <div style={{ borderTop: `2px solid ${C.ink}`, borderBottom: `1px solid ${C.ink}`, height: "3px" }} className="mt-3" />
          {loadError && <div role="alert" style={{ color: C.clay }} className="text-xs mt-2">{loadError}</div>}
        </div>

        {/* Account switcher */}
        <div className="mb-6">
          {editingAccounts ? (
            <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold">Manage accounts</h2>
                <button onClick={() => setEditingAccounts(false)} aria-label="Close" style={{ color: C.inkSoft }} className="ft-focus hover:opacity-70 focus:outline-none"><X size={18} aria-hidden="true" /></button>
              </div>
              <div className="flex flex-col gap-2 mb-3">
                {accountForm.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <input type="text" value={a.name} onChange={(e) => updateAccountName(a.id, e.target.value)}
                      style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }}
                      className="ft-focus flex-1 text-sm px-3 py-2 rounded-lg focus:outline-none" aria-label="Account name" />
                    <button onClick={() => removeAccountRow(a.id)} aria-label={`Remove account ${a.name || ""}`} style={{ color: C.inkSoft }} className="ft-focus p-1.5 rounded-md hover:opacity-70 focus:outline-none"><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
              <button onClick={addAccountRow} style={{ color: C.sage, border: `1px solid ${C.line}` }} className="ft-focus flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-80 focus:outline-none mb-3"><Plus size={13} aria-hidden="true" /> Add account</button>
              {accountError && <div role="alert" style={{ color: C.clay }} className="text-xs mb-3">{accountError}</div>}
              <div className="flex gap-2">
                <button onClick={submitAccounts} style={{ background: C.ink, color: C.paper }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 focus:outline-none">Save accounts</button>
                <button onClick={() => setEditingAccounts(false)} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-70 focus:outline-none">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <div role="tablist" aria-label="Account" className="flex items-center gap-1.5 flex-wrap">
                <button role="tab" aria-selected={selectedAccountId === "all"} onClick={() => setSelectedAccountId("all")}
                  style={selectedAccountId === "all" ? { background: C.ink, color: C.paper } : { background: C.card, color: C.inkSoft, border: `1px solid ${C.line}` }}
                  className="ft-focus text-xs font-medium px-3 py-1.5 rounded-full focus:outline-none">All accounts</button>
                {accounts.map((a) => (
                  <button key={a.id} role="tab" aria-selected={selectedAccountId === a.id} onClick={() => setSelectedAccountId(a.id)}
                    style={selectedAccountId === a.id ? { background: C.ink, color: C.paper } : { background: C.card, color: C.inkSoft, border: `1px solid ${C.line}` }}
                    className="ft-focus text-xs font-medium px-3 py-1.5 rounded-full focus:outline-none">{a.name}</button>
                ))}
              </div>
              <button onClick={openAccountsEdit} aria-label="Manage accounts" style={{ color: C.inkSoft }} className="ft-focus flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg hover:opacity-70 focus:outline-none">
                <Wallet size={13} aria-hidden="true" /><Pencil size={11} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {alerts.length > 0 && (
          <div className="flex flex-col gap-2 mb-6">
            {alerts.map((a) => {
              const tone = a.level === "danger" ? C.clay : a.level === "warning" ? C.warn : C.sage;
              const toneSoft = a.level === "danger" ? C.claySoft : a.level === "warning" ? C.warnSoft : C.sageSoft;
              const Icon = a.level === "success" ? PartyPopper : AlertTriangle;
              return (
                <div key={a.id} role="status" style={{ background: toneSoft, color: tone }} className="rounded-lg px-3 py-2 flex items-center gap-2 text-sm">
                  <Icon size={15} aria-hidden="true" className="shrink-0" />
                  <span className="flex-1">{a.text}</span>
                  <button onClick={() => dismissAlert(a.id)} aria-label="Dismiss" style={{ color: tone }} className="ft-focus p-0.5 rounded hover:opacity-70 focus:outline-none shrink-0"><X size={14} aria-hidden="true" /></button>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3"><Lightbulb size={15} style={{ color: C.sage }} aria-hidden="true" /><h2 className="text-sm font-semibold">Insights</h2></div>
          {!ready ? (
            <div className="flex flex-col gap-2">
              <div className="ft-skeleton" style={{ height: "14px", width: "90%" }} />
              <div className="ft-skeleton" style={{ height: "14px", width: "70%" }} />
            </div>
          ) : insights.length === 0 ? (
            <div style={{ color: C.inkSoft }} className="text-sm">Add a few more entries to start seeing insights here.</div>
          ) : (
            <ul className="flex flex-col gap-2 list-none p-0 m-0">
              {insights.map((text, i) => (<li key={i} style={{ color: C.ink }} className="text-sm flex gap-2"><span aria-hidden="true" style={{ color: C.sage }}>•</span>{text}</li>))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button onClick={handleExportJSON} style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }} className="ft-focus flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg hover:opacity-80 focus:outline-none"><Download size={15} aria-hidden="true" />Export backup</button>
          <button onClick={handleExportCSV} style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }} className="ft-focus flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg hover:opacity-80 focus:outline-none"><FileSpreadsheet size={15} aria-hidden="true" />Export CSV</button>
          <button onClick={handleShareSnapshot} style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }} className="ft-focus flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg hover:opacity-80 focus:outline-none"><Share2 size={15} aria-hidden="true" />Share snapshot</button>
          <button onClick={handleImportClick} style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }} className="ft-focus flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg hover:opacity-80 focus:outline-none"><Upload size={15} aria-hidden="true" />Import backup</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleFileSelected} className="ft-sr-only" aria-label="Choose a backup JSON file to import" />
          {importError && <div role="alert" style={{ color: C.clay }} className="text-xs w-full">{importError}</div>}
          {importDone && <div role="status" style={{ color: C.sage }} className="text-xs w-full">{importDone}</div>}
        </div>

        {pendingImport && (
          <div role="dialog" aria-modal="true" onKeyDown={(e) => { if (e.key === "Escape") cancelImport(); }} className="fixed inset-0 flex items-center justify-center p-4" style={{ background: C.overlay, zIndex: 50 }}>
            <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-5 max-w-sm w-full shadow-lg">
              <h2 className="text-sm font-semibold mb-2">Replace existing data?</h2>
              <p style={{ color: C.inkSoft }} className="text-sm mb-4">This file has {pendingImport.entries.length} {pendingImport.entries.length === 1 ? "entry" : "entries"}. Importing will permanently replace your current {entries.length} {entries.length === 1 ? "entry" : "entries"}. This can't be undone.</p>
              <div className="flex gap-2">
                <button autoFocus onClick={confirmImport} style={{ background: C.clay, color: "#fff" }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 focus:outline-none">Replace data</button>
                <button onClick={cancelImport} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-70 focus:outline-none">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Goal */}
        <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-5 mb-6">
          {editingGoal ? (
            <div>
              <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold">Edit savings goal</h2><button onClick={() => setEditingGoal(false)} aria-label="Close" style={{ color: C.inkSoft }} className="ft-focus hover:opacity-70 focus:outline-none"><X size={18} aria-hidden="true" /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Field label="Goal name" C={C}><input type="text" value={goalForm.name} onChange={(e) => setGoalForm((f) => ({ ...f, name: e.target.value }))} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-3 py-2 rounded-lg focus:outline-none" /></Field>
                <Field label="Target amount (₹)" C={C}><input type="number" min="0" step="0.01" value={goalForm.target} onChange={(e) => setGoalForm((f) => ({ ...f, target: e.target.value }))} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-3 py-2 rounded-lg focus:outline-none" /></Field>
              </div>
              {goalError && <div role="alert" style={{ color: C.clay }} className="text-xs mb-3">{goalError}</div>}
              <div className="flex gap-2">
                <button onClick={submitGoal} style={{ background: C.ink, color: C.paper }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 focus:outline-none">Save goal</button>
                <button onClick={() => setEditingGoal(false)} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-70 focus:outline-none">Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><Target size={15} style={{ color: C.sage }} aria-hidden="true" /><h2 className="text-sm font-semibold">{goal.name}</h2></div>
                <button onClick={openGoalEdit} aria-label={`Edit ${goal.name} goal`} style={{ color: C.inkSoft }} className="ft-focus p-1 rounded-md hover:opacity-70 focus:outline-none"><Pencil size={14} aria-hidden="true" /></button>
              </div>
              <div role="progressbar" aria-valuenow={goalPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.name} progress: ${goalPct}%`} style={{ background: C.paper }} className="w-full h-3 rounded-full overflow-hidden mb-2">
                <div aria-hidden="true" style={{ width: `${goalPct}%`, background: goalReached ? C.sage : C.clay }} className="h-full rounded-full transition-all" />
              </div>
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span style={{ color: C.inkSoft }} className="text-xs">{fmtMoney(Math.max(globalBalance, 0))} of {fmtMoney(goal.target)} ({goalPct}%) — across all accounts</span>
                <span style={{ color: goalReached ? C.sage : C.inkSoft }} className="text-xs font-medium">{goalReached ? "Goal reached" : `${fmtMoney(goalRemaining)} to go`}</span>
              </div>
            </div>
          )}
        </div>

        {/* Budgets */}
        <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-5 mb-6">
          {editingBudgets ? (
            <div>
              <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold">Manage monthly budgets</h2><button onClick={() => setEditingBudgets(false)} aria-label="Close" style={{ color: C.inkSoft }} className="ft-focus hover:opacity-70 focus:outline-none"><X size={18} aria-hidden="true" /></button></div>
              <p style={{ color: C.inkSoft }} className="text-xs mb-3">Set a monthly limit per category. Leave blank or 0 to remove a budget.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                {categoryLists.expense.map((c) => (
                  <Field label={c} key={c} C={C}><input type="number" min="0" step="1" placeholder="No limit" value={budgetForm[c] || ""} onChange={(e) => setBudgetForm((f) => ({ ...f, [c]: e.target.value }))} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-3 py-2 rounded-lg focus:outline-none" /></Field>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={submitBudgets} style={{ background: C.ink, color: C.paper }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 focus:outline-none">Save budgets</button>
                <button onClick={() => setEditingBudgets(false)} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-70 focus:outline-none">Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><SlidersHorizontal size={15} style={{ color: C.sage }} aria-hidden="true" /><h2 className="text-sm font-semibold">Monthly budgets</h2></div>
                <button onClick={openBudgetsEdit} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:opacity-70 focus:outline-none"><Pencil size={12} aria-hidden="true" /> Manage</button>
              </div>
              {budgetRows.length === 0 ? (
                <div style={{ color: C.inkSoft }} className="text-sm py-2">No budgets set yet. Tap Manage to set a monthly limit for a category.</div>
              ) : (
                <ul className="flex flex-col gap-3 list-none p-0 m-0">
                  {budgetRows.map((b) => {
                    const barColor = b.state === "over" ? C.clay : b.state === "warn" ? C.warn : C.sage;
                    const pct = Math.min(Math.round((b.spent / b.limit) * 100), 999);
                    return (
                      <li key={b.category}>
                        <div className="flex items-center justify-between mb-1">
                          <span style={{ color: C.ink }} className="text-sm">{b.category}</span>
                          <span style={{ color: b.state === "over" ? C.clay : C.inkSoft }} className="text-xs">{fmtMoney(b.spent)} / {fmtMoney(b.limit)} ({pct}%)</span>
                        </div>
                        <div role="progressbar" aria-valuenow={Math.min(pct, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.category} budget: ${pct}% used`} style={{ background: C.paper }} className="w-full h-2.5 rounded-full overflow-hidden">
                          <div aria-hidden="true" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} className="h-full rounded-full transition-all" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Categories */}
        <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-5 mb-6">
          {editingCategories ? (
            <div>
              <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold">Manage categories</h2><button onClick={() => setEditingCategories(false)} aria-label="Close" style={{ color: C.inkSoft }} className="ft-focus hover:opacity-70 focus:outline-none"><X size={18} aria-hidden="true" /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                {["expense", "income"].map((type) => (
                  <div key={type}>
                    <div style={{ color: C.inkSoft }} className="text-xs uppercase font-semibold mb-2 capitalize">{type}</div>
                    <ul className="flex flex-col gap-1.5 list-none p-0 m-0 mb-2">
                      {categoryLists[type].map((c) => (
                        <li key={c} className="flex items-center justify-between text-sm" style={{ color: C.ink }}>
                          {c}
                          <button onClick={() => removeCategory(type, c)} aria-label={`Remove ${c} category`} style={{ color: C.inkSoft }} className="ft-focus p-1 rounded hover:opacity-70 focus:outline-none"><X size={13} aria-hidden="true" /></button>
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center gap-1.5">
                      <input type="text" value={newCategoryName[type]} onChange={(e) => setNewCategoryName((n) => ({ ...n, [type]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") addCategory(type); }} placeholder="New category"
                        style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus flex-1 text-sm px-2.5 py-1.5 rounded-lg focus:outline-none" />
                      <button onClick={() => addCategory(type)} aria-label={`Add ${type} category`} style={{ color: C.sage }} className="ft-focus p-1.5 rounded-md hover:opacity-70 focus:outline-none"><Plus size={16} aria-hidden="true" /></button>
                    </div>
                  </div>
                ))}
              </div>
              {categoryError && <div role="alert" style={{ color: C.clay }} className="text-xs mb-3">{categoryError}</div>}
              <p style={{ color: C.inkSoft }} className="text-xs mb-3">Changes here apply right away — new categories are ready to pick as soon as you add them.</p>
              <button onClick={() => setEditingCategories(false)} style={{ background: C.ink, color: C.paper }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 focus:outline-none">Done</button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag size={15} style={{ color: C.sage }} aria-hidden="true" /><h2 className="text-sm font-semibold">Categories</h2>
                <span style={{ color: C.inkSoft }} className="text-xs">{categoryLists.expense.length} expense · {categoryLists.income.length} income</span>
              </div>
              <button onClick={openCategoriesEdit} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:opacity-70 focus:outline-none"><Pencil size={12} aria-hidden="true" /> Manage</button>
            </div>
          )}
        </div>

        {/* Security & notifications */}
        <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck size={15} style={{ color: C.sage }} aria-hidden="true" />
            <h2 className="text-sm font-semibold">Security &amp; notifications</h2>
          </div>
          <LockSettings C={C} />
          <div style={{ borderTop: `1px solid ${C.line}` }} className="mt-4 pt-4">
            <div className="flex items-center justify-between mb-1">
              <span style={{ color: C.ink }} className="text-sm">Budget alerts</span>
              <button
                onClick={notifStatus === "granted" ? undefined : handleEnableNotifications}
                disabled={notifStatus === "granted" || notifBusy || notifStatus === "unsupported"}
                style={{ color: notifStatus === "granted" ? C.sage : C.sage }}
                className="ft-focus text-xs font-medium underline underline-offset-2 focus:outline-none disabled:no-underline disabled:opacity-80"
              >
                {notifStatus === "granted" ? "Enabled" : notifStatus === "denied" ? "Blocked in browser settings" : notifStatus === "unsupported" ? "Not supported here" : notifBusy ? "Enabling…" : "Enable"}
              </button>
            </div>
            <p style={{ color: C.inkSoft }} className="text-xs">
              Get a real phone notification the moment a budget crosses 80% or goes over — even if the app isn't open.
            </p>
            {notifError && <div role="alert" style={{ color: C.clay }} className="text-xs mt-1">{notifError}</div>}
          </div>
        </div>

        {/* Trends */}
        <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-5 mb-6">
          <h2 style={{ color: C.inkSoft, letterSpacing: "0.1em" }} className="text-xs font-semibold uppercase mb-1">6-Month Trend</h2>
          <p className="ft-sr-only">Grouped bar chart comparing income and expense totals for each of the last six calendar months.</p>
          <div className="flex items-end justify-between gap-2 mt-4 mb-4" style={{ height: "96px" }}>
            {trendMonths.map((m) => (
              <div key={m.key} className="flex flex-col items-center flex-1 h-full justify-end gap-1">
                <div className="flex items-end gap-1 h-full">
                  <div aria-hidden="true" style={{ width: "8px", height: `${(m.income / trendMax) * 100}%`, background: C.sage, minHeight: m.income > 0 ? "2px" : 0 }} className="rounded-t-sm" />
                  <div aria-hidden="true" style={{ width: "8px", height: `${(m.expense / trendMax) * 100}%`, background: C.clay, minHeight: m.expense > 0 ? "2px" : 0 }} className="rounded-t-sm" />
                </div>
                <span style={{ color: C.inkSoft }} className="text-xs">{monthShort(m.date)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
            <span style={{ color: C.inkSoft }} className="text-xs">This month's net: <strong style={{ color: thisMonth.net >= 0 ? C.sage : C.clay }}>{fmtMoney(thisMonth.net)}</strong></span>
            <span style={{ color: netDelta >= 0 ? C.sage : C.clay }} className="flex items-center gap-1 text-xs font-medium">
              {netDelta >= 0 ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />}
              {netDeltaPct !== null ? `${Math.abs(netDeltaPct)}%` : fmtMoney(Math.abs(netDelta))} vs last month
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Time period" style={{ background: C.card, border: `1px solid ${C.line}` }} className="inline-flex rounded-lg p-1 mb-4">
          {["daily", "weekly", "monthly"].map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} style={view === v ? { background: C.ink, color: C.paper } : { color: C.inkSoft }} className="ft-focus text-sm font-medium px-4 py-1.5 rounded-md capitalize transition-colors focus:outline-none">{v}</button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-6">
          <button aria-label="Previous period" onClick={() => setRefDate(shiftRef(view, refDate, -1))} style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }} className="ft-focus p-2 rounded-full hover:opacity-70 focus:outline-none"><ChevronLeft size={16} aria-hidden="true" /></button>
          <div className="flex items-baseline gap-3">
            <span aria-live="polite" className="text-sm font-medium">{rangeLabel(view, refDate)}</span>
            <button onClick={() => setRefDate(new Date())} style={{ color: C.sage }} className="ft-focus text-xs font-medium underline underline-offset-2 hover:opacity-70 focus:outline-none">Today</button>
          </div>
          <button aria-label="Next period" onClick={() => setRefDate(shiftRef(view, refDate, 1))} style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }} className="ft-focus p-2 rounded-full hover:opacity-70 focus:outline-none"><ChevronRight size={16} aria-hidden="true" /></button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Money In" value={fmtMoney(totalIn)} color={C.sage} bg={C.sageSoft} C={C} ready={ready} />
          <StatCard label="Money Out" value={fmtMoney(totalOut)} color={C.clay} bg={C.claySoft} C={C} ready={ready} />
          <StatCard label="Net" value={fmtMoney(net)} color={net >= 0 ? C.sage : C.clay} bg={C.paper} border C={C} ready={ready} />
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-5 mb-6">
          <h2 style={{ color: C.inkSoft, letterSpacing: "0.1em" }} className="text-xs font-semibold uppercase mb-1">Spending by category</h2>
          <p className="ft-sr-only">Bar chart. Each row lists a category and the rupee amount spent in it during the selected period; bar length is proportional to the highest category.</p>
          {!ready ? (
            <div className="flex flex-col gap-3 mt-3">{[0, 1, 2].map((i) => (<div key={i} className="ft-skeleton" style={{ height: "12px", width: `${80 - i * 15}%` }} />))}</div>
          ) : categoryTotals.length === 0 ? (
            <div style={{ color: C.inkSoft }} className="text-sm py-4 text-center">No expenses in this period.</div>
          ) : (
            <ul className="flex flex-col gap-3 mt-3 list-none p-0 m-0">
              {categoryTotals.map((c) => (
                <li key={c.category} className="flex items-center gap-3">
                  <div style={{ color: C.ink }} className="text-sm w-24 shrink-0 truncate">{c.category}</div>
                  <div style={{ background: C.paper }} className="flex-1 h-3 rounded-full overflow-hidden"><div aria-hidden="true" style={{ width: `${maxCategory ? (c.amount / maxCategory) * 100 : 0}%`, background: categoryColor(c.category) }} className="h-full rounded-full transition-all" /></div>
                  <div style={{ color: C.inkSoft }} className="text-sm w-20 shrink-0 text-right">{fmtMoney(c.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Search & filter */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div style={{ border: `1px solid ${C.line}`, background: C.card }} className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-[160px]">
            <Search size={14} style={{ color: C.inkSoft }} aria-hidden="true" />
            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search notes or categories" aria-label="Search entries" style={{ color: C.ink, background: "transparent" }} className="ft-focus flex-1 text-sm focus:outline-none" />
          </div>
          <button onClick={() => setShowFilters((v) => !v)} aria-pressed={showFilters} style={{ color: C.inkSoft, border: `1px solid ${C.line}`, background: C.card }} className="ft-focus flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg hover:opacity-70 focus:outline-none"><SlidersHorizontal size={13} aria-hidden="true" /> Filters</button>
          {filtersActive && <button onClick={clearFilters} style={{ color: C.sage }} className="ft-focus text-xs font-medium underline underline-offset-2 hover:opacity-70 focus:outline-none">Clear</button>}
        </div>
        {showFilters && (
          <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Type" C={C}><select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-2.5 py-1.5 rounded-lg focus:outline-none"><option value="all">All</option><option value="income">Income</option><option value="expense">Expense</option></select></Field>
            <Field label="Category" C={C}><select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-2.5 py-1.5 rounded-lg focus:outline-none"><option value="all">All</option>{filterCategoryOptions.map((c) => (<option key={c} value={c}>{c}</option>))}</select></Field>
            <Field label="Min amount" C={C}><input type="number" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-2.5 py-1.5 rounded-lg focus:outline-none" /></Field>
            <Field label="Max amount" C={C}><input type="number" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-2.5 py-1.5 rounded-lg focus:outline-none" /></Field>
          </div>
        )}

        {!showForm && (
          <button onClick={openAdd} style={{ background: C.ink, color: C.paper }} className="ft-focus flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg mb-4 hover:opacity-90 focus:outline-none"><Plus size={16} aria-hidden="true" /> Add entry</button>
        )}

        {showForm && (
          <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold">{editingId ? "Edit entry" : "Add entry"}</h2><button onClick={closeForm} aria-label="Close" style={{ color: C.inkSoft }} className="ft-focus hover:opacity-70 focus:outline-none"><X size={18} aria-hidden="true" /></button></div>
            <div role="group" aria-label="Entry type" className="flex gap-2 mb-4">
              {["expense", "income"].map((t) => (
                <button key={t} aria-pressed={form.type === t} onClick={() => onTypeChange(t)} style={form.type === t ? { background: t === "income" ? C.sage : C.clay, color: "#fff" } : { background: C.paper, color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus text-sm font-medium px-4 py-1.5 rounded-full capitalize focus:outline-none">{t}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <Field label="Date" C={C}><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-3 py-2 rounded-lg focus:outline-none" /></Field>
              <Field label="Amount (₹)" C={C}><input type="number" min="0" step="0.01" placeholder="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-3 py-2 rounded-lg focus:outline-none" /></Field>
              <Field label="Category" C={C}><select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-3 py-2 rounded-lg focus:outline-none">{formCategories.map((c) => (<option key={c} value={c}>{c}</option>))}</select></Field>
              <Field label="Account" C={C}><select value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: Number(e.target.value) }))} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-3 py-2 rounded-lg focus:outline-none">{accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}</select></Field>
              <Field label="Note" C={C}><input type="text" placeholder="Optional note" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-3 py-2 rounded-lg focus:outline-none" /></Field>
              {!editingId && (
                <Field label="Repeat" C={C}><select value={form.repeat} onChange={(e) => setForm((f) => ({ ...f, repeat: e.target.value }))} style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus w-full text-sm px-3 py-2 rounded-lg focus:outline-none">{REPEAT_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}</select></Field>
              )}
            </div>
            {editingId && editingRecurring && (<div style={{ color: C.inkSoft }} className="flex items-center gap-1.5 text-xs mb-3"><Repeat size={12} aria-hidden="true" />Part of a {editingRecurring} series — this change only affects this occurrence.</div>)}
            {formError && <div role="alert" style={{ color: C.clay }} className="text-xs mb-3">{formError}</div>}
            <div className="flex gap-2">
              <button onClick={submitForm} disabled={submittingForm} style={{ background: C.ink, color: C.paper }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 focus:outline-none disabled:opacity-60">{submittingForm ? "Saving…" : editingId ? "Save changes" : "Add entry"}</button>
              <button onClick={closeForm} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus text-sm font-medium px-4 py-2 rounded-lg hover:opacity-70 focus:outline-none">Cancel</button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <h2 style={{ color: C.inkSoft, letterSpacing: "0.1em" }} className="text-xs font-semibold uppercase">Entries ({displayEntries.length}{filtersActive ? ` of ${periodEntries.length}` : ""})</h2>
          {displayEntries.length > 0 && (<button onClick={toggleSelectMode} aria-pressed={selectMode} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus text-xs font-medium px-2.5 py-1.5 rounded-lg hover:opacity-70 focus:outline-none">{selectMode ? "Cancel select" : "Select"}</button>)}
        </div>

        {selectMode && (
          <div style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-xl p-3 mb-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs" style={{ color: C.inkSoft }}><input type="checkbox" className="ft-focus" checked={selectedIds.size > 0 && selectedIds.size === displayEntries.length} onChange={toggleSelectAll} aria-label="Select all visible entries" />Select all</label>
            <span style={{ color: C.inkSoft }} className="text-xs">{selectedIds.size} selected</span>
            {selectedIds.size > 0 && (
              <>
                <div className="flex items-center gap-1.5">
                  <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} disabled={bulkCategoryOptions.length === 0} aria-label="Recategorize selected entries as" style={{ border: `1px solid ${C.line}`, color: C.ink, background: C.card }} className="ft-focus text-xs px-2 py-1.5 rounded-lg focus:outline-none disabled:opacity-50">
                    <option value="">{bulkCategoryOptions.length === 0 ? "Mixed types" : "Recategorize as…"}</option>
                    {bulkCategoryOptions.map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                  <button onClick={applyBulkRecategorize} disabled={!bulkCategory} style={{ background: C.ink, color: C.paper }} className="ft-focus text-xs font-medium px-2.5 py-1.5 rounded-lg hover:opacity-90 focus:outline-none disabled:opacity-50">Apply</button>
                </div>
                {bulkDeleteConfirm ? (
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: C.clay }} className="text-xs">Delete {selectedIds.size}?</span>
                    <button onClick={applyBulkDelete} style={{ background: C.clay, color: "#fff" }} className="ft-focus text-xs font-medium px-2.5 py-1.5 rounded-lg hover:opacity-90 focus:outline-none">Confirm</button>
                    <button onClick={() => setBulkDeleteConfirm(false)} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="ft-focus text-xs font-medium px-2.5 py-1.5 rounded-lg hover:opacity-70 focus:outline-none">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setBulkDeleteConfirm(true)} style={{ color: C.clay, border: `1px solid ${C.line}` }} className="ft-focus text-xs font-medium px-2.5 py-1.5 rounded-lg hover:opacity-70 focus:outline-none">Delete selected</button>
                )}
              </>
            )}
          </div>
        )}

        {!ready ? (
          <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => (<div key={i} className="ft-skeleton" style={{ height: "52px" }} />))}</div>
        ) : displayEntries.length === 0 ? (
          <div style={{ background: C.card, border: `1px dashed ${C.line}`, color: C.inkSoft }} className="rounded-xl text-sm py-8 text-center">{filtersActive ? "No entries match your filters." : "No entries in this period yet."}</div>
        ) : (
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {displayEntries.map((e) => (
              <li key={e.id} style={{ background: C.card, border: `1px solid ${C.line}` }} className="rounded-lg px-4 py-3 flex items-center gap-3">
                {selectMode && (<input type="checkbox" className="ft-focus shrink-0" checked={selectedIds.has(e.id)} onChange={() => toggleSelect(e.id)} aria-label={`Select entry: ${e.category}, ${fmtMoney(e.amount)} on ${fmtEntryDate(e.date)}`} />)}
                <div style={{ color: C.inkSoft }} className="text-xs w-20 shrink-0">{fmtEntryDate(e.date)}</div>
                {e.recurring && (<span title={`Repeats ${e.recurring}`} aria-label={`Repeats ${e.recurring}`} style={{ color: C.inkSoft }} className="shrink-0"><Repeat size={13} /></span>)}
                <span style={{ background: `${categoryColor(e.category)}1A`, color: C.ink }} className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full shrink-0">
                  <span aria-hidden="true" style={{ background: categoryColor(e.category), width: 7, height: 7, borderRadius: "50%", display: "inline-block" }} />{e.category}
                </span>
                {selectedAccountId === "all" && accounts.length > 1 && (<span style={{ color: C.inkSoft }} className="text-xs shrink-0 hidden sm:inline">{accounts.find((a) => a.id === e.accountId)?.name || ""}</span>)}
                <div className="text-sm flex-1 truncate min-w-0" style={{ color: e.note ? C.ink : C.inkSoft }}>{e.note || "—"}</div>
                <div style={{ color: e.type === "income" ? C.sage : C.clay }} className="text-sm font-semibold shrink-0">
                  <span className="ft-sr-only">{e.type === "income" ? "Income" : "Expense"}</span>{e.type === "income" ? "+" : "-"}{fmtMoney(e.amount)}
                </div>
                {confirmDeleteId === e.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => doDelete(e)} aria-label={`Confirm delete: ${e.category}`} style={{ color: C.clay }} className="ft-focus p-1.5 rounded-md hover:opacity-70 focus:outline-none"><Check size={16} aria-hidden="true" /></button>
                    <button onClick={() => setConfirmDeleteId(null)} aria-label="Cancel delete" style={{ color: C.inkSoft }} className="ft-focus p-1.5 rounded-md hover:opacity-70 focus:outline-none"><X size={16} aria-hidden="true" /></button>
                  </div>
                ) : (
                  !selectMode && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openDuplicate(e)} aria-label={`Duplicate entry: ${e.category}`} style={{ color: C.inkSoft }} className="ft-focus p-1.5 rounded-md hover:opacity-70 focus:outline-none"><Copy size={15} aria-hidden="true" /></button>
                      <button onClick={() => openEdit(e)} aria-label={`Edit entry: ${e.category}`} style={{ color: C.inkSoft }} className="ft-focus p-1.5 rounded-md hover:opacity-70 focus:outline-none"><Pencil size={15} aria-hidden="true" /></button>
                      <button onClick={() => setConfirmDeleteId(e.id)} aria-label={`Delete entry: ${e.category}`} style={{ color: C.inkSoft }} className="ft-focus p-1.5 rounded-md hover:opacity-70 focus:outline-none"><Trash2 size={15} aria-hidden="true" /></button>
                    </div>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Logo({ C }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <line x1="5" y1="4" x2="5" y2="18" stroke={C.ink} strokeWidth="1.6" strokeLinecap="round" />
        <line x1="8.5" y1="4" x2="8.5" y2="18" stroke={C.ink} strokeWidth="1.6" strokeLinecap="round" />
        <line x1="12" y1="4" x2="12" y2="18" stroke={C.ink} strokeWidth="1.6" strokeLinecap="round" />
        <line x1="15.5" y1="4" x2="15.5" y2="18" stroke={C.ink} strokeWidth="1.6" strokeLinecap="round" />
        <line x1="3.5" y1="14.5" x2="17" y2="7.5" stroke={C.sage} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span style={{ fontFamily: FONTS.displayFont, color: C.ink, letterSpacing: "0.01em" }} className="text-lg">Tally</span>
    </div>
  );
}
function StatCard({ label, value, color, bg, border, C, ready }) {
  return (
    <div style={{ background: bg, border: border ? `1px solid ${C.line}` : "none", minWidth: 0 }} className="rounded-xl px-4 py-3">
      <div style={{ color: C.inkSoft }} className="text-xs mb-1">{label}</div>
      {ready ? (<div style={{ color, fontFamily: FONTS.displayFont }} className="text-lg sm:text-xl truncate min-w-0">{value}</div>) : (<div className="ft-skeleton" style={{ height: "20px", width: "70%" }} />)}
    </div>
  );
}
function Field({ label, children, C }) {
  return (<label className="block"><div style={{ color: C.inkSoft }} className="text-xs mb-1">{label}</div>{children}</label>);
}
