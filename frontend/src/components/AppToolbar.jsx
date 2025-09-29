import React, { useState, useRef } from "react";
import IconButton from "./buttons/IconButton";
import { SendIcon } from "./icons";
import FilterInput from "./FilterInput";
import ChatDropdown from "./chat/ChatDropdown";

export default function AppToolbar({
  onSendChat,
  handleEntityClick,
  onChatAction,
  chatOpen,
  setChatOpen,
  chatHistory,
}) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef();

  const handleSend = async () => {
    const text = message.trim();
    if (!text) return;

    setMessage("");
    setLoading(true);
    if (!chatOpen) setChatOpen(true);

    try {
      // App's onSendChat handles pushing user + ai turns into App chatHistory
      await onSendChat?.(text);
    } catch (err) {
      // optionally: you could surface an error message as a system turn
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputFocus = () => {
    if (chatHistory?.length > 0) setChatOpen(true);
  };

  return (
    <div className="app-toolbar">
      <div className="app-toolbar-left">
        <h1 className="app-title">Project Management Office</h1>
      </div>
      <div className="app-toolbar-right">
        <div className="chat-input-wrapper horizontal">
          <FilterInput
            ref={inputRef}
            value={message}
            onChange={setMessage}
            onFocus={handleInputFocus}
            placeholder="Chat with PMO..."
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
          />
          <IconButton icon={<SendIcon />} title="Send" onClick={handleSend} />
        </div>

        <ChatDropdown
          visible={!!chatOpen}
          messages={chatHistory || []}
          loading={loading}
          onClose={() => setChatOpen(false)}
          handleEntityClick={handleEntityClick}
          onAction={onChatAction}
        />
      </div>
    </div>
  );
}
