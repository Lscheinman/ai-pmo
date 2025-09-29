// Public API:
//   - extractStatus(obj) -> string|null
//   - getStatusColor(status) -> string           // uses your CSS tokens
//   - isTerminalStatus(status) -> boolean
//   - canonicalStatus(status) -> string|null
//   - refreshStatusPalette() -> void             // call this if your theme tokens change at runtime

// ---------- read CSS custom properties (with SSR-safe fallbacks)
const FALLBACKS = {
  planned:   "#ffffff", // --status-planned
  confirmed: "#d5d200", // --status-confirmed
  complete:  "#02589e", // --status-complete
  running:   "#01c35c", // --status-running
  blocked:   "#c70000", // --status-blocked
  canceled:  "#6b6564", // --status-canceled
  neutral:   "#343434"  // fallback for neutral rings if not defined
};

let PALETTE_CACHE = null;

function readCssVar(name) {
  if (typeof window === "undefined" || !window.getComputedStyle) return "";
  const style = getComputedStyle(document.documentElement);
  return (style.getPropertyValue(name) || "").trim();
}

function buildPaletteFromCSS() {
  const p = {
    planned:   readCssVar("--status-planned")   || FALLBACKS.planned,
    confirmed: readCssVar("--status-confirmed") || FALLBACKS.confirmed,
    complete:  readCssVar("--status-complete")  || FALLBACKS.complete,
    running:   readCssVar("--status-running")   || FALLBACKS.running,
    blocked:   readCssVar("--status-blocked")   || FALLBACKS.blocked,
    canceled:  readCssVar("--status-canceled")  || FALLBACKS.canceled,
    neutral:   readCssVar("--ring-neutral")     || readCssVar("--line") || FALLBACKS.neutral,
  };
  return p;
}

function getPalette() {
  if (!PALETTE_CACHE) PALETTE_CACHE = buildPaletteFromCSS();
  return PALETTE_CACHE;
}

// Call this if you change themes or swap stylesheets at runtime
export function refreshStatusPalette() {
  PALETTE_CACHE = null;
}

// ---------- normalization & synonyms
function compactToken(s) {
  // eslint-disable-next-line no-useless-escape
  return String(s || "").toLowerCase().replace(/[\s_\-\/]+/g, "");
}

/** Map many inputs → canonical keys matching your CSS tokens. */
function canonicalKey(s) {
  const k = compactToken(s);
  if (!k) return null;

  // Running / Active
  if ([
    "running","run","active","working","ongoing","started","inprogress","wip",
    "inflight","executing","execution","inprocess","processing","progress"
  ].includes(k)) return "running";

  // Planned
  if (["planned","planning","scheduled","notstarted","plan"].includes(k)) return "planned";

  // Confirmed (approved/committed/signed-off)
  if (["confirmed","confirm","approved","committed","greenlit","signedoff","booked","locked"].includes(k))
    return "confirmed";

  // Blocked / On hold / Risk → treat as blocked so it’s very visible in the graph
  if (["blocked","stuck","impeded","onblocker","onhold","hold","paused","waiting","deferred","pending","risk","atrisk","red","amber"].includes(k))
    return "blocked";

  // Complete / Done
  if (["done","completed","complete","closed","resolved","finished","shipped","delivered"].includes(k))
    return "complete";

  // Canceled / Cancelled
  if (["canceled","cancelled","abandoned","rejected","dropped","declined"].includes(k))
    return "canceled";

  // If the token already matches one of your keys, return it
  if (["planned","confirmed","complete","running","blocked","canceled"].includes(k)) return k;

  return null;
}

export function canonicalStatus(s) {
  const key = canonicalKey(s);
  if (!key) return null;
  // pretty labels
  const PRETTY = { canceled: "canceled" };
  if (key === "complete") return "complete";
  if (key === "running") return "running";
  if (key === "planned") return "planned";
  if (key === "confirmed") return "confirmed";
  if (key === "blocked") return "blocked";
  return PRETTY[key] || key;
}

export function getStatusColor(s) {
  const key = canonicalKey(s);
  const pal = getPalette();
  if (!key) return pal.neutral;
  return pal[key] || pal.neutral;
}

export function isTerminalStatus(s) {
  const key = canonicalKey(s);
  return key === "complete" || key === "canceled";
}

/**
 * Extract a human-readable status string from an object.
 * Returns the raw string for display; color/logic use the canonical map above.
 */
export function extractStatus(obj) {
  if (!obj || typeof obj !== "object") return null;

  const candidates = [];

  // common flat fields
  ["status", "state", "stage", "lifecycleStatus", "phase", "phaseStatus"].forEach(k => {
    if (obj[k] != null) candidates.push(obj[k]);
  });

  // nested: status: { name/text/label/value/key }
  if (obj.status && typeof obj.status === "object") {
    ["name", "text", "label", "value", "key", "id"].forEach(k => {
      if (obj.status[k] != null) candidates.push(obj.status[k]);
    });
  }

  // tags/labels arrays
  ["tags", "labels", "states"].forEach(k => {
    const v = obj[k];
    if (Array.isArray(v)) {
      for (const t of v) {
        if (typeof t === "string") candidates.push(t);
        else if (t && typeof t === "object") {
          if (t.name) candidates.push(t.name);
          if (t.value) candidates.push(t.value);
          if (t.key) candidates.push(t.key);
          if (t.label) candidates.push(t.label);
        }
      }
    }
  });

  // first non-empty string
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return null;
}
