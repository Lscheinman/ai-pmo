// utils/tags.js

export const TAG_COLORS = [
  { background: "#282b3a", color: "#d5e" },
  { background: "#1f3d4d", color: "#6ed5ff" },
  { background: "#3a2b28", color: "#ffb366" },
  { background: "#2b3a28", color: "#8aff7a" },
  { background: "#3a283a", color: "#ff7aff" },
  { background: "#2b2b3a", color: "#a1a1ff" }
];

// Pick color deterministically based on tag name (hash)
export function getTagColor(tagName) {
  if (!tagName) return TAG_COLORS[0];
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TAG_COLORS.length;
  return TAG_COLORS[index];
}
