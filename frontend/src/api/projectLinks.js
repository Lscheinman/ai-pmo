// /pmo/frontend/src/api/projectLinks.js
import { API_BASE } from "./apiConfig";

// GET all links for a project
export async function getProjectLinks(projectId) {
  if (!projectId) throw new Error("projectId is required to fetch links");
  const res = await fetch(`${API_BASE}/projects/${projectId}/links`);
  if (!res.ok) throw new Error("Failed to fetch project links");
  return res.json();
}

// CREATE new link for a project
export async function createProjectLink(projectId, link) {
  if (!projectId) throw new Error("projectId is required to create a link");
  const res = await fetch(`${API_BASE}/projects/${projectId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(link),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error("Failed to create link: " + error);
  }
  return res.json();
}

// UPDATE a link by id
export async function updateProjectLink(linkId, link) {
  const res = await fetch(`${API_BASE}/links/${linkId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(link),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error("Failed to update link: " + error);
  }
  return res.json();
}

// DELETE a link by id
export async function deleteProjectLink(linkId) {
  const res = await fetch(`${API_BASE}/links/${linkId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error("Failed to delete link: " + error);
  }
  return res.json(); // { ok: true }
}
