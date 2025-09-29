import { API_BASE } from "./apiConfig";

// Upload Excel file
export async function importExcel(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/import/`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Failed to import Excel");
  return res.json();
}
