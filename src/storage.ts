export const STORE_KEY = "wifaq-preview-v1";
export const LANG_KEY = "wifaq-lang";
export const REMEMBER_KEY = "wifaq-remember-email";

export function readMigrated(key: string, legacy: string) {
  try {
    const current = localStorage.getItem(key);
    if (current != null) return current;
    const previous = localStorage.getItem(legacy);
    if (previous == null) return null;
    localStorage.setItem(key, previous);
    localStorage.removeItem(legacy);
    return previous;
  } catch {
    return null;
  }
}
