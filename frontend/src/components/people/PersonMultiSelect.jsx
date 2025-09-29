// src/components/people/PersonMultiSelect.jsx
import React, { useState } from "react";

export default function PersonMultiSelect({
  people = [],
  value = [],
  onChange,
  label = "Select People",
  searchPlaceholder = "Search people…",
  minHeight = 80,
  maxHeight = 150,
  style = {},
}) {
  const [search, setSearch] = useState("");

  const filteredPeople = people.filter(
    p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  );

  function handleToggle(personId) {
    if (value.includes(personId)) {
      onChange(value.filter(id => id !== personId));
    } else {
      onChange([...value, personId]);
    }
  }

  return (
    <label style={{ display: "block", ...style }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 7 }}>
        {label}
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1,
            marginLeft: 12,
            borderRadius: 7,
            border: "1.7px solid #242b39",
            padding: "0.44em 1em",
            background: "#202632",
            color: "#f3f6fc",
            fontSize: "1em"
          }}
        />
      </div>
      <div style={{
        minHeight, maxHeight, overflowY: "auto", marginTop: 3, marginBottom: 2,
        border: "1.2px solid #232c3b", borderRadius: 8,
        background: "#181c22", padding: 7
      }}>
        {filteredPeople.length === 0 &&
          <span style={{ color: "#888" }}>No matching people</span>
        }
        {filteredPeople.map(person =>
          <div
            key={person.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 6,
              padding: "2.5px 0",
              cursor: "pointer",
              userSelect: "none"
            }}
            onClick={() => handleToggle(person.id)}
          >
            <input
              type="checkbox"
              checked={value.includes(person.id)}
              onChange={() => handleToggle(person.id)}
              style={{
                accentColor: "#2ae98d",
                width: 18,
                height: 18,
                borderRadius: 5,
                margin: 0,
                marginRight: 6
              }}
              onClick={e => e.stopPropagation()}
            />
            <span>
              <span style={{ fontWeight: 600 }}>{person.name}</span>
              <span style={{ color: "#aaa", marginLeft: 6, fontSize: "0.98em" }}>
                ({person.email})
              </span>
            </span>
          </div>
        )}
      </div>
    </label>
  );
}
