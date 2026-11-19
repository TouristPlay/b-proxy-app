// Тексты в тестах — по-русски, как ключи перевода: i18n читает язык из localStorage.
const store = new Map<string, string>([["b-proxy.appearance", JSON.stringify({ language: "ru" })]]);
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
} as Storage;
