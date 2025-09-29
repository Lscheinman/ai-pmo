import React, { useState, useEffect, useRef, useCallback } from "react";
import TagBadge from "./TagBadge";
import { useTags } from "../../context/TagsContext";

export default function TagSelector({
  value = [],
  onChange,
  style = {},
  objectType,
  objectId,
  tags: tagsProp,
  persist = true,                 // When false (filter mode), clear-all clears selected tag IDs
  inputClassName = "",
  placeholder = "Filter by tags…",
  showSelected = true,            // Hide chips in compact header use
}) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef();
  const searchTimeout = useRef();

  const {
    tags: contextTags,
    handleCreateTag,
    handleSetTagsForObject,
    handleRemoveTag
  } = useTags();

  const allTags = tagsProp ?? contextTags;
  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/\s+/g, "");

  const searchTags = useCallback(
    (query) => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }
      const q = norm(query);
      const filtered = allTags.filter(
        (tag) => !value.includes(tag.id) && norm(tag.name).includes(q)
      );
      setSuggestions(filtered);
    },
    [allTags, value]
  );

  useEffect(() => {
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchTags(input), 250);
    return () => clearTimeout(searchTimeout.current);
  }, [input, searchTags]);

  function clearAll() {
    setInput("");
    setSuggestions([]);
    setActiveIndex(-1);
    if (!persist) {
      onChange([]); // filter mode: clear selected tag IDs
    }
    inputRef.current?.focus();
  }

  async function handleAddTag(tag) {
    if (!value.includes(tag.id)) {
      const updated = [...value, tag.id];
      onChange(updated);
      if (persist && objectId) {
        await handleSetTagsForObject(objectType, objectId, updated);
      }
    }

    if (tagsProp && !tagsProp.some(t => t.id === tag.id)) {
      tagsProp.push(tag);
    }

    setInput("");
    setSuggestions([]);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function removeTag(tagId) {
    if (persist && objectId) {
      handleRemoveTag(objectType, objectId, value, tagId, onChange);
    } else {
      onChange(value.filter(id => id !== tagId));
    }
  }

  const displayedTags = (tagsProp ?? contextTags).filter((t) => value.includes(t.id));

  return (
    <div style={{ ...style, position: "relative" }}>
      <div className="input-with-x" style={{ display: "inline-block", width: "100%" }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={async (e) => {
            // Clear-all on Escape when input is empty (filter mode)
            if (e.key === "Escape") {
              if (!persist && !input && value.length > 0) {
                e.preventDefault();
                clearAll();
                return;
              }
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((prev) => Math.max(prev - 1, 0));
              return;
            }
            if (["Enter", ",", "Tab"].includes(e.key) || (e.key === " " && !input.includes(" "))) {
              e.preventDefault();

              if (activeIndex >= 0 && suggestions[activeIndex]) {
                handleAddTag(suggestions[activeIndex]);
                return;
              }

              const val = input.trim();
              if (!val) return;

              const match = allTags.find(
                (tag) => tag.name.toLowerCase() === val.toLowerCase()
              );
              if (match) {
                handleAddTag(match);
              } else {
                try {
                  const newTag = persist ? await handleCreateTag(val) : { id: Date.now(), name: val };
                  if (newTag) handleAddTag(newTag);
                } catch (err) {
                  console.error("Tag creation failed", err);
                }
              }
            }
          }}
          placeholder={placeholder}
          className={`filter-input ${inputClassName}`.trim()}
          style={{ width: "100%" }}
        />
        {(input || (!persist && value.length > 0)) && (
          <button
            type="button"
            className="input-clear-x"
            onClick={clearAll}
            aria-label={persist ? "Clear search" : "Clear tag filters"}
            title={persist ? "Clear search" : "Clear tag filters"}
          >
            ×
          </button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "calc(100% + 6px)",
            background: "#202632",
            borderRadius: 8,
            border: "1.5px solid #283043",
            boxShadow: "0 4px 18px rgba(0,0,0,0.3)",
            zIndex: 100,
            minWidth: 160,
            maxHeight: 240,
            overflowY: "auto"
          }}
        >
          {suggestions.map((tag, idx) => (
            <div
              key={tag.id}
              onClick={() => handleAddTag(tag)}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                background: idx === activeIndex ? "#2f3b52" : "transparent"
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {tag.name}
            </div>
          ))}
        </div>
      )}

      {showSelected && displayedTags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: 6 }}>
          {displayedTags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} onRemove={() => removeTag(tag.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
