// frontend/src/utils/askForRole.js
// Simple role chooser — returns a canonical RACI string or default "Responsible".
export async function askForRole(defaultRole = "Responsible") {
  const canonical = (s) => {
    const v = String(s || "").trim().toLowerCase();
    if (v.startsWith("r")) return "Responsible";
    if (v.startsWith("a")) return "Accountable";
    if (v.startsWith("c")) return "Consulted";
    if (v.startsWith("i")) return "Informed";
    return defaultRole;
  };

  // Minimal UI using prompt to keep the patch tiny. You can swap for a nicer popover later.
  const input = window.prompt(
    "Assign role (R, A, C, or I)\n\nR = Responsible\nA = Accountable\nC = Consulted\nI = Informed",
    defaultRole
  );

  if (input == null) return defaultRole; // cancel -> default
  return canonical(input);
}
