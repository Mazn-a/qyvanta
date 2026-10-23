import { readToken } from "./api";

const VISITOR_KEY = "wifaq-visitor-id";
const SESSION_KEY = "wifaq-visit-session";
const STAFF = new Set(["admin", "restaurant"]);
const PAGES = new Set(["marketing", "houses", "order", "login", "track", "orders", "profile", "legal", "rewards"]);

export function visitorId() {
  try {
    const current = localStorage.getItem(VISITOR_KEY);
    if (current) return current;
    const next = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, next);
    return next;
  } catch {
    return "";
  }
}

export function pingVisit(page: string, step = 0) {
  if (STAFF.has(page) || !PAGES.has(page)) return;
  const id = visitorId();
  if (!id) return;
  let sessionNew = false;
  try {
    sessionNew = !sessionStorage.getItem(SESSION_KEY);
    if (sessionNew) sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    sessionNew = true;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  void fetch("/api/visits/ping", {
    method: "POST",
    headers,
    body: JSON.stringify({ visitorId: id, page, step, sessionNew }),
  }).catch(() => {
    /* الزيارة اختيارية ولا توقف الموقع */
  });
}
