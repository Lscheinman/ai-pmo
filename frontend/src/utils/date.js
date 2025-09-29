// Compact date with short month + short year
export function formatDateCompact(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit"
  }).format(new Date(date));
}

// Even shorter for badges (no year)
export function formatDateShort(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short"
  }).format(new Date(date));
}
