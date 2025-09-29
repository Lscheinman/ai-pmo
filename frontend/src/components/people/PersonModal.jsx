// frontend/src/components/people/PersonModal.jsx
import React, { useState, useEffect, useRef } from "react";
import Modal from "../Modal";
import TagSelector from "../tags/TagsSelector";
import IconButton from "../buttons/IconButton";
import { SaveIcon, ClipboardCheckIcon } from "../icons";
import {
  createPerson, updatePerson, getPersonById, getPeople,
  getPersonRelations, createPersonRelation, deletePersonRelation
} from "../../api/people";
import RelationshipAssigner from "./RelationshipAssigner";

const defaultForm = {
  name: "",
  email: "",
  notes: "",
  tag_ids: [],
  tags: [],
  id: null,
  relations: []
};

// ---- Relationship helpers (unchanged) ----
function relKeyToEdges(meId, otherId, key) {
  switch (key) {
    case "manages":        return [{ from: meId,    to: otherId, type: "manages" }];
    case "is_managed_by":  return [{ from: otherId, to: meId,    type: "manages" }];
    case "mentors":        return [{ from: meId,    to: otherId, type: "mentor"  }];
    case "is_mentored_by": return [{ from: otherId, to: meId,    type: "mentor"  }];
    case "peer":           return [
      { from: meId,        to: otherId, type: "peer" },
      { from: otherId,     to: meId,    type: "peer" },
    ];
    case "co_located":     return [
      { from: meId,        to: otherId, type: "co_located" },
      { from: otherId,     to: meId,    type: "co_located" },
    ];
    default:               return [];
  }
}
function edgesFromSelection(meId, selMap) {
  const out = [];
  for (const [pidStr, keys] of Object.entries(selMap || {})) {
    const other = Number(pidStr);
    const set = new Set(keys || []);
    for (const key of set) out.push(...relKeyToEdges(meId, other, key));
  }
  return out;
}
function baselineEdgesWithIds(relations) {
  const edges = [];
  const byKey = new Map();
  for (const r of relations || []) {
    const e = { from: r.from_person_id, to: r.to_person_id, type: r.type, id: r.id };
    const key = `${e.from}:${e.to}:${e.type}`;
    edges.push(e);
    byKey.set(key, e);
  }
  return { edges, byKey };
}
function selectionFromRelations(meId, relations) {
  const map = {};
  for (const r of relations || []) {
    const isFromMe = Number(r.from_person_id) === Number(meId);
    const isToMe   = Number(r.to_person_id) === Number(meId);
    if (!isFromMe && !isToMe) continue;
    const other = isFromMe ? Number(r.to_person_id) : Number(r.from_person_id);
    const key =
      r.type === "manages"
        ? (isFromMe ? "manages" : "is_managed_by")
      : r.type === "mentor"
        ? (isFromMe ? "mentors" : "is_mentored_by")
      : r.type === "peer"
        ? "peer"
      : r.type === "co_located"
        ? "co_located"
      : null;
    if (!key) continue;
    const arr = map[String(other)] || [];
    if (!arr.includes(key)) arr.push(key);
    map[String(other)] = arr;
  }
  return map;
}

// ---- Clipboard parsing helpers ----
const EMAIL_RE = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
const GENERIC_TOKENS = new Set([
  "info","admin","team","support","contact","hello","hi","hey","mail",
  "office","sales","hr","recruit","careers","noreply","no-reply","newsletter"
]);

function titleCase(s) {
  return s
    .split(/\s+/)
    .map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)
    .join(" ")
    .trim();
}

function guessNameFromEmail(email) {
  if (!email) return "";
  const local = email.split("@")[0] || "";
  let base = local.split("+")[0].replace(/\d+/g, "");
  let parts = base.split(/[._-]+/).filter(Boolean);
  parts = parts.filter(p => !GENERIC_TOKENS.has(p.toLowerCase()));
  if (parts.length >= 2) {
    const first = parts[0];
    const last  = parts[parts.length - 1];
    return titleCase(`${first} ${last}`);
  }
  if (parts.length === 1) return titleCase(parts[0]);
  return "";
}

function parseClipboard(text) {
  if (!text) return { email: "", name: "" };
  const emailMatch = text.match(EMAIL_RE);
  const email = emailMatch ? emailMatch[1].trim() : "";
  if (!email) return { email: "", name: "" };

  const withoutEmail = text.replace(email, "").replace(/[<>()]/g, " ").replace(/\s+/g, " ").trim();

  let name = "";
  if (withoutEmail) {
    const comma = withoutEmail.match(/^\s*([^,]+),\s*([^,]+)\s*$/);
    if (comma) {
      name = titleCase(`${comma[2]} ${comma[1]}`);
    } else {
      const words = withoutEmail.split(/\s+/).filter(Boolean);
      if (words.length >= 2) name = titleCase(`${words[0]} ${words[1]}`);
      else if (words.length === 1) name = titleCase(words[0]);
    }
  }
  if (!name) name = guessNameFromEmail(email);
  return { email, name };
}

async function readClipboardText() {
  try {
    if (!navigator?.clipboard?.readText) return "";
    const txt = await navigator.clipboard.readText();
    return (txt || "").trim();
  } catch (err) {
    console.log("[PersonModal] navigator.clipboard.readText() failed:", err);
    return "";
  }
}

export default function PersonModal({
  open,
  person,
  onSave,
  onClose,
  handleRemoveTag,
  setToast
}) {
  const [form, setForm] = useState(defaultForm);
  const [allPeople, setAllPeople] = useState([]);
  const [stagedRels, setStagedRels] = useState({});
  const clipTriedRef = useRef(false); // reset on each open

  // Load person & relationships + reset clipboard guard when opening
  useEffect(() => {
    async function loadPersonData() {
      if (!open) return;

      console.log("[PersonModal] open changed →", open, person?.id ? "Edit" : "Add");
      clipTriedRef.current = false; // <-- reset once per open

      if (person?.id) {
        try {
          console.log("[PersonModal] loading person id:", person.id);
          const latest = await getPersonById(person.id);
          const personTags = Array.isArray(latest.tags) ? latest.tags : [];
          const personTagIds = personTags.map(t => t.id);
          const [rels, everyone] = await Promise.all([
            getPersonRelations(person.id).catch(() => []),
            getPeople().catch(() => [])
          ]);
          setForm({
            ...defaultForm,
            ...latest,
            tag_ids: personTagIds,
            tags: personTags,
            id: latest.id || null,
            relations: rels || []
          });
          setAllPeople(everyone || []);
          setStagedRels(selectionFromRelations(latest.id, rels || []));
        } catch (err) {
          console.error("[PersonModal] Failed to load person", err);
        }
      } else {
        console.log("[PersonModal] reset form for Add Person");
        setForm(defaultForm);
      }
    }
    loadPersonData();
  }, [open, person?.id]);

  // Prefill from clipboard once per open (Add Person only)
  useEffect(() => {
    if (!open || person?.id) return;
    if (clipTriedRef.current) {
      console.log("[PersonModal] prefill: already tried this open; skip");
      return;
    }
    clipTriedRef.current = true;

    const tryPrefill = async () => {
      console.log("[PersonModal] prefill: start");
      try {
        const perm = await navigator.permissions?.query?.({ name: "clipboard-read" });
        if (perm) console.log("[PersonModal] permissions.clipboard-read:", perm.state);
      // eslint-disable-next-line no-unused-vars
      } catch (_) { /* empty */ }

      const txt = await readClipboardText();
      console.log("[PersonModal] prefill readClipboardText:", txt ? `(len=${txt.length})` : "(empty)");
      if (!txt) return;

      const { email, name } = parseClipboard(txt);
      console.log("[PersonModal] prefill parsed:", { email, name });
      if (!email) return;

      setForm(prev => {
        const next = {
          ...prev,
          email: prev.email || email,
          name:  prev.name  || name
        };
        console.log("[PersonModal] prefill setForm from:", prev, "to:", next);
        return next;
      });
      setToast?.({ message: "Pre-filled from clipboard", type: "success" });
    };

    // Run after the current tick so defaultForm has applied
    const t = setTimeout(tryPrefill, 0);
    return () => clearTimeout(t);
  }, [open, person?.id, setToast]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      const payload = {
        name: form.name,
        email: form.email,
        notes: form.notes,
        tag_ids: form.tag_ids || [],
      };
      const saved = form.id
        ? await updatePerson(form.id, payload)
        : await createPerson(payload);

      const meId = Number(saved.id);

      const { edges: baseline } = baselineEdgesWithIds(form.relations || []);
      const staged = edgesFromSelection(meId, stagedRels);

      const baselineKeys = new Set(baseline.map(e => `${e.from}:${e.to}:${e.type}`));
      const stagedKeys   = new Set(staged.map(e => `${e.from}:${e.to}:${e.type}`));

      const toCreate = staged.filter(e => !baselineKeys.has(`${e.from}:${e.to}:${e.type}`));
      const toDelete = baseline.filter(e => !stagedKeys.has(`${e.from}:${e.to}:${e.type}`));

      await Promise.all([
        ...toCreate.map(e =>
          createPersonRelation(Number(e.from), { to_person_id: Number(e.to), type: e.type })
        ),
        ...toDelete.map(e => deletePersonRelation(e.id)),
      ]);

      onSave && onSave(saved);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save person/relationships");
    }
  }

  // Gesture-based explicit clipboard read (always allowed)
  async function handleUseClipboard() {
    console.log("[PersonModal] UseClipboard clicked");
    const txt = await readClipboardText();
    console.log("[PersonModal] UseClipboard readClipboardText:", txt ? `(len=${txt.length})` : "(empty)");
    if (!txt) {
      setToast?.({ message: "Clipboard is empty or blocked", type: "warning" });
      return;
    }
    const { email, name } = parseClipboard(txt);
    console.log("[PersonModal] UseClipboard parsed:", { email, name });
    if (!email) {
      setToast?.({ message: "No email found in clipboard", type: "warning" });
      return;
    }
    setForm(f => ({
      ...f,
      email: f.email || email,
      name:  f.name  || name
    }));
    setToast?.({ message: "Pre-filled from clipboard", type: "success" });
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      title={person ? "Edit Person" : "Add Person"}
      actions={
        <IconButton
          icon={<SaveIcon />}
          title="Save Person"
          variant="neutral"
          size={18}
          onClick={handleSave}
        />
      }
      onClose={onClose}
    >
      <form onSubmit={handleSave} className="form-grid">
        <label>
          Name
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            autoFocus
          />
        </label>

        <label>
          Email
          <div className="form-row" style={{ gap: 8, alignItems: "center" }}>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              onFocus={async () => {
                console.log("[PersonModal] email input onFocus → try clipboard");
                const txt = await readClipboardText();
                console.log("[PersonModal] onFocus readClipboardText:", txt ? `(len=${txt.length})` : "(empty)");
                if (!txt) return;
                const { email, name } = parseClipboard(txt);
                console.log("[PersonModal] onFocus parsed:", { email, name });
                if (!email) return;
                setForm(f => ({ ...f, email: f.email || email, name: f.name || name }));
                setToast?.({ message: "Pre-filled from clipboard", type: "success" });
              }}
            />
            <IconButton
              icon={<ClipboardCheckIcon />}
              title="Use clipboard"
              variant="neutral"
              size={16}
              onClick={handleUseClipboard}
              aria-label="Use clipboard"
            />
          </div>
        </label>

        <label>
          Notes
          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            rows={2}
          />
        </label>

        <label>
          Tags
          <TagSelector
            value={form.tag_ids}
            onChange={(tag_ids) => {
              const selectedTags = (form.tags.length > 0 ? form.tags : person?.tags || [])
                .filter(t => tag_ids.includes(t.id));
              setForm(f => ({ ...f, tag_ids, tags: selectedTags }));
            }}
            objectType="Person"
            objectId={form.id}
            tags={form.tags}
            onRemoveTag={async (tagId) => {
              try {
                await handleRemoveTag("Person", form.id, form.tags, tagId);
                const refreshed = await getPersonById(form.id);
                setForm(f => ({ ...f, tag_ids: refreshed.tags?.map(t => t.id) || [], tags: refreshed.tags || [] }));
              } catch (err) {
                console.error("Failed to remove tag", err);
              }
            }}
          />
        </label>

        <label>
          Relationships
          <RelationshipAssigner
            meId={form.id}
            people={allPeople}
            value={stagedRels}
            onChange={setStagedRels}
            existingRelations={form.relations || []}
          />
        </label>
      </form>
    </Modal>
  );
}
