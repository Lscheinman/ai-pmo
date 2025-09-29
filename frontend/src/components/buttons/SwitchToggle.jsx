import React from "react";

export default function SwitchToggle({ options, value, onChange }) {
  return (
    <div className="switch-toggle">
      {options.map(opt => (
        <button
          key={opt.key}
          className={`switch-btn${value === opt.key ? " active" : ""}`}
          type="button"
          onClick={() => onChange(opt.key)}
          aria-pressed={value === opt.key}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
