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

function Shell({ children, title }) {
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
          <span style={{ fontFamily: TOKENS.displayFont, color: TOKENS.ink }} className="text-xl">Tally</span>
        </div>
        <h1 style={{ color: TOKENS.inkSoft }} className="text-sm mb-6">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ color: TOKENS.inkSoft }} className="text-xs block mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputStyle = { border: `1px solid ${TOKENS.line}`, color: TOKENS.ink };
const inputClass = "w-full text-sm px-3 py-2 rounded-lg focus:outline-none";
const primaryBtn = "text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 focus:outline-none disabled:opacity-50 mt-1";
const linkBtn = "text-xs font-medium underline underline-offset-2 hover:opacity-70 focus:outline-none";

// Shown automatically when the URL has ?reset_uid=...&reset_token=... (the
// link from the password reset email lands here).
export function ResetPasswordScreen({ uid, token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      const result = await api.confirmPasswordReset(uid, token, password);
      setDone(true);
      setTimeout(() => onDone(result), 1200);
    } catch (err) {
      setError(err.message || "That reset link didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Shell title="Password updated">
        <p style={{ color: TOKENS.sage }} className="text-sm">You're all set. Taking you in now…</p>
      </Shell>
    );
  }

  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="New password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} className={inputClass} autoFocus />
        </Field>
        <Field label="Confirm new password">
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} className={inputClass} />
        </Field>
        {error && <div role="alert" style={{ color: TOKENS.clay }} className="text-xs">{error}</div>}
        <button type="submit" disabled={busy} style={{ background: TOKENS.ink, color: TOKENS.paper }} className={primaryBtn}>
          {busy ? "Saving…" : "Set new password"}
        </button>
      </form>
    </Shell>
  );
}

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

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

  async function submitForgot(e) {
    e.preventDefault();
    setError("");
    if (!email.trim()) return setError("Enter your email first.");
    setBusy(true);
    try {
      const result = await api.requestPasswordReset(email.trim());
      if (result && result.delivery === "unavailable") {
        setError("Password reset emails are not set up for this app yet, so none can be sent. Please contact the app owner.");
      } else {
        setForgotSent(true);
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "forgot") {
    return (
      <Shell title="Reset your password">
        {forgotSent ? (
          <div>
            <p style={{ color: TOKENS.sage }} className="text-sm mb-4">
              If that email has an account, a reset link is on its way. Check your inbox and your spam folder.
            </p>
            <button onClick={() => { setMode("login"); setForgotSent(false); }} style={{ color: TOKENS.sage }} className={linkBtn}>
              Back to log in
            </button>
          </div>
        ) : (
          <form onSubmit={submitForgot} className="flex flex-col gap-3">
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} className={inputClass} autoFocus />
            </Field>
            {error && <div role="alert" style={{ color: TOKENS.clay }} className="text-xs">{error}</div>}
            <button type="submit" disabled={busy} style={{ background: TOKENS.ink, color: TOKENS.paper }} className={primaryBtn}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
            <button type="button" onClick={() => setMode("login")} style={{ color: TOKENS.inkSoft }} className={`${linkBtn} mt-1`}>
              Back to log in
            </button>
          </form>
        )}
      </Shell>
    );
  }

  return (
    <Shell title={mode === "signup" ? "Create your account" : "Welcome back"}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <Field label="Your name">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} className={inputClass} />
          </Field>
        )}
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} className={inputClass} />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} className={inputClass} />
        </Field>

        {mode === "login" && (
          <button type="button" onClick={() => { setMode("forgot"); setError(""); }} style={{ color: TOKENS.sage }} className={`${linkBtn} self-end -mt-1`}>
            Forgot password?
          </button>
        )}

        {error && <div role="alert" style={{ color: TOKENS.clay }} className="text-xs">{error}</div>}

        <button type="submit" disabled={busy} style={{ background: TOKENS.ink, color: TOKENS.paper }} className={primaryBtn}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
      </form>

      <button
        onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}
        style={{ color: TOKENS.sage }}
        className={`${linkBtn} mt-4`}
      >
        {mode === "signup" ? "Already have an account? Log in" : "New here? Create an account"}
      </button>
    </Shell>
  );
}
