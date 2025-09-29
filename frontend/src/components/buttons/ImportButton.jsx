// src/components/buttons/ImportButton.jsx
import React from "react";

export default function ImportButton({ onFile }) {
  return (
    <label className="icon-btn" title="Import Excel">
      <svg
        width="22" height="22"
        stroke="currentColor" fill="none" strokeWidth="2"
        viewBox="0 0 24 24" aria-hidden="true"
      >
        {/* Upward arrow */}
        <path d="M12 19V5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <input
        type="file"
        accept=".xls,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        style={{ display: "none" }}
        onChange={e => {
          if (e.target.files && e.target.files[0]) onFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <span className="sr-only">Import Excel</span>
    </label>
  );
}
