/**
 * Some browsers throw as soon as localStorage/sessionStorage is touched (iPhone Safari with "Block All Cookies", some in-app
 * browsers). Most of the app reads them while rendering, which would leave a black screen: fall back to an in-memory store.
 */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  try {
    const s = window[name];
    s.setItem("tg_probe", "1");
    s.removeItem("tg_probe");
  } catch {
    try { Object.defineProperty(window, name, { value: memoryStorage(), configurable: true }); } catch { /* nothing more to do */ }
  }
}
