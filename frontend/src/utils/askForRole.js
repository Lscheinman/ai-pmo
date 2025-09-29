import { showToast } from "../components/toast/toastBus";

const canon = (s, def = "Responsible") => {
  const v = String(s || "").toLowerCase();
  if (v.startsWith("r")) return "Responsible";
  if (v.startsWith("a")) return "Accountable";
  if (v.startsWith("c")) return "Consulted";
  if (v.startsWith("i")) return "Informed";
  return def;
};

export async function askForRole(defaultRole = "Responsible") {
  const actionId = await showToast({
    type: "info",
    message: "Assign role to the new person",
    persist: true,
    actions: [
      { id: "Responsible", label: "Responsible", variant: "primary" },
      { id: "Accountable", label: "Accountable" },
      { id: "Consulted",   label: "Consulted"   },
      { id: "Informed",    label: "Informed"    },
      { id: "cancel",      label: "Cancel",     variant: "danger" },
    ],
  });
  if (!actionId || actionId === "cancel") return defaultRole;
  return canon(actionId, defaultRole);
}
