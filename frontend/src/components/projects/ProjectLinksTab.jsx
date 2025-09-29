import React, { useEffect, useMemo, useState, useCallback } from "react";
import IconButton from "../buttons/IconButton";
import {
  AddIcon,
  TrashIcon,
  EditIcon,
  CheckIcon,
  CloseIcon,
  SearchIcon,
  MoreIcon,
  ClipboardCheckIcon,
  CopyIcon
} from "../icons";
import {
  getProjectLinks,
  createProjectLink,
  updateProjectLink,
  deleteProjectLink,
} from "../../api/projectLinks";

// ---------- utils ----------
function normalizeUrl(s) {
  s = (s || "").trim();
  if (!s) return s;
  if (!/^https?:\/\//i.test(s)) return "https://" + s;
  return s;
}
function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
// light inference to reduce typing
function inferKind(url) {
  const host = hostnameOf(url);
  const u = url || "";
  if (/github\.com/i.test(host)) return "repo";
  if (/gitlab\.com/i.test(host)) return "repo";
  if (/bitbucket\.org/i.test(host)) return "repo";
  if (/docs\.google\.com\/spreadsheets/i.test(u)) return "sheet";
  if (/docs\.google\.com\/document/i.test(u)) return "doc";
  if (/docs\.google\.com\/presentation/i.test(u)) return "slides";
  if (/figma\.com/i.test(host)) return "design";
  if (/notion\.so/i.test(host)) return "doc";
  if (/confluence/i.test(host)) return "wiki";
  if (/jira|atlassian\.net/i.test(host)) return "issue";
  return "";
}

export default function ProjectLinksTab({ projectId, notify, onCountChange }) {
  const [links, setLinks] = useState([]);
  const [busy, setBusy] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ title: "", url: "", description: "", kind: "" });

  // Quick add (+ optional fields)
  const [addUrl, setAddUrl] = useState("");
  const [showAddMore, setShowAddMore] = useState(false);
  const [addMore, setAddMore] = useState({ title: "", kind: "", description: "" });

  // Last added flash
  const [flashId, setFlashId] = useState(null);

  // Search & sort
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("created"); // 'created' | 'title' | 'kind' | 'host'
  const [sortOrder, setSortOrder] = useState("desc"); // 'asc' | 'desc'

  // Load
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        setBusy(true);
        const data = await getProjectLinks(projectId);
        setLinks(data || []);
        onCountChange?.(Array.isArray(data) ? data.length : 0);
      } catch {
        notify?.("Failed to load links", "error");
      } finally {
        setBusy(false);
      }
    })();
  }, [projectId, notify, onCountChange]);

  useEffect(() => {
    onCountChange?.(links.length);
  }, [links.length, onCountChange]);

  // Derived
  const filteredLinks = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = [...links];
    if (q) {
      base = base.filter((l) => {
        const hay = [
          l.title || "",
          l.url || "",
          l.description || "",
          l.kind || "",
          hostnameOf(l.url),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const comp = (a, b) => {
      const va = (() => {
        if (sortBy === "title") return (a.title || "").toLowerCase();
        if (sortBy === "kind") return (a.kind || "").toLowerCase();
        if (sortBy === "host") return hostnameOf(a.url).toLowerCase();
        // default: created — we’ll use id as a proxy for recency if no created_at
        return a.created_at || a.id || 0;
      })();
      const vb = (() => {
        if (sortBy === "title") return (b.title || "").toLowerCase();
        if (sortBy === "kind") return (b.kind || "").toLowerCase();
        if (sortBy === "host") return hostnameOf(b.url).toLowerCase();
        return b.created_at || b.id || 0;
      })();

      if (va < vb) return sortOrder === "asc" ? -1 : 1;
      if (va > vb) return sortOrder === "asc" ? 1 : -1;
      return 0;
    };
    base.sort(comp);
    return base;
  }, [links, query, sortBy, sortOrder]);

  // Add new
  const addLink = useCallback(async () => {
    const url = normalizeUrl(addUrl);
    if (!url) return notify?.("Paste a URL first", "warning");

    const payload = {
      url,
      title: addMore.title || hostnameOf(url) || null,
      kind: addMore.kind || inferKind(url) || null,
      description: addMore.description || null,
    };

    try {
      setBusy(true);
      const saved = await createProjectLink(projectId, payload);
      setLinks((prev) => [saved, ...prev]);
      setAddUrl("");
      setAddMore({ title: "", kind: "", description: "" });
      setShowAddMore(false);

      // flash the newly added row
      setFlashId(saved.id);
      setTimeout(() => setFlashId(null), 1500);

      notify?.("Link added", "success");
    } catch (e) {
      notify?.(e?.message || "Failed to add link", "error");
    } finally {
      setBusy(false);
    }
  }, [addUrl, addMore, projectId, notify]);

  // Edit helpers
  function startEdit(link) {
    setEditingId(link.id);
    setDraft({
      title: link.title || "",
      url: link.url || "",
      description: link.description || "",
      kind: link.kind || "",
    });
  }
  function cancelEdit() {
    setEditingId(null);
    setDraft({ title: "", url: "", description: "", kind: "" });
  }
  async function saveEdit(link) {
    try {
      setBusy(true);
      const payload = {
        title: draft.title || null,
        url: normalizeUrl(draft.url),
        description: draft.description || null,
        kind: draft.kind || null,
      };
      const updated = await updateProjectLink(link.id, payload);
      setLinks((prev) => prev.map((x) => (x.id === link.id ? updated : x)));
      cancelEdit();
      notify?.("Link saved", "success");
    } catch (e) {
      notify?.(e?.message || "Failed to save link", "error");
    } finally {
      setBusy(false);
    }
  }

  // Delete
  async function removeItem(id) {
    if (!confirm("Remove this link?")) return;
    try {
      setBusy(true);
      await deleteProjectLink(id);
      setLinks((prev) => prev.filter((x) => x.id !== id));
      notify?.("Link removed", "success");
    } catch {
      notify?.("Failed to delete link", "error");
    } finally {
      setBusy(false);
    }
  }

  // ---------- render ----------
  return (
    <div className="links-tab" style={{ display: "grid", gap: 10 }}>
      {/* Toolbar: quick add | sort | search */}
      <div
        className="links-toolbar"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 1.2fr) auto minmax(220px, 0.8fr)",
          gap: 8,
          alignItems: "center",
        }}
      >
        {/* Quick add */}
        <div className="quick-add" style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 6 }}>
          <input
            placeholder="Paste URL… (Enter to add)"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation(); // don't trigger parent modal save
                addLink();
              }
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                addLink();
              }
            }}
          />
          <IconButton
            icon={<MoreIcon />}
            title={showAddMore ? "Hide fields" : "More fields (title, type, description)"}
            variant="neutral"
            size={16}
            onClick={() => setShowAddMore((v) => !v)}
            aria-expanded={showAddMore}
          />
          <IconButton
            icon={<AddIcon />}
            title="Add Link"
            variant="success"
            size={18}
            onClick={addLink}
            disabled={busy || !addUrl.trim()}
          />
        </div>

        {/* Sort controls */}
        <div
          className="sort-controls"
          style={{ display: "grid", gridAutoFlow: "column", gap: 8, alignItems: "center", justifyContent: "end" }}
        >
          <label style={{ opacity: 0.8, fontSize: 12 }}>Sort</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ minWidth: 130 }}
            aria-label="Sort by"
          >
            <option value="created">Recently added</option>
            <option value="title">Title</option>
            <option value="kind">Type</option>
            <option value="host">Host</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            aria-label="Sort order"
          >
            <option value="asc">↑ Asc</option>
            <option value="desc">↓ Desc</option>
          </select>
        </div>

        {/* Search */}
        <div className="links-search" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 6, alignItems: "center" }}>
          <span aria-hidden><SearchIcon /></span>
          <input
            placeholder="Filter links…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Expanded fields for add */}
      {showAddMore && (
        <div
          className="quick-add-more"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(160px, 1fr) minmax(120px, 0.6fr)",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            placeholder="Title (optional)"
            value={addMore.title}
            onChange={(e) => setAddMore((d) => ({ ...d, title: e.target.value }))}
          />
          <input
            placeholder="Type (doc, repo, sheet…)"
            value={addMore.kind}
            onChange={(e) => setAddMore((d) => ({ ...d, kind: e.target.value }))}
          />
          <textarea
            placeholder="Description (optional)"
            value={addMore.description}
            onChange={(e) => setAddMore((d) => ({ ...d, description: e.target.value }))}
            rows={2}
            style={{ gridColumn: "1 / -1", minHeight: 44 }}
          />
        </div>
      )}

      {/* LIST */}
      {filteredLinks.length === 0 ? (
        <div style={{ color: "#aaa" }}>
          {links.length === 0
            ? "No links yet. Paste a URL above and press Enter to add."
            : "No matches for your filter."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {filteredLinks.map((l) => {
            const host = hostnameOf(l.url);
            const isEditing = editingId === l.id;

            if (isEditing) {
              return (
                <div
                  key={l.id}
                  style={{
                    border: "1px solid #333",
                    borderRadius: 8,
                    padding: 10,
                    display: "grid",
                    gap: 8,
                    background: "rgba(0,0,0,0.2)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(140px, 1fr) minmax(220px, 1.6fr) minmax(100px, 0.7fr) auto auto",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <input
                      placeholder="Title"
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    />
                    <input
                      placeholder="URL"
                      value={draft.url}
                      onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(l)}
                    />
                    <input
                      placeholder="Type"
                      value={draft.kind}
                      onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
                    />
                    <IconButton
                      icon={<CheckIcon />}
                      title="Save"
                      variant="success"
                      size={18}
                      onClick={() => saveEdit(l)}
                      disabled={busy}
                    />
                    <IconButton
                      icon={<CloseIcon />}
                      title="Cancel"
                      variant="neutral"
                      size={18}
                      onClick={cancelEdit}
                    />
                  </div>
                  <textarea
                    placeholder="Description"
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    rows={2}
                    style={{ minHeight: 44 }}
                  />
                </div>
              );
            }

            return (
              <div
                key={l.id}
                className="link-row"
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    // favicon | title | type | desc | actions
                    "auto minmax(120px,1fr) minmax(70px, auto) minmax(140px,1.2fr) auto",
                  gap: 8,
                  alignItems: "center",
                  borderBottom: "1px solid #222",
                  padding: "4px 2px",
                  background: l.id === flashId ? "rgba(255,255,255,0.06)" : "transparent",
                  transition: "background 0.4s",
                  lineHeight: 1.25,
                }}
              >
                {/* favicon */}
                <img
                  src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
                  alt=""
                  width={14}
                  height={14}
                  style={{ opacity: 0.85 }}
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />

                {/* Title (subtle, truncates) */}
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  title={l.url}
                  style={{
                    minWidth: 0,                 // allow ellipsis in grid
                    fontSize: 13,
                    color: "#d4d4d4",
                    textDecoration: "none",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {l.title || host || "Open"}
                </a>

                {/* Type chip (compact) */}
                <span
                  style={{
                    justifySelf: "start",
                    fontSize: 11,
                    padding: "1px 7px",
                    border: "1px solid #333",
                    borderRadius: 999,
                    opacity: 0.9,
                    maxWidth: 100,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                  title={l.kind || "type"}
                >
                  {l.kind || "link"}
                </span>

                {/* Description (subtle, truncates) */}
                <span
                  style={{
                    minWidth: 0,                 // allow ellipsis in grid
                    fontSize: 11.5,
                    color: "#bdbdbd",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                  title={l.description || ""}
                >
                  {l.description || ""}
                </span>

                {/* Actions: fixed, non-wrapping column */}
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    justifySelf: "end",
                    whiteSpace: "nowrap",        // prevents wrapping under title
                  }}
                >
                  <IconButton
                    icon={<CopyIcon />}
                    title="Copy URL"
                    variant="neutral"
                    size={14}
                    onClick={() =>
                      navigator.clipboard.writeText(l.url).then(
                        () => notify?.("Copied", "success"),
                        () => notify?.("Copy failed", "error")
                      )
                    }
                  />
                  <IconButton
                    icon={<EditIcon />}
                    title="Edit"
                    variant="neutral"
                    size={14}
                    onClick={() => startEdit(l)}
                  />
                  <IconButton
                    icon={<TrashIcon />}
                    title="Delete"
                    variant="danger"
                    size={14}
                    onClick={() => removeItem(l.id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
