import React, { useState } from "react";
import { api } from "./api";

const TOKENS = {
  paper: "#F7F4EE",
  card: "#FFFFFF",
  ink: "#2B2A27",
  inkSoft: "#635E56",
  line: "#E5DFD3",
  sage: "#3F5E48",
  clay: "#96432B",
  focus: "#2F6FDB",
  displayFont: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
};

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) return setError("Email and password are required.");
    if (mode === "signup" && !name.trim()) return setError("Please tell us your name.");
    setBusy(true);
    try {
      const result =
        mode === "signup" ? await api.signup(name.trim(), email.trim(), password) : await api.login(email.trim(), password);
      onAuthed(result);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: TOKENS.paper, minHeight: "100vh", fontFamily: "-apple-system, sans-serif" }} className="flex items-center justify-center p-4">
      <div style={{ background: TOKENS.card, border: `1px solid ${TOKENS.line}` }} className="rounded-xl p-8 max-w-sm w-full shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <line x1="5" y1="4" x2="5" y2="18" stroke={TOKENS.ink} strokeWidth="1.6" strokeLinecap="round" />
            <line x1="8.5" y1="4" x2="8.5" y2="18" stroke={TOKENS.ink} strokeWidth="1.6" strokeLinecap="round" />
            <line x1="12" y1="4" x2="12" y2="18" stroke={TOKENS.ink} strokeWidth="1.6" strokeLinecap="round" />
            <line x1="15.5" y1="4" x2="15.5" y2="18" stroke={TOKENS.ink} strokeWidth="1.6" strokeLinecap="round" />
            <line x1="3.5" y1="14.5" x2="17" y2="7.5" stroke={TOKENS.sage} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span style={{ fontFamily: TOKENS.displayFont, color: TOKENS.ink }} className="text-xl">
            Tally
          </span>
        </div>
        <h1 style={{ color: TOKENS.inkSoft }} className="text-sm mb-6">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div>
              <label style={{ color: TOKENS.inkSoft }} className="text-xs block mb-1">
                Your name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ border: `1px solid ${TOKENS.line}`, color: TOKENS.ink }}
                className="w-full text-sm px-3 py-2 rounded-lg focus:outline-none"
              />
            </div>
          )}
          <div>
            <label style={{ color: TOKENS.inkSoft }} className="text-xs block mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ border: `1px solid ${TOKENS.line}`, color: TOKENS.ink }}
              className="w-full text-sm px-3 py-2 rounded-lg focus:outline-none"
            />
          </div>
          <div>
            <label style={{ color: TOKENS.inkSoft }} className="text-xs block mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ border: `1px solid ${TOKENS.line}`, color: TOKENS.ink }}
              className="w-full text-sm px-3 py-2 rounded-lg focus:outline-none"
            />
          </div>

          {error && (
            <div role="alert" style={{ color: TOKENS.clay }} className="text-xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{ background: TOKENS.ink, color: TOKENS.paper }}
            className="text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 focus:outline-none disabled:opacity-50 mt-1"
          >
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError("");
          }}
          style={{ color: TOKENS.sage }}
          className="text-xs font-medium underline underline-offset-2 mt-4 hover:opacity-70 focus:outline-none"
        >
          {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}
