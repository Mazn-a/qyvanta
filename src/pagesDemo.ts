import { cities, getRestaurant, restaurants } from "./data";
import { timeFitsMeal } from "./meals";
import { VOUCHER_MIN_ORDER_HALALAS, VOUCHER_VALUE_HALALAS } from "./rewards";
import type { MealType, Tier } from "./types";

const STORAGE_KEY = "qyvanta-pages-demo-v1";

type DemoUser = {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  companyEmail: string;
  companyName: string;
  active: boolean;
};

type DemoVoucher = {
  id: string;
  userId: string;
  valueHalalas: number;
  status: "available" | "reserved" | "used";
  issuedAt: string;
  expiresAt: null;
  reservedOrderId?: string;
  usedOrderId?: string;
  usedAt?: string;
};

type DemoLine = {
  itemId: string;
  name: string;
  tier: Tier | string;
  unitPrice: number;
  qty: number;
};

type DemoOrder = {
  id: string;
  publicNo: string;
  userId: string;
  cityId: string;
  cityName: string;
  restaurantId: string;
  restaurantName: string;
  clientName: string;
  phone: string;
  personalEmail: string;
  companyEmail: string;
  companyName: string;
  mealType: MealType;
  items: DemoLine[];
  attendees: number;
  eventDate: string;
  pickupTime: string;
  pickupLocation: string;
  notes: string;
  status: "pending_restaurant" | "confirmed" | "delivered" | "rejected" | "cancelled";
  cancelRequested: boolean;
  cancelRequestedAt?: string;
  createdAt: string;
  subtotalHalalas: number;
  voucherDiscountHalalas: number;
  totalHalalas: number;
  voucherId?: string;
  voucherUse: "none" | "reserved";
  wifaqCoveredHalalas: number;
  rewardStatus: "pending";
  rewardHalalas: number;
};

type DemoLedger = {
  id: string;
  userId: string;
  kind: "voucher_reserved";
  at: string;
  amountHalalas: number;
  balanceAfterHalalas: number;
  orderId?: string;
  voucherId?: string;
};

type DemoDb = {
  seq: number;
  users: DemoUser[];
  vouchers: DemoVoucher[];
  orders: DemoOrder[];
  ledger: DemoLedger[];
};

function seed(): DemoDb {
  const userId = "demo-qyvanta";
  const issuedAt = new Date().toISOString();
  return {
    seq: 0,
    users: [
      {
        id: userId,
        email: "demo@qyvanta.local",
        password: "QyvantaDemo2026",
        firstName: "ضيف",
        lastName: "العرض",
        phone: "0550001122",
        companyEmail: "",
        companyName: "",
        active: true,
      },
    ],
    vouchers: Array.from({ length: 5 }, () => ({
      id: crypto.randomUUID(),
      userId,
      valueHalalas: VOUCHER_VALUE_HALALAS,
      status: "available" as const,
      issuedAt,
      expiresAt: null,
    })),
    orders: [],
    ledger: [],
  };
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const data = JSON.parse(raw) as DemoDb;
    if (!Array.isArray(data.users) || !Array.isArray(data.orders) || !Array.isArray(data.vouchers)) return seed();
    return data;
  } catch {
    return seed();
  }
}

function save(db: DemoDb) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function publicUser(user: DemoUser) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    email: user.email,
    companyEmail: user.companyEmail,
    companyName: user.companyName,
    kind: "customer" as const,
    restaurantId: null,
    permissions: [] as string[],
  };
}

function userFrom(init: RequestInit | undefined, db: DemoDb) {
  const header = new Headers(init?.headers).get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token.startsWith("pages:")) return null;
  return db.users.find((user) => user.id === token.slice(6) && user.active) ?? null;
}

async function readBody(init: RequestInit | undefined) {
  const body = init?.body;
  if (!body) return {} as Record<string, unknown>;
  if (typeof body === "string") {
    if (!body.trim()) return {} as Record<string, unknown>;
    return JSON.parse(body) as Record<string, unknown>;
  }
  if (body instanceof FormData) {
    const fields: Record<string, unknown> = {};
    body.forEach((value, key) => {
      if (typeof value === "string") fields[key] = value;
    });
    return fields;
  }
  return {} as Record<string, unknown>;
}

function unitPrice(restaurantId: string, itemId: string, tier: string, fallback: number) {
  const restaurant = getRestaurant(restaurantId);
  if (!restaurant) return null;
  for (const meal of ["breakfast", "lunch", "dinner"] as const) {
    const item = restaurant.menu[meal].find((line) => line.id === itemId);
    if (!item) continue;
    return tier === "luxury" ? item.prices.luxury : item.prices.regular;
  }
  return fallback;
}

function answer(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fail(status: number, error: string) {
  return answer(status, { error });
}

function requestPath(input: RequestInfo | URL) {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw, window.location.origin).pathname;
}

async function handle(path: string, init: RequestInit | undefined) {
  const method = (init?.method || "GET").toUpperCase();
  if (path.startsWith("/api/admin") || path.startsWith("/api/restaurant")) return fail(404, "المسار غير موجود");
  if (method === "GET" && path === "/api/health") return answer(200, { ok: true, mode: "pages" });
  if (method === "GET" && path === "/api/catalog") {
    return answer(200, {
      cities,
      restaurants: restaurants.map((restaurant) => ({ ...restaurant, acceptingOrders: true })),
    });
  }
  if (method === "POST" && path === "/api/visits/ping") return answer(200, { ok: true });

  const db = load();

  if (method === "POST" && path === "/api/reports") {
    const body = await readBody(init);
    const message = String(body.message || "").trim();
    if (message.length < 5) return fail(400, "اكتب وصف المشكلة بوضوح (٥ أحرف على الأقل).");
    return answer(201, { ok: true, id: crypto.randomUUID() });
  }

  if (method === "POST" && path === "/api/auth/register") {
    const body = await readBody(init);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || password.length < 8) return fail(400, "بيانات الحساب غير مكتملة.");
    if (db.users.some((user) => user.email === email)) return fail(409, "هذا البريد مسجّل مسبقًا.");
    const user: DemoUser = {
      id: crypto.randomUUID(),
      email,
      password,
      firstName: String(body.firstName || "").trim(),
      lastName: String(body.lastName || "").trim(),
      phone: String(body.phone || "").replace(/\s/g, ""),
      companyEmail: String(body.companyEmail || "").trim().toLowerCase(),
      companyName: String(body.companyName || "").trim(),
      active: true,
    };
    db.users.push(user);
    save(db);
    return answer(200, { token: `pages:${user.id}`, user: publicUser(user) });
  }

  if (method === "POST" && path === "/api/auth/login") {
    const body = await readBody(init);
    const email = String(body.email || "").trim().toLowerCase();
    const user = db.users.find((item) => item.email === email);
    if (!user || !user.active || user.password !== String(body.password || "")) {
      return fail(401, "البريد أو كلمة المرور غير صحيحة.");
    }
    return answer(200, { token: `pages:${user.id}`, user: publicUser(user) });
  }

  const session = userFrom(init, db);
  if (method === "GET" && path === "/api/me") {
    if (!session) return fail(401, "يلزم تسجيل الدخول");
    return answer(200, { user: publicUser(session), kind: "customer", permissions: [], restaurantId: null });
  }

  if (method === "PATCH" && path === "/api/me") {
    if (!session) return fail(401, "يلزم تسجيل الدخول");
    const body = await readBody(init);
    const email = String(body.email || "").trim().toLowerCase();
    if (db.users.some((user) => user.email === email && user.id !== session.id)) return fail(409, "هذا البريد الشخصي مسجّل مسبقًا.");
    session.firstName = String(body.firstName || "").trim();
    session.lastName = String(body.lastName || "").trim();
    session.phone = String(body.phone || "").replace(/\s/g, "");
    session.email = email;
    session.companyEmail = String(body.companyEmail || "").trim().toLowerCase();
    session.companyName = String(body.companyName || "").trim();
    save(db);
    return answer(200, { user: publicUser(session) });
  }

  if (method === "GET" && path === "/api/rewards") {
    if (!session) return fail(401, "يلزم تسجيل الدخول");
    const vouchers = db.vouchers.filter((voucher) => voucher.userId === session.id);
    const ledger = db.ledger.filter((entry) => entry.userId === session.id);
    const balanceHalalas = ledger.reduce((sum, entry) => sum + entry.amountHalalas, 0);
    return answer(200, { balanceHalalas, vouchers, ledger });
  }

  if (method === "POST" && path === "/api/orders") {
    if (!session) return fail(401, "يلزم تسجيل الدخول");
    const body = await readBody(init);
    const items = (Array.isArray(body.items) ? body.items : []) as DemoLine[];
    if (!items.length) return fail(400, "يرجى مراجعة الطلب وإكمال البيانات الناقصة.");
    const restaurant = getRestaurant(String(body.restaurantId || ""));
    if (!restaurant) return fail(400, "المطعم غير متاح لاستقبال الطلبات.");
    const mealType = String(body.mealType || "");
    if (mealType !== "breakfast" && mealType !== "lunch" && mealType !== "dinner") return fail(400, "يرجى اختيار نوع الوجبة.");
    if (!timeFitsMeal(String(body.pickupTime || ""), mealType)) {
      return fail(400, "وقت الاستلام يجب أن يكون داخل فترة الوجبة المختارة.");
    }
    let subtotal = 0;
    const lines: DemoLine[] = [];
    for (const line of items) {
      const unit = unitPrice(restaurant.id, String(line.itemId), String(line.tier), Number(line.unitPrice) || 0);
      if (unit == null) return fail(400, "المطعم غير متاح لاستقبال الطلبات.");
      const qty = Number(line.qty) || 0;
      lines.push({ itemId: String(line.itemId), name: String(line.name || ""), tier: line.tier, unitPrice: unit, qty });
      subtotal += unit * 100 * qty;
    }
    const voucherId = body.voucherId ? String(body.voucherId) : "";
    let discount = 0;
    const voucher = voucherId ? db.vouchers.find((item) => item.id === voucherId) : undefined;
    if (voucherId) {
      if (!voucher || voucher.userId !== session.id) return fail(403, "الفوتشر غير صالح لهذا الحساب.");
      if (voucher.status !== "available") return fail(409, "هذا الفوتشر غير متاح للاستخدام.");
      if (subtotal < VOUCHER_MIN_ORDER_HALALAS) return fail(400, "لا يمكن استخدام الفوتشر على طلب أقل من 100 ريال.");
      discount = Math.min(voucher.valueHalalas, subtotal);
    }
    db.seq += 1;
    const id = crypto.randomUUID();
    const order: DemoOrder = {
      id,
      publicNo: `QY-${1000 + db.seq}`,
      userId: session.id,
      cityId: String(body.cityId || restaurant.cityId),
      cityName: String(body.cityName || ""),
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      clientName: `${session.firstName} ${session.lastName}`.trim(),
      phone: session.phone,
      personalEmail: session.email,
      companyEmail: session.companyEmail,
      companyName: session.companyName,
      mealType,
      items: lines,
      attendees: Number(body.attendees) || 0,
      eventDate: String(body.eventDate || "").slice(0, 10),
      pickupTime: String(body.pickupTime || ""),
      pickupLocation: String(body.pickupLocation || "").trim(),
      notes: String(body.notes || "").trim(),
      status: "pending_restaurant",
      cancelRequested: false,
      createdAt: new Date().toISOString(),
      subtotalHalalas: subtotal,
      voucherDiscountHalalas: discount,
      totalHalalas: Math.max(0, subtotal - discount),
      voucherId: voucherId || undefined,
      voucherUse: voucherId ? "reserved" : "none",
      wifaqCoveredHalalas: discount,
      rewardStatus: "pending",
      rewardHalalas: 0,
    };
    db.orders.unshift(order);
    if (voucher) {
      voucher.status = "reserved";
      voucher.reservedOrderId = id;
      db.ledger.unshift({
        id: crypto.randomUUID(),
        userId: session.id,
        kind: "voucher_reserved",
        at: order.createdAt,
        amountHalalas: 0,
        balanceAfterHalalas: db.ledger.filter((entry) => entry.userId === session.id).reduce((sum, entry) => sum + entry.amountHalalas, 0),
        orderId: id,
        voucherId: voucher.id,
      });
    }
    save(db);
    return answer(200, { order });
  }

  if (method === "GET" && path === "/api/orders") {
    if (!session) return fail(401, "يلزم تسجيل الدخول");
    return answer(200, { orders: db.orders.filter((order) => order.userId === session.id) });
  }

  const one = /^\/api\/orders\/([^/]+)$/.exec(path);
  if (method === "GET" && one) {
    if (!session) return fail(401, "يلزم تسجيل الدخول");
    const order = db.orders.find((item) => item.id === one[1] && item.userId === session.id);
    if (!order) return fail(404, "لم نجد هذا الطلب");
    return answer(200, { order });
  }

  const cancel = /^\/api\/orders\/([^/]+)\/cancel-request$/.exec(path);
  if (method === "POST" && cancel) {
    if (!session) return fail(401, "يلزم تسجيل الدخول");
    const order = db.orders.find((item) => item.id === cancel[1] && item.userId === session.id);
    if (!order) return fail(404, "لا يمكن إلغاء هذا الطلب");
    if (order.cancelRequested) return fail(409, "تم إرسال طلب الإلغاء من قبل");
    if (order.status !== "pending_restaurant" && order.status !== "confirmed") return fail(409, "لا يمكن إلغاء هذا الطلب الآن");
    order.cancelRequested = true;
    order.cancelRequestedAt = new Date().toISOString();
    save(db);
    return answer(200, { ok: true });
  }

  const rate = /^\/api\/orders\/([^/]+)\/rate$/.exec(path);
  if (method === "POST" && rate) return fail(409, "لا يمكن حفظ التقييم الآن");

  return fail(404, "المسار غير موجود");
}

export function installPagesDemo() {
  if (!window.location.hostname.endsWith("github.io")) return;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = requestPath(input);
    if (!path.startsWith("/api/")) return original(input, init);
    try {
      return await handle(path, init);
    } catch (error) {
      return fail(500, error instanceof Error ? error.message : "تعذر تنفيذ العملية.");
    }
  };
}
