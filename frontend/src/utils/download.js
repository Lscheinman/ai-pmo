// src/utils/download.js
export async function downloadFile(url, fallbackName = "export.csv", opts = {}) {
    // Never set a JSON Accept here; some servers will return HTML on mismatch.
    const res = await fetch(url, {
        method: "GET",
        credentials: "include", // keep if your API uses cookies; otherwise remove
        ...opts
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Download failed (${res.status}): ${text.slice(0, 200)}`);
    }

    // If we accidentally hit the SPA, we'll get HTML.
    const ct = res.headers.get("Content-Type") || "";
    if (ct.includes("text/html")) {
        const sample = (await res.text()).slice(0, 200);
        console.error("Expected a file, got HTML. Likely hitting the frontend, not the API.", sample);
        throw new Error("Received HTML instead of a file. Check the URL (use /api/export or full backend URL).");
    }

    const blob = await res.blob();

    // Try to read the filename from Content-Disposition
    const cd = res.headers.get("Content-Disposition") || "";
        // Matches: filename*=UTF-8''name OR filename="name" OR filename=name
        const m =
        /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
    const raw = (m && (m[1] || m[2])) || fallbackName;
    // decode percent-encoding if present
    const filename = decodeURIComponent(raw);

    const a = document.createElement("a");
    const urlObj = URL.createObjectURL(blob);
    a.href = urlObj;
    a.download = filename;
    // If you want to open in new tab for some types:
    // a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(urlObj);
    
}
