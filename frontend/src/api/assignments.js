// frontend/src/api/assignments.js
import { API_BASE } from "./apiConfig";

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail || ""; } catch { /* empty */ }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function assignPeopleToProjects(projectIds = [], personIds = [], role = "I") {
  let total = 0;
  for (const id of projectIds) {
    const out = await postJSON(`${API_BASE}/projects/${id}/assign`, { person_ids: personIds, role });
    total += out?.count || 0;
  }
  return total;
}

export async function assignPeopleToTasks(taskIds = [], personIds = [], role = "I") {
  let total = 0;
  for (const id of taskIds) {
    const out = await postJSON(`${API_BASE}/tasks/${id}/assign`, { person_ids: personIds, role });
    total += out?.count || 0;
  }
  return total;
}
