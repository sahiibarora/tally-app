// Relative by default: the frontend is served by the same Django app as the
// API in production, so no cross-origin request (or CORS config) is needed.
// Override with VITE_API_URL only if you deliberately split them again.
const API_URL = import.meta.env.VITE_API_URL || "/api";

async function request(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.detail || (data && Object.values(data)[0]) || "Request failed.";
    throw new Error(Array.isArray(message) ? message[0] : String(message));
  }
  return data;
}

export const api = {
  signup: (name, email, password) => request("/auth/signup/", { method: "POST", body: { name, email, password } }),
  login: (email, password) => request("/auth/login/", { method: "POST", body: { email, password } }),
  me: (token) => request("/auth/me/", { token }),
  updateMe: (token, name) => request("/auth/me/", { method: "PATCH", token, body: { name } }),

  listAccounts: (token) => request("/accounts/", { token }),
  createAccount: (token, name) => request("/accounts/", { method: "POST", token, body: { name } }),
  updateAccount: (token, id, name) => request(`/accounts/${id}/`, { method: "PATCH", token, body: { name } }),
  deleteAccount: (token, id) => request(`/accounts/${id}/`, { method: "DELETE", token }),

  listCategories: (token) => request("/categories/", { token }),
  createCategory: (token, type, name) => request("/categories/", { method: "POST", token, body: { type, name } }),
  deleteCategory: (token, id) => request(`/categories/${id}/`, { method: "DELETE", token }),

  listEntries: (token) => request("/entries/", { token }),
  createEntry: (token, entry) => request("/entries/", { method: "POST", token, body: entry }),
  updateEntry: (token, id, entry) => request(`/entries/${id}/`, { method: "PATCH", token, body: entry }),
  deleteEntry: (token, id) => request(`/entries/${id}/`, { method: "DELETE", token }),
  bulkDeleteEntries: (token, ids) => request("/entries/bulk_delete/", { method: "POST", token, body: { ids } }),
  bulkRecategorize: (token, ids, category) => request("/entries/bulk_recategorize/", { method: "POST", token, body: { ids, category } }),

  listBudgets: (token) => request("/budgets/", { token }),
  setBudget: (token, category, monthly_limit) => request("/budgets/", { method: "POST", token, body: { category, monthly_limit } }),
  deleteBudget: (token, id) => request(`/budgets/${id}/`, { method: "DELETE", token }),

  getGoal: (token) => request("/goal/", { token }),
  setGoal: (token, goal) => request("/goal/", { method: "PUT", token, body: goal }),

  getPreferences: (token) => request("/preferences/", { token }),
  setPreferences: (token, prefs) => request("/preferences/", { method: "PUT", token, body: prefs }),

  importBackup: (token, payload) => request("/import/", { method: "POST", token, body: payload }),
};
