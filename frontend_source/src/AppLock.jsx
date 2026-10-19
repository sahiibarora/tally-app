import React, { useState, useRef, useEffect } from "react";
import { Fingerprint, Delete } from "lucide-react";

// A LOCAL, per-device privacy lock. It hides your balances if someone picks
// up your phone while Tally is open or in the background. It does NOT replace
// your real email + password login (that lives on the server), and like any
// app-lock it isn't designed to stop someone with deep access to the phone's
// storage. It's a screen lock, same idea as the lock in a banking app.

const PIN_HASH_KEY = "tally-pin-hash";
const PIN_SALT_KEY = "tally-pin-salt";
const PIN_LEN_KEY = "tally-pin-length";
const LOCK_ENABLED_KEY = "tally-lock-enabled";
const BIOMETRIC_CRED_KEY = "tally-biometric-credential-id";
const FAILS_KEY = "tally-pin-fails";
const LOCKOUT_UNTIL_KEY = "tally-pin-lockout-until";

const MAX_FAILS = 5;
const LOCKOUT_MS = 30 * 1000;

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function hashPin(pin, saltB64) {
  const salt = saltB64 ? base64ToBuf(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const combined = new Uint8Array([...salt, ...new TextEncoder().encode(pin)]);
  let digest = await crypto.subtle.digest("SHA-256", combined);
  for (let i = 0; i < 1000; i++) digest = await crypto.subtle.digest("SHA-256", digest);
  return { hash: bufToBase64(digest), salt: bufToBase64(salt) };
}

export function isLockEnabled() {
  return localStorage.getItem(LOCK_ENABLED_KEY) === "true" && !!localStorage.getItem(PIN_HASH_KEY);
}
export function isBiometricRegistered() {
  return !!localStorage.getItem(BIOMETRIC_CRED_KEY);
}
export function isBiometricAvailable() {
  return typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;
}
export function getPinLength() {
  return parseInt(localStorage.getItem(PIN_LEN_KEY) || "4", 10);
}

export async function setupPin(pin) {
  const { hash, salt } = await hashPin(pin);
  localStorage.setItem(PIN_HASH_KEY, hash);
  localStorage.setItem(PIN_SALT_KEY, salt);
  localStorage.setItem(PIN_LEN_KEY, String(pin.length));
  localStorage.setItem(LOCK_ENABLED_KEY, "true");
  localStorage.removeItem(FAILS_KEY);
  localStorage.removeItem(LOCKOUT_UNTIL_KEY);
}

export function lockoutSecondsLeft() {
  const until = parseInt(localStorage.getItem(LOCKOUT_UNTIL_KEY) || "0", 10);
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export async function verifyPin(pin) {
  if (lockoutSecondsLeft() > 0) return false;
  const salt = localStorage.getItem(PIN_SALT_KEY);
  const storedHash = localStorage.getItem(PIN_HASH_KEY);
  if (!salt || !storedHash) return false;
  const { hash } = await hashPin(pin, salt);
  if (hash === storedHash) {
    localStorage.removeItem(FAILS_KEY);
    localStorage.removeItem(LOCKOUT_UNTIL_KEY);
    return true;
  }
  const fails = parseInt(localStorage.getItem(FAILS_KEY) || "0", 10) + 1;
  if (fails >= MAX_FAILS) {
    localStorage.setItem(LOCKOUT_UNTIL_KEY, String(Date.now() + LOCKOUT_MS));
    localStorage.setItem(FAILS_KEY, "0");
  } else {
    localStorage.setItem(FAILS_KEY, String(fails));
  }
  return false;
}

export function disableLock() {
  [PIN_HASH_KEY, PIN_SALT_KEY, PIN_LEN_KEY, LOCK_ENABLED_KEY, BIOMETRIC_CRED_KEY, FAILS_KEY, LOCKOUT_UNTIL_KEY].forEach((k) =>
    localStorage.removeItem(k)
  );
}

// Face ID / Touch ID / Android biometric. This uses the phone's own
// biometric prompt as the gate (no server round-trip), which is the right
// level for a screen lock but is not a full server-verified WebAuthn login.
export async function registerBiometric() {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Tally" },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "tally-user", displayName: "Tally" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
    },
  });
  if (!credential) throw new Error("Could not register biometric unlock.");
  localStorage.setItem(BIOMETRIC_CRED_KEY, bufToBase64(credential.rawId));
  return true;
}
export async function unlockWithBiometric() {
  const credIdB64 = localStorage.getItem(BIOMETRIC_CRED_KEY);
  if (!credIdB64) return false;
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: base64ToBuf(credIdB64), type: "public-key" }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  return !!assertion;
}

const T = { paper: "#F7F4EE", card: "#FFFFFF", ink: "#2B2A27", inkSoft: "#635E56", line: "#E5DFD3", sage: "#3F5E48", clay: "#96432B" };

function PinDots({ length, filled, color }) {
  return (
    <div className="flex gap-3" aria-hidden="true">
      {Array.from({ length }).map((_, i) => (
        <div key={i} style={{ background: i < filled ? color : "transparent", border: `1.5px solid ${color}` }} className="w-3 h-3 rounded-full" />
      ))}
    </div>
  );
}

export function LockScreen({ onUnlock, onForgot }) {
  const pinLength = getPinLength();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(lockoutSecondsLeft());
  const [tryingBiometric, setTryingBiometric] = useState(false);
  const [confirmForgot, setConfirmForgot] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft(lockoutSecondsLeft()), 500);
    return () => clearInterval(t);
  }, [secondsLeft]);

  async function tryBiometric() {
    setTryingBiometric(true);
    try {
      if (await unlockWithBiometric()) onUnlock();
    } catch (e) {
      // Cancelled or unsupported: quietly fall back to the PIN pad.
    } finally {
      setTryingBiometric(false);
    }
  }

  async function press(d) {
    if (secondsLeft > 0) return;
    const next = (digits + d).slice(0, pinLength);
    setDigits(next);
    setError("");
    if (next.length === pinLength) {
      if (await verifyPin(next)) {
        onUnlock();
        return;
      }
      setDigits("");
      const left = lockoutSecondsLeft();
      setSecondsLeft(left);
      setError(left > 0 ? "Too many wrong attempts." : "Wrong PIN. Try again.");
    }
  }

  const btn = { color: T.ink, background: T.card, border: `1px solid ${T.line}` };

  return (
    <div style={{ background: T.paper, minHeight: "100vh", fontFamily: "-apple-system, sans-serif" }} className="flex flex-col items-center justify-center p-6">
      <div style={{ color: T.ink }} className="text-lg font-medium mb-4">Enter your PIN</div>
      <PinDots length={pinLength} filled={digits.length} color={T.ink} />
      <div style={{ minHeight: 24 }} className="mt-4 mb-2">
        {secondsLeft > 0 ? (
          <div role="alert" style={{ color: T.clay }} className="text-xs text-center">Locked for {secondsLeft}s. Try again shortly.</div>
        ) : error ? (
          <div role="alert" style={{ color: T.clay }} className="text-xs text-center">{error}</div>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-4 mb-4" style={{ opacity: secondsLeft > 0 ? 0.4 : 1 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => press(d)} aria-label={d} style={btn} className="w-16 h-16 rounded-xl text-xl font-medium active:opacity-70">{d}</button>
        ))}
        <div />
        <button onClick={() => press("0")} aria-label="0" style={btn} className="w-16 h-16 rounded-xl text-xl font-medium active:opacity-70">0</button>
        <button onClick={() => setDigits((d) => d.slice(0, -1))} aria-label="Delete last digit" style={{ color: T.inkSoft }} className="w-16 h-16 rounded-xl flex items-center justify-center active:opacity-70">
          <Delete size={20} aria-hidden="true" />
        </button>
      </div>
      {isBiometricRegistered() && (
        <button onClick={tryBiometric} disabled={tryingBiometric} style={{ color: T.sage }} className="flex items-center gap-2 text-sm font-medium mt-2">
          <Fingerprint size={16} aria-hidden="true" /> {tryingBiometric ? "Checking…" : "Unlock with Face ID / Touch ID"}
        </button>
      )}
      <div className="mt-8 text-center">
        {confirmForgot ? (
          <div>
            <p style={{ color: T.inkSoft }} className="text-xs mb-2 max-w-xs">This logs you out on this device and removes the PIN. Your data is safe on the server. Log back in with your email and password.</p>
            <div className="flex gap-2 justify-center">
              <button onClick={onForgot} style={{ background: T.clay, color: "#fff" }} className="text-xs font-medium px-3 py-1.5 rounded-lg">Log out &amp; remove PIN</button>
              <button onClick={() => setConfirmForgot(false)} style={{ color: T.inkSoft, border: `1px solid ${T.line}` }} className="text-xs font-medium px-3 py-1.5 rounded-lg">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmForgot(true)} style={{ color: T.inkSoft }} className="text-xs underline underline-offset-2">Forgot PIN?</button>
        )}
      </div>
    </div>
  );
}

// Security card content: turn the lock on/off, set or change the PIN, and
// optionally enable Face ID / Touch ID.
export function LockSettings({ C }) {
  const [enabled, setEnabled] = useState(isLockEnabled());
  const [settingPin, setSettingPin] = useState(false);
  const [stage, setStage] = useState("enter"); // "enter" | "confirm"
  const [firstPin, setFirstPin] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [bioRegistered, setBioRegistered] = useState(isBiometricRegistered());
  const [bioError, setBioError] = useState("");

  function startSetup() {
    setSettingPin(true);
    setStage("enter");
    setFirstPin("");
    setTyped("");
    setError("");
  }

  function press(d) {
    setError("");
    setTyped((t) => (t + d).slice(0, 6));
  }

  async function next() {
    if (stage === "enter") {
      if (typed.length < 4) return setError("Use at least 4 digits.");
      setFirstPin(typed);
      setTyped("");
      setStage("confirm");
      return;
    }
    if (typed !== firstPin) {
      setError("Those didn't match. Start again.");
      setStage("enter");
      setFirstPin("");
      setTyped("");
      return;
    }
    await setupPin(typed);
    setEnabled(true);
    setSettingPin(false);
    setTyped("");
  }

  function turnOff() {
    disableLock();
    setEnabled(false);
    setBioRegistered(false);
    setSettingPin(false);
  }

  async function enableBiometric() {
    setBioError("");
    try {
      await registerBiometric();
      setBioRegistered(true);
    } catch (e) {
      setBioError("Couldn't set up Face ID / Touch ID on this device. Your PIN still works.");
    }
  }

  const key = { color: C.ink, background: C.card, border: `1px solid ${C.line}` };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span id="app-lock-label" style={{ color: C.ink }} className="text-sm">App lock</span>
        <div role="group" aria-labelledby="app-lock-label" style={{ border: `1px solid ${C.line}`, background: C.paper }} className="inline-flex rounded-lg p-0.5">
          <button
            onClick={() => enabled && turnOff()}
            aria-pressed={!enabled && !settingPin}
            style={!enabled && !settingPin ? { background: C.ink, color: C.paper } : { color: C.inkSoft }}
            className="ft-focus text-xs font-medium px-3 py-1 rounded-md focus:outline-none"
          >
            Off
          </button>
          <button
            onClick={() => !enabled && !settingPin && startSetup()}
            aria-pressed={enabled || settingPin}
            style={enabled || settingPin ? { background: C.ink, color: C.paper } : { color: C.inkSoft }}
            className="ft-focus text-xs font-medium px-3 py-1 rounded-md focus:outline-none"
          >
            On
          </button>
        </div>
      </div>
      <p style={{ color: C.inkSoft }} className="text-xs mb-3">
        Ask for a PIN (or Face ID / Touch ID) every time you open Tally or come back to it. This lock is per device.
      </p>

      {settingPin && (
        <div style={{ border: `1px solid ${C.line}`, background: C.paper }} className="rounded-lg p-4 mb-3">
          <div style={{ color: C.ink }} className="text-sm mb-3">{stage === "enter" ? "Choose a PIN (4 to 6 digits)" : "Enter it again to confirm"}</div>
          <div className="mb-3 h-4 flex items-center">
            <PinDots length={Math.max(typed.length, 1)} filled={typed.length} color={C.ink} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button key={d} onClick={() => press(d)} aria-label={d} style={key} className="h-10 rounded-lg text-sm">{d}</button>
            ))}
            <div />
            <button onClick={() => press("0")} aria-label="0" style={key} className="h-10 rounded-lg text-sm">0</button>
            <button onClick={() => setTyped((t) => t.slice(0, -1))} aria-label="Delete last digit" style={{ color: C.inkSoft }} className="h-10 rounded-lg flex items-center justify-center">
              <Delete size={16} aria-hidden="true" />
            </button>
          </div>
          {error && <div role="alert" style={{ color: C.clay }} className="text-xs mb-2">{error}</div>}
          <div className="flex gap-2">
            <button onClick={next} style={{ background: C.ink, color: C.paper }} className="text-xs font-medium px-3 py-1.5 rounded-lg">{stage === "enter" ? "Next" : "Save PIN"}</button>
            <button onClick={() => setSettingPin(false)} style={{ color: C.inkSoft, border: `1px solid ${C.line}` }} className="text-xs font-medium px-3 py-1.5 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {enabled && !settingPin && isBiometricAvailable() && (
        <div className="flex items-center justify-between">
          <span style={{ color: C.inkSoft }} className="text-xs">Face ID / Touch ID unlock</span>
          {bioRegistered ? (
            <span style={{ color: C.sage }} className="text-xs font-medium">Enabled</span>
          ) : (
            <button onClick={enableBiometric} style={{ color: C.sage }} className="text-xs font-medium underline underline-offset-2">Set up</button>
          )}
        </div>
      )}
      {bioError && <div role="alert" style={{ color: C.clay }} className="text-xs mt-2">{bioError}</div>}
      {enabled && !settingPin && (
        <button onClick={startSetup} style={{ color: C.inkSoft }} className="text-xs underline underline-offset-2 mt-3">Change PIN</button>
      )}
    </div>
  );
}
