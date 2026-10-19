import React, { useEffect, useRef, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { LockSettings } from "./AppLock";
import { api } from "./api";

// Opens from the shield icon in the top bar. Bottom sheet on phones, centred
// panel on larger screens. Escape, the close button, or tapping outside close
// it, and keyboard focus stays inside while it is open.
export default function SecurityDialog({ C, token, onClose, notifStatus, notifBusy, notifError, onEnableNotifications }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [testMsg, setTestMsg] = useState("");
  const [testBusy, setTestBusy] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const nodes = panelRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function sendTest() {
    setTestBusy(true);
    setTestMsg("");
    try {
      const r = await api.sendTestPush(token);
      if (!r.configured) setTestMsg("Notifications are not set up on the server yet.");
      else if (r.devices === 0) setTestMsg("This device is not subscribed yet. Turn notifications on first.");
      else setTestMsg("Test sent. It should appear in a few seconds.");
    } catch (e) {
      setTestMsg(e.message || "Could not send the test.");
    } finally {
      setTestBusy(false);
    }
  }

  const outlineBtn = { color: C.ink, border: `1px solid ${C.line}`, background: C.paper };

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{ background: C.overlay, zIndex: 55 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="security-dialog-title"
        style={{ background: C.card, border: `1px solid ${C.line}`, paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        className="w-full sm:max-w-md rounded-t-xl sm:rounded-xl p-5 max-h-[85vh] overflow-y-auto shadow-lg"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} style={{ color: C.sage }} aria-hidden="true" />
            <h2 id="security-dialog-title" className="text-sm font-semibold">Security and notifications</h2>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close" style={{ color: C.inkSoft }} className="ft-focus p-1.5 rounded-lg hover:opacity-70 focus:outline-none">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <LockSettings C={C} />

        <div style={{ borderTop: `1px solid ${C.line}` }} className="mt-5 pt-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span style={{ color: C.ink }} className="text-sm">Budget alerts</span>
            {notifStatus === "granted" && (
              <span style={{ color: C.sage }} className="text-xs font-medium">On</span>
            )}
            {notifStatus === "default" && (
              <button onClick={onEnableNotifications} disabled={notifBusy} style={outlineBtn} className="ft-focus text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-80 focus:outline-none disabled:opacity-60">
                {notifBusy ? "Turning on…" : "Turn on"}
              </button>
            )}
          </div>
          <p style={{ color: C.inkSoft }} className="text-xs">
            Get a phone notification when a budget reaches 80% or goes over, even when the app is closed.
          </p>
          {notifStatus === "denied" && (
            <p style={{ color: C.clay }} className="text-xs mt-2">
              Notifications are blocked for Tally. Allow them in your phone's settings, then come back here.
            </p>
          )}
          {notifStatus === "unsupported" && (
            <p style={{ color: C.inkSoft }} className="text-xs mt-2">
              This browser cannot receive them. On iPhone, add Tally to your Home Screen, open it from the icon (iOS 16.4 or newer), then return here.
            </p>
          )}
          {notifError && <div role="alert" style={{ color: C.clay }} className="text-xs mt-2">{notifError}</div>}
          {notifStatus === "granted" && (
            <div className="mt-3">
              <button onClick={sendTest} disabled={testBusy} style={outlineBtn} className="ft-focus text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-80 focus:outline-none disabled:opacity-60">
                {testBusy ? "Sending…" : "Send a test notification"}
              </button>
              {testMsg && <div role="status" style={{ color: C.inkSoft }} className="text-xs mt-2">{testMsg}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
