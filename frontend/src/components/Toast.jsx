import React, { useEffect } from "react";

/**
 * Props:
 * - message: string
 * - type: "success" | "error" | "info" | "warning"
 * - onClose: () => void
 * - duration: number (ignored if persist=true)
 * - actions: [{ id: string, label: string, variant?: "neutral"|"primary"|"danger" }]
 * - persist: boolean (if true, won't auto-dismiss)
 */
export default function Toast({
  message,
  type = "success",
  onClose,
  duration = 2800,
  actions = [],
  persist = false,
}) {
  useEffect(() => {
    if (!message || persist) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose, persist]);

  if (!message) return null;

  const icon = {
    success: "✔️",
    error: "⚠️",
    info: "ℹ️",
    warning: "⚠️",
  }[type] || "✔️";

  return (
    <div className={`toast toast-${type}`} role="status" aria-live="polite">
      <span className="toast-icon" aria-hidden="true">{icon}</span>
      <span className="toast-message">{message}</span>

      {actions?.length > 0 && (
        <div className="toast-actions">
          {actions.map(a => (
            <button
              key={a.id}
              type="button"
              className={`toast-btn ${a.variant || "neutral"}`}
              onClick={() => onClose?.(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
