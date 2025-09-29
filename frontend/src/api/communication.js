// src/api/communication.js
import { API_BASE } from "./apiConfig";

export async function composeEmail(input) {
  if (!input) throw new Error("composeEmail: missing payload");

  // Deep-clone for trustworthy logging (avoid mutated console views)
  const original = JSON.parse(JSON.stringify(input));
  console.log("[composeEmail] incoming:", original);

  // Normalize entity -> always "kind_id"
  let entity = input.entity;
  if (!entity) throw new Error("composeEmail: missing entity");

  if (typeof entity === "object") {
    const rawType = String(entity.type || "").toLowerCase().trim();
    const type = rawType.endsWith("s") ? rawType.slice(0, -1) : rawType; // people->person, projects->project
    const id = entity.id ?? entity.object_id ?? entity.entity_id;
    if (!type || id == null) throw new Error("composeEmail: invalid entity object; expected {type,id}");
    entity = `${type}_${id}`;
  } else {
    entity = String(entity).trim();
  }

  const payload = {
    mode: input.mode,
    entity,
    policy: input.policy,
    options: input.options,
  };

  console.log("[composeEmail] POST payload:", JSON.parse(JSON.stringify(payload)));

  const res = await fetch(`${API_BASE}/graph/ai/compose_email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Compose email failed: ${res.status} ${txt}`);
  }
  return res.json();
}
