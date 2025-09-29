// src/api/groups.js

import { API_BASE } from "./apiConfig";

// Get all groups
export async function getGroups() {
  const res = await fetch(`${API_BASE}/groups/`);
  if (!res.ok) throw new Error("Failed to fetch groups");
  return res.json();
}

// Create a new group
export async function createGroup(group) {
  const res = await fetch(`${API_BASE}/groups/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(group),
  });
  if (!res.ok) throw new Error("Failed to create group");
  return res.json();
}

// Update group (by id)
export async function updateGroup(id, group) {
  const res = await fetch(`${API_BASE}/groups/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(group),
  });
  if (!res.ok) throw new Error("Failed to update group");
  return res.json();
}

// Delete group
export async function deleteGroup(id) {
  const res = await fetch(`${API_BASE}/groups/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete group");
  return res.json();
}

// Add person to group
export async function addPersonToGroup(groupId, personId) {
  const res = await fetch(`${API_BASE}/groups/${groupId}/add_person/${personId}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to add person to group");
  return res.json();
}

// Remove person from group
export async function removePersonFromGroup(groupId, personId) {
  const res = await fetch(`${API_BASE}/groups/${groupId}/remove_person/${personId}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to remove person from group");
  return res.json();
}
