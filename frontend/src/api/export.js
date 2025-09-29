import { API_BASE } from "./apiConfig";

function joinPath(base, path) {
  const b = String(base || "").replace(/\/+$/, "");     // strip trailing slashes
  const p = String(path || "").replace(/^\/+/, "");     // strip leading slashes
  return `${b}/${p}`;
}

export async function exportEntities({ entity = "all", ids = [], format = "csv" }) {
  const params = new URLSearchParams();
  params.set("entity", entity);
  if (ids.length) params.set("ids", ids.join(","));
  params.set("format", format);

  const endpoint = joinPath(API_BASE, "export");        // <-- no leading slash
  const url = `${endpoint}?${params.toString()}`;

  // helpful when debugging paths
  console.debug("[exportEntities] GET", url);

  const res = await fetch(url, {
    method: "GET",
    credentials: "include"
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Export failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const ct = res.headers.get("Content-Type") || "";
  if (ct.includes("text/html")) {
    const sample = (await res.text().catch(() => "")).slice(0, 200);
    console.error("Expected a file, got HTML:", sample);
    throw new Error("Received HTML instead of a file. Check API_BASE / URL.");
  }

  const blob = await res.blob();

  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
  const raw =
    (m && (m[1] || m[2])) ||
    `export.${format === "xlsx" ? "xlsx" : (format === "planner" ? "csv" : (entity === "all" ? "zip" : "csv"))}`;
  const filename = decodeURIComponent(raw);

  return { blob, filename };
}

export function triggerDownload({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
