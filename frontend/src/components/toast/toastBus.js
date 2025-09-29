// Simple event bus + promise-based API for action toasts

let nextId = 1;
const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(payload) {
  listeners.forEach((l) => l(payload));
}

export function showToast({
  type = "info",
  message = "",
  persist = false,
  duration = 2800,
  actions = [],           // [{ id, label, variant? }]
}) {
  const id = nextId++;
  let _resolve;
  const promise = new Promise((resolve) => { _resolve = resolve; });

  emit({
    kind: "add",
    toast: { id, type, message, persist, duration, actions, _resolve },
  });

  // Resolves with the clicked action id (string) or null on dismiss/timeout
  return promise;
}

export function clickAction(toastId, actionId) {
  emit({ kind: "action", toastId, actionId });
}

export function dismissToast(toastId) {
  emit({ kind: "dismiss", toastId });
}
