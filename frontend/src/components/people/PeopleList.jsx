import React, { useState } from "react";
import { getPeople, deletePerson } from "../../api/people";
import PersonModal from "./PersonModal";
import IconButton from "../buttons/IconButton";
import { DeleteIcon, CopyEmailIcon, AddIcon, InfoIcon } from "../icons";
import Card from "../Card";

// Toast hook
function useToast() {
  const [msg, setMsg] = useState("");
  function show(message, timeout = 2000) {
    setMsg(message);
    setTimeout(() => setMsg(""), timeout);
  }
  return [msg, show];
}

export default function PeopleList({ people, setPeople, onFocusPerson, onFocusMany }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [toast, showToast] = useToast();

  function handleAdd() {
    setSelectedPerson(null);
    setModalOpen(true);
  }

  function handleEdit(person) {
    // NEW: also focus this person in the graph
    onFocusPerson?.(person);
    setSelectedPerson(person);
    setModalOpen(true);
  }

  async function handleSave(saved) {
    try {
      if (saved?.id) {
        // optional: focus the person once (avoid focusing in multiple places)
        onFocusPerson?.(saved);
      }
      const fresh = await getPeople();
      setPeople(fresh);
    } finally {
      setModalOpen(false);
      setSelectedPerson(null);
    }
  }

  async function handleDelete(id) {
    if (window.confirm("Delete this person?")) {
      await deletePerson(id);
      getPeople().then(setPeople);
    }
  }

  function handleCopyEmail(email) {
    if (email) {
      navigator.clipboard.writeText(email);
      showToast("Email copied!");
    } else {
      showToast("No email to copy");
    }
  }

  // --- Filter logic ---
  const filteredPeople = people.filter((p) => {
    const f = filter.trim().toLowerCase();
    if (!f) return true;
    return (
      (p.name && p.name.toLowerCase().includes(f)) ||
      (p.email && p.email.toLowerCase().includes(f))
    );
  });

  // --- Multi-select helpers ---
  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const allVisible = new Set(filteredPeople.map((p) => p.id));
      const everySelected = filteredPeople.every((p) => prev.has(p.id));
      return everySelected
        ? new Set([...prev].filter((id) => !allVisible.has(id)))
        : new Set([...prev, ...allVisible]);
    });
  };

  const focusSelected = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    onFocusMany?.(ids);
    showToast(`Focused ${ids.length} ${ids.length === 1 ? "person" : "people"}`);
  };

  const allVisibleChecked =
    filteredPeople.length > 0 && filteredPeople.every((p) => selectedIds.has(p.id));
  const anySelected = selectedIds.size > 0;

  return (
    <Card
      title="People"
      filter={filter}
      onFilter={setFilter}
      actions={
        <>
          <IconButton
            icon={<AddIcon />}
            title="Add"
            variant="success"
            size={18}
            onClick={handleAdd}
          />
          <IconButton
            icon={<InfoIcon />}
            title="Focus selected in graph"
            variant="neutral"
            size={18}
            onClick={focusSelected}
            disabled={!anySelected}
          />
        </>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={allVisibleChecked}
            onChange={(e) => {
              e.stopPropagation();
              toggleAllVisible();
            }}
          />
          <span style={{ opacity: 0.8 }}>Select all shown</span>
        </label>
        {anySelected && (
          <span style={{ opacity: 0.7, fontWeight: 600 }}>
            {selectedIds.size} selected
          </span>
        )}
      </div>

      <table className="project-table">
        <tbody>
          {filteredPeople.map((person) => (
            <tr
              key={person.id}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                if (!(e.target instanceof HTMLElement)) return;
                const tag = e.target.tagName.toLowerCase();
                // Only row-click (not controls) opens + focuses
                if (tag !== "button" && tag !== "svg" && tag !== "path" && tag !== "input") {
                  handleEdit(person); // focuses graph + opens modal
                }
              }}
            >
              <td style={{ whiteSpace: "nowrap" }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(person.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleOne(person.id);
                  }}
                  style={{ marginRight: 8 }}
                />
                <IconButton
                  icon={<InfoIcon />}
                  title="Focus in graph"
                  variant="neutral"
                  size={18}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusPerson?.(person);
                    showToast(`Focused ${person.name || person.email}`);
                  }}
                />
                <IconButton
                  icon={<CopyEmailIcon />}
                  title="Copy email"
                  variant="neutral"
                  size={18}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyEmail(person.email);
                  }}
                />
                <IconButton
                  icon={<DeleteIcon />}
                  title="Delete"
                  variant="danger"
                  size={18}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(person.id);
                  }}
                />
              </td>
              <td>
                <div style={{ fontWeight: 700 }}>{person.name || "(no name)"}</div>
                <div style={{ opacity: 0.8 }}>{person.email}</div>
              </td>
            </tr>
          ))}
          {filteredPeople.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: "center", color: "#777" }}>
                No people
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <PersonModal
        open={modalOpen}
        person={selectedPerson}
        onSave={handleSave}
        onClose={() => setModalOpen(false)}
      />

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#242b39",
            color: "#fff",
            borderRadius: 7,
            padding: "0.85em 2em",
            zIndex: 10000,
            boxShadow: "0 2px 24px #0004",
            fontWeight: 700,
            fontSize: "1.02em",
          }}
        >
          {toast}
        </div>
      )}
    </Card>
  );
}
