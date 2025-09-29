// src/components/FilterInput.jsx
import React from "react";

export default function FilterInput({ value, onChange, placeholder, onFocus, onKeyDown }) {
  return (
    <div className="input-with-x">
      <input
        type="text"
        className="filter-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      />
      {value && (
        <button
          className="input-clear-x"
          title="Clear"
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear filter"
        >
          ×
        </button>
      )}
    </div>
  );
}