// frontend/src/api/people.js
import { API_BASE } from "./apiConfig";

async function parse(res, msg) {
  if (res.ok) return res.json();
  const text = await res.text().catch(() => "");
  throw new Error(`${msg}${text ? `: ${text}` : ""}`);
}

// Get all people
export async function getPeople() {
  const res = await fetch(`${API_BASE}/people/`);
  if (!res.ok) throw new Error("Failed to fetch people");
  return res.json();
}

// Create person
export async function createPerson(person) {
  const res = await fetch(`${API_BASE}/people/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(person),
  });
  if (!res.ok) throw new Error("Failed to create person");
  return res.json();
}

// Update person
export async function updatePerson(id, person) {
  const res = await fetch(`${API_BASE}/people/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(person),
  });
  if (!res.ok) throw new Error("Failed to update person");
  return res.json();
}

// Delete person
export async function deletePerson(id) {
  const res = await fetch(`${API_BASE}/people/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete person");
  return res.json();
}

export async function importPeopleExcel(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/groups/import/`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to import people/groups from Excel");
  return res.json();
}

export async function getPersonById(personId) {
  const res = await fetch(`${API_BASE}/people/${personId}`, {
    method: "GET",
    headers: { "Accept": "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Failed to get person with id ${personId}`);
  }
  return res.json();
}

export async function getPersonRelations(personId) {
  const res = await fetch(`${API_BASE}/people/${personId}/relations`, {
    headers: { Accept: "application/json" },
  });
  return parse(res, "Failed to fetch relations");
}

// IMPORTANT: fromPersonId goes in the URL; to_person_id + type go in the body
export async function createPersonRelation(fromPersonId, payload) {
  const res = await fetch(`${API_BASE}/people/${fromPersonId}/relations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parse(res, "Failed to create relation");
}

export async function updatePersonRelation(relId, patch) {
  const res = await fetch(`${API_BASE}/relations/${relId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parse(res, "Failed to update relation");
}

export async function deletePersonRelation(relId) {
  const res = await fetch(`${API_BASE}/relations/${relId}`, { method: "DELETE" });
  if (res.ok) return { ok: true };
  const text = await res.text().catch(() => "");
  throw new Error(`Failed to delete relation${text ? `: ${text}` : ""}`);
}