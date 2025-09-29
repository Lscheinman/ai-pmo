// src/api/tags.js

import { API_BASE } from "./apiConfig";

// Utility: normalize and capitalize tag names consistently
export function normalizeTagName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ") // collapse multiple spaces
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ----------------------
// Global Tag Management
// ----------------------

// GET all tags
export async function getTags() {
  const res = await fetch(`${API_BASE}/tags/`);
  if (!res.ok) throw new Error("Failed to fetch tags");
  return res.json();
}

// CREATE a new tag
export async function createTag(tag) {
  const name =
    typeof tag === "string"
      ? tag
      : tag?.name || "";

  const normalized = normalizeTagName(name);

  const res = await fetch(`${API_BASE}/tags/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: normalized })
  });

  if (!res.ok) throw new Error("Failed to create tag");
  return res.json();
}

// DELETE a tag definition entirely
export async function deleteTagDefinition(tagId) {
  const res = await fetch(`${API_BASE}/tags/${tagId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete tag definition");
  return res.json();
}

// ----------------------
// Object Tag Assignment
// ----------------------

// Set (replace) all tags for a given object
export async function setTagsForObject(objectType, objectId, tagIds) {
  const res = await fetch(`${API_BASE}/${objectType}/${objectId}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tag_ids: tagIds })
  });

  if (!res.ok) throw new Error("Failed to set tags for object");
  return res.json();
}

export async function removeTagFromObject(objectType, objectId, currentTagIds, tagIdToRemove) {
  // Filter out the tag to remove
  const filteredTagIds = currentTagIds.filter(id => id !== tagIdToRemove);

  // Send updated list to backend
  return setTagsForObject(objectType, objectId, filteredTagIds);
}