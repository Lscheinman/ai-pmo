import { API_BASE } from "./apiConfig";

// GET all tasks (optionally for a project)
export async function getTasks(projectId) {
  const url = projectId
    ? `${API_BASE}/tasks/?project_id=${projectId}`
    : `${API_BASE}/tasks/`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch tasks");
  return res.json();
}

// CREATE new task
export async function createTask(task) {
  const res = await fetch(`${API_BASE}/tasks/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task)
  });
  if (!res.ok) throw new Error("Failed to create task");
  return res.json();
}

export async function updateTask(taskId, task) {
  console.log("UPDATE PAYLOAD", task);
  const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task)
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error("Failed to update task: " + error);
  }
  return res.json();
}

export async function getTaskById(taskId) {
  const res = await fetch(`${API_BASE}/tasks/${taskId}`);
  if (!res.ok) throw new Error(`Failed to fetch task ${taskId}`);
  return res.json();
}

// DELETE task
export async function deleteTask(taskId) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api'}/tasks/${taskId}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Failed to delete task ${taskId}`);
  }
  return true;
}

export async function addPeopleToTask(taskId, { person_ids, role }) {
  // Build the correct URL: /api/tasks/{taskId}/assign
  const url = new URL(`${API_BASE}/tasks/${taskId}/assign`);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",            // include if your API uses cookies
    body: JSON.stringify({ person_ids, role }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Assign failed (${res.status}): ${text}`);
  }
  return res.json(); // { ok: true, count }
}

export async function getDailyPlan({ date, windowDays = 3, maxItems = 40, includeSuggestions = true } = {}) {
  const res = await fetch(`${API_BASE}/ai/daily-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ date, windowDays, maxItems, includeSuggestions }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`daily-plan ${res.status}: ${text}`);
  }
  return res.json();
}