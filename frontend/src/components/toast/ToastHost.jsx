import React, { useEffect, useState } from "react";
import { subscribe, clickAction, dismissToast } from "./toastBus";

export default function ToastHost() {
  const [toasts, setToasts] = useState([]); // [{ id, type, message, persist, duration, actions, _resolve }]

  useEffect(() => {
    return subscribe((evt) => {
      if (evt.kind === "add") {
        const t = evt.toast;
        setToasts((arr) => [...arr, t]);

        // auto-dismiss if not persistent
        if (!t.persist) {
          const timer = setTimeout(() => {
            t._resolve?.(null);
            setToasts((arr) => arr.filter((x) => x.id !== t.id));
          }, Math.max(1200, t.duration || 2800));
          t._timer = timer;
        }
      }

      if (evt.kind === "dismiss") {
        setToasts((arr) => {
          const t = arr.find((x) => x.id === evt.toastId);
          if (t) {
            if (t._timer) clearTimeout(t._timer);
            t._resolve?.(null);
          }
          return arr.filter((x) => x.id !== evt.toastId);
        });
      }

      if (evt.kind === "action") {
        setToasts((arr) => {
          const t = arr.find((x) => x.id === evt.toastId);
          if (t) {
            if (t._timer) clearTimeout(t._timer);
            t._resolve?.(evt.actionId);
          }
          return arr.filter((x) => x.id !== evt.toastId);
        });
      }
    });
  }, []);

  if (!toasts.length) return null;

  return (
    <div
      className="toast-stack"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        display: "grid",
        gap: 8,
        zIndex: 9999,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          role="status"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "center",
            gap: 10,
            minWidth: 280,
            maxWidth: 420,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border, #333)",
            background: "var(--panel, #111)",
            color: "var(--text, #eaeaea)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 600, opacity: 0.95 }}>
              {iconFor(t.type)} {t.message}
            </div>

            {Array.isArray(t.actions) && t.actions.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {t.actions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => clickAction(t.id, a.id)}
                    className="toast-action-btn"
                    style={btnStyle(a.variant)}
                  >
                    {a.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="toast-action-btn"
                  style={btnStyle("ghost")}
                  aria-label="Dismiss"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* X button */}
          {!t.actions?.length && (
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              style={{
                all: "unset",
                cursor: "pointer",
                opacity: 0.8,
                padding: 4,
                lineHeight: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function iconFor(type) {
  if (type === "success") return "✔️";
  if (type === "error")   return "⚠️";
  if (type === "info")    return "ℹ️";
  return "•";
}

function btnStyle(variant) {
  const base = {
    padding: "6px 10px",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
    border: "1px solid var(--border, #333)",
    background: "transparent",
    color: "var(--text, #eaeaea)",
  };
  if (variant === "primary") {
    return { ...base, borderColor: "var(--accent, #2ae98d)", color: "var(--accent, #2ae98d)" };
  }
  if (variant === "danger") {
    return { ...base, borderColor: "var(--danger, #ff5d5d)", color: "var(--danger, #ff5d5d)" };
  }
  return base; // ghost/neutral
}
