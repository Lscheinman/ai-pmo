import { API_BASE } from "./apiConfig";

// GET all projects
export async function getProjects() {
  const res = await fetch(`${API_BASE}/projects/`);
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

// CREATE new project
export async function createProject(project) {
  const res = await fetch(`${API_BASE}/projects/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project)
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

// GET project
export async function getProjectById(projectId) {
  const res = await fetch(`${API_BASE}/project/${projectId}`);
  if (!res.ok) throw new Error("Failed to get project");
  return res.json();
}

// UPDATE project
export async function updateProject(projectId, project) {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project)
  });
  if (!res.ok) throw new Error("Failed to update project");
  return res.json();
}

// DELETE project
export async function deleteProject(projectId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: "DELETE"
  });
  if (!res.ok) throw new Error("Failed to delete project");
  return res.json();
}

// add to existing file
export async function addPeopleToProject(projectId, { person_ids, role }) {
  const res = await fetch(`/assign/projects/${projectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ person_ids, role }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { ok: true, count }
}
