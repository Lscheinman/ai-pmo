import React from "react";
import FilterInput from "./FilterInput";

export default function Card({ title, actions, filter, onFilter, children, style = {}, className = "" }) {
  return (
    <div className={`app-card ${className}`} style={style}>
      <div className="app-card-header">
        <div className="app-card-actions">{actions}</div>
        {filter !== undefined && (
          <FilterInput
            value={filter}
            onChange={onFilter}
            placeholder={`Filter ${title.toLowerCase()}...`}
          />
        )}
      </div>
      <div className="app-card-body">{children}</div>
    </div>
  );
}
