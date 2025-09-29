// frontend/src/utils/strings.js
// Utility functions for string manipulation
export function extractNumber(str) {
  if (typeof str !== "string") return null;
  const match = str.match(/\d+/); // First sequence of digits
  return match ? parseInt(match[0], 10) : null;
}

// Generates a unique identifier
export const shortUid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

// Converts various ID formats to a string ID
export const toStringId = (v) => (v === 0 || v ? String(v) : "");

// Strips known prefixes from IDs
export const stripKnownPrefix = (id) =>
  String(id || "").replace(/^(person|people|task|tasks|project|projects|group|groups)-/i, "");

// Converts a type to singular form
export const singularType = (t) =>
  String(t || "").trim().toLowerCase().replace(/s$/, "");

// Returns a safe label for a node, falling back to id if label or name is not available
export const safeLabel = (n) =>
  n?.label ?? n?.name ?? toStringId(n?.id);

// Truncates a JSON object to a maximum length, adding ellipsis if it exceeds the limit
export const truncateJson = (obj, max = 2000) => {
  try {
    const str = JSON.stringify(obj);
    return str.length > max ? str.slice(0, max) + " …" : str;
  } catch {
    return "";
  }
};

const ENTITY = '(?:person|project|task|group|tag)';

export function normalizeEntities(md) {
  if (!md) return md;
  let s = md;

  // 1) Flatten any markdown entity links to the bare id: [label](entity://task_2) -> task_2
  //    (handles extra spaces/newlines around entity:// and id)
  const linkRE = new RegExp(String.raw`\[\s*([^\]]*?)\s*\]\(\s*entity:\/\/\s*(${ENTITY}_\d+)\s*\)`, 'gi');
  let prev;
  do { prev = s; s = s.replace(linkRE, (_m, _label, id) => id.toLowerCase()); } while (s !== prev);

  // 2) Backticked ids: `task_2` -> task_2
  const tickRE = new RegExp(String.raw('`(' + ENTITY + ')_(\\d+)`'), 'gi');
  s = s.replace(tickRE, (_m, t, n) => `${t.toLowerCase()}_${n}`);

  // 3) Parenthesized ids: ( task_2 ) -> task_2
  const parenRE = new RegExp(String.raw`\(\s*(${ENTITY})_(\d+)\s*\)`, 'gi');
  s = s.replace(parenRE, (_m, t, n) => `${t.toLowerCase()}_${n}`);

  // 4) Convert all bare ids to canonical links: task_2 -> [task_2](entity://task_2)
  const bareRE = new RegExp(String.raw`\b(${ENTITY})_(\d+)\b`, 'gi');
  s = s.replace(bareRE, (_m, t, n) => {
    const id = `${t.toLowerCase()}_${n}`;
    return `[${id}](entity://${id})`;
  });

  // 5) Remove immediately-adjacent duplicate ids from weird nesting: task_31task_31 -> task_31
  const adjDupRE = new RegExp(String.raw`\b((${ENTITY})_\d+)\1\b`, 'gi');
  do { prev = s; s = s.replace(adjDupRE, '$1'); } while (s !== prev);

  // 6) Fix line breaks inside link urls: ](entity://\nproject_1) -> ](entity://project_1)
  s = s.replace(/\]\(\s*entity:\/\/\s*([^)]+)\s*\)/g, (_m, id) => `](entity://${id.trim()})`);

  return s;
}