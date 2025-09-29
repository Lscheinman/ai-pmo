// components/chat/ChatMessage.jsx
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkEntityChips from "./remarkEntityChips";

export default function ChatMessage({
  type,
  text,                  // plain/markdown string that still contains task_12 etc.
  entityLabels = {},     // { "task_12": "Fix login bug", ... }
  onEntityClick,
  actions = [],
  onAction
}) {
  const isUser = type === "user";
  const [toast, setToast] = useState("");

  const handleClick = (id) => {
    onEntityClick?.(id);
    setToast(`Clicked ${id}`);
    const t = setTimeout(() => setToast(""), 1200);
    return () => clearTimeout(t);
  };

  return (
    <div className={`chat-message ${isUser ? "user" : "ai"}`}>
      <ReactMarkdown
        urlTransform={(url) => url}
        remarkPlugins={[[remarkEntityChips, { labels: entityLabels }]]}
        components={{
          "entity-chip": ({ node, children }) => {
            const id = node?.properties?.["data-entity-id"];
            const typ = node?.properties?.["data-entity-type"];
            return (
              <button
                type="button"
                className={`chat-chip chip--${typ}`}
                data-entity-id={id}
                data-entity-type={typ}
                onClick={() => handleClick(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClick(id);
                  }
                }}
                title={`Focus ${id}`}
                aria-label={`Focus ${id}`}
              >
                <span className="chip-dot" />
                {children /* label text */}
              </button>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>

      {Array.isArray(actions) && actions.length > 0 && (
        <div className="chat-actions">
          {actions.map((a, i) =>
            a.type === "mailto" ? (
              <a key={i} className="chat-action-btn" href={a.href} onClick={() => onAction?.(a)}>
                {a.label || "Open in Mail"}
              </a>
            ) : a.type === "download" ? (
              <a key={i} className="chat-action-btn" href={a.href} download={a.filename || "message.eml"} onClick={() => onAction?.(a)}>
                {a.label || "Download"}
              </a>
            ) : (
              <button key={i} className="chat-action-btn" onClick={() => onAction?.(a)}>
                {a.label || "Action"}
              </button>
            )
          )}
        </div>
      )}

      {toast && <div className="toast-mini">{toast}</div>}
    </div>
  );
}
