import React, { useMemo, useState } from "react";
import IconButton from "../buttons/IconButton";
import { AddIcon } from "../icons";

/**
 * Relationship options (relative to the focused person "me")
 * Chips are staged only; no API calls here.
 */
const REL_OPTIONS = [
  { key: "manages",         label: "manages" },
  { key: "is_managed_by",   label: "is managed by" },
  { key: "mentors",         label: "mentors" },
  { key: "is_mentored_by",  label: "is mentored by" },
  { key: "peer",            label: "peer" },
  { key: "co_located",      label: "co-located" },
];

const REL_COLORS = {
  manages: "#00a656",
  is_managed_by: "#0077ff",
  mentors: "#d49904",
  is_mentored_by: "#7e19f3",
  peer: "#8a8f98",
  co_located: "#2ae98d",
};

/**
 * Controlled component.
 * Props:
 * - meId: number (focused person)
 * - people: all people [{id,name,email}]
 * - value: { [personId]: string[] }  // relKeys selected per person
 * - onChange(nextMap)
 * - existingRelations: raw relations from server (optional; only used to compute assigned rows union)
 */
export default function RelationshipAssigner({
  meId,
  people = [],
  value = {},
  onChange,
  existingRelations = [],
}) {
  const [search, setSearch] = useState("");

  const valueKeys = useMemo(() => new Set(Object.keys(value).map(k => Number(k))), [value]);

  // people who already have any saved relation with me (for rows even if staged empty)
  const existingPeers = useMemo(() => {
    const ids = new Set();
    for (const r of existingRelations) {
      const other =
        Number(r.from_person_id) === Number(meId) ? Number(r.to_person_id) :
        Number(r.to_person_id) === Number(meId) ? Number(r.from_person_id) : null;
      if (other != null) ids.add(other);
    }
    return ids;
  }, [existingRelations, meId]);

  // rows to show = union of staged people + existing related people
  const assignedPeople = useMemo(() => {
    const ids = new Set([...valueKeys, ...existingPeers]);
    return [...ids]
      .map(id => people.find(p => Number(p.id) === Number(id)))
      .filter(Boolean);
  }, [valueKeys, existingPeers, people]);

  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return people.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q)
    );
  }, [people, search]);

  function setPersonKeys(personId, nextSet) {
    const pid = String(personId);
    const arr = Array.from(nextSet);
    if (arr.length === 0) {
      // if they have no existing saved relations, remove row entirely
      if (!existingPeers.has(Number(personId))) {
        const { [pid]: _, ...rest } = value;
        onChange?.(rest);
        return;
      }
      // otherwise keep empty array (shows row with no staged chips)
      onChange?.({ ...value, [pid]: [] });
      return;
    }
    onChange?.({ ...value, [pid]: arr });
  }

  function toggleChip(personId, relKey, evt) {
    const current = new Set(value[String(personId)] || []);
    if (evt?.shiftKey) {
      // multi-select toggle
      if (current.has(relKey)) current.delete(relKey);
      else current.add(relKey);
      setPersonKeys(personId, current);
    } else {
      // single-select: click again to clear
      if (current.size === 1 && current.has(relKey)) {
        current.clear();
      } else {
        current.clear();
        current.add(relKey);
      }
      setPersonKeys(personId, current);
    }
  }

  function addPersonWithDefault(person) {
    const pid = String(person.id);
    // default to "manages" only
    const current = new Set(value[pid] || []);
    current.add("manages");
    onChange?.({ ...value, [pid]: Array.from(current) });
    setSearch("");
  }

  function removePersonRow(personId) {
    const pid = String(personId);
    const { [pid]: _, ...rest } = value;
    onChange?.(rest);
  }

  return (
    <div style={{ width: "100%" }}>
      {/* Toolbar: search & add */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Add/search people…"
          className="modal-input"
          style={{
            flex: 1,
            borderRadius: 7,
            border: "1.7px solid #242b39",
            background: "#232c3b",
            color: "#f3f6fc",
            padding: "0.45em 0.9em",
            fontSize: "1em",
          }}
        />
        <IconButton
          icon={<AddIcon />}
          title="Add person (default: manages)"
          variant="success"
          size={18}
          onClick={() => {
            const p = filteredPeople[0];
            if (p) addPersonWithDefault(p);
          }}
        />
      </div>

      {/* Search results */}
      {search && filteredPeople.length > 0 && (
        <div
          style={{
            maxHeight: 120,
            overflowY: "auto",
            border: "1.1px solid #232c3b",
            borderRadius: 8,
            background: "#181c22",
            padding: 6,
            marginBottom: 7,
          }}
        >
          {filteredPeople.slice(0, 12).map((person) => (
            <div
              key={person.id}
              onClick={() => addPersonWithDefault(person)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "4px 0",
                cursor: "pointer",
              }}
              title="Add with default: manages"
            >
              <span style={{ fontWeight: 600 }}>{person.name}</span>
              {person.email && (
                <span style={{ color: "#aaa", fontSize: "0.96em" }}>({person.email})</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Assigned table (compact) */}
      {assignedPeople.length > 0 ? (
        <div
          style={{
            width: "100%",
            display: "table",
            marginTop: 6,
            borderCollapse: "separate",
            borderSpacing: "0 2px",
          }}
        >
          {assignedPeople.map((p) => {
            const selected = new Set(value[String(p.id)] || []);
            return (
              <div key={p.id} style={{ display: "table-row", background: "#22262b", borderRadius: 7 }}>
                {/* Person cell */}
                <div
                  style={{
                    display: "table-cell",
                    padding: "6px 8px",
                    verticalAlign: "middle",
                    minWidth: 140,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "1em", color: "#fff" }}>{p.name}</div>
                  <div style={{ fontSize: "0.92em", color: "#bbb" }}>{p.email}</div>
                </div>

                {/* Chips cell */}
                <div
                  style={{
                    display: "table-cell",
                    verticalAlign: "middle",
                    padding: "6px 8px",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {REL_OPTIONS.map((opt) => {
                      const active = selected.has(opt.key);
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={(e) => toggleChip(p.id, opt.key, e)}
                          style={{
                            borderRadius: 13,
                            border: "1px solid #2b3446",
                            padding: "2px 10px",
                            fontSize: "0.92em",
                            fontWeight: 600,
                            background: active ? REL_COLORS[opt.key] : "#181c22",
                            color: active ? "#222b2e" : "#cdd3df",
                            cursor: "pointer",
                            lineHeight: 1.6,
                          }}
                          title={opt.label + " (Shift for multi-select)"}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Remove row */}
                <div
                  style={{
                    display: "table-cell",
                    textAlign: "right",
                    verticalAlign: "middle",
                    paddingRight: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => removePersonRow(p.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#d66",
                      fontSize: 17,
                      cursor: "pointer",
                    }}
                    title="Remove staged relations row"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ color: "#999", marginTop: 6 }}>None staged</div>
      )}
    </div>
  );
}
