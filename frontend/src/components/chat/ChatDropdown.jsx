import React, { useEffect, useRef } from "react";
import ChatMessage from "./ChatMessage";
import IconButton from "../buttons/IconButton";
import { ChevronDownIcon } from "../icons";

export default function ChatDropdown({ visible, messages, loading, onClose, handleEntityClick, onAction }) {
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  if (!visible) return null;

  return (
    <div className="chat-dropdown">
      <div className="chat-dropdown-header">
        <IconButton
            icon={<ChevronDownIcon />}
            title="Hide chat"
            onClick={onClose}
            className="chat-close-btn"
            variant="neutral"
        />
      </div>

      <div className="chat-history">
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            type={msg.type}
            text={msg.text}
            onEntityClick={handleEntityClick}
            entityLabels={msg.entityLabels /* or a global map */}
            onAction={onAction}
            actions={msg.actions}
          />
        ))}
        {loading && (
        <div className="chat-message ai typing-indicator">
            <span>
            AI is thinking<span className="dot">.</span>
            <span className="dot">.</span>
            <span className="dot">.</span>
            </span>
        </div>
        )}
        <div ref={chatEndRef} />
      </div>
    </div>
  );
}
