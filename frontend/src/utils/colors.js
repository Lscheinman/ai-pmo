/**
 * Decide if text should be light or dark based on background color brightness.
 * @param {string} hex - Hex color (e.g. "#2ae98d")
 * @returns {string} "#fff" for light text or "#000" for dark text
 */
export function getContrastTextColor(colorValue) {
  if (!colorValue) return "#fff";

  // Resolve CSS variable values if passed like var(--status-planned)
  if (colorValue.startsWith("var(") && typeof window !== "undefined") {
    const cssVarName = colorValue.slice(4, -1).trim(); // e.g. --status-planned
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();
    if (resolved) colorValue = resolved;
  }

  // Remove "#" and parse as RGB
  const hex = colorValue.replace("#", "");
  if (hex.length !== 6) return "#fff"; // fallback

  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Perceived brightness formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
  return luminance > 186 ? "#000" : "#fff";
}

