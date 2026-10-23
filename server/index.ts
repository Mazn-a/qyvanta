import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { timeFitsMeal } from "../src/meals";
import { hashPassword, parsePerms, readToken, signToken, verifyPassword } from "./auth";
import { migrate, one, query } from "./db";

const root = dirname(fileURLToPath(import.meta.url));
const uploadDir = resolve(root, "uploads");
const reportUploadDir = resolve(uploadDir, "reports");
const PORT = Number(process.env.WIFAQ_API_PORT || 5181);
const REWARD_PERCENT = 5;
const VOUCHER_VALUE = 100_00;
const VOUCHER_MIN = 100_00;

mkdirSync(uploadDir, { recursive: true });
mkdirSync(reportUploadDir, { recursive: true });

type Session = { id: string; kind: string; restaurantId: string | null; permissions: string[] };
type OrderRow = Record<string, unknown>;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, status: number, error: string) {
  json(res, status, { error });
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

async function readBuffer(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const REPORT_MIME: Record<string, { kind: "image" | "video"; ext: string }> = {
  "image/jpeg": { kind: "image", ext: ".jpg" },
  "image/jpg": { kind: "image", ext: ".jpg" },
  "image/png": { kind: "image", ext: ".png" },
  "image/gif": { kind: "image", ext: ".gif" },
  "image/webp": { kind: "image", ext: ".webp" },
  "video/mp4": { kind: "video", ext: ".mp4" },
  "video/webm": { kind: "video", ext: ".webm" },
  "video/quicktime": { kind: "video", ext: ".mov" },
  "video/x-m4v": { kind: "video", ext: ".m4v" },
};

function parseMultipart(buf: Buffer, contentType: string) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!match) return { fields: {} as Record<string, string>, file: undefined as { filename: string; mime: string; data: Buffer } | undefined };
  const boundary = Buffer.from(`--${(match[1] || match[2]).trim()}`);
  const fields: Record<string, string> = {};
  let file: { filename: string; mime: string; data: Buffer } | undefined;
  let cursor = buf.indexOf(boundary);
  while (cursor !== -1) {
    let offset = cursor + boundary.length;
    if (buf[offset] === 13 && buf[offset + 1] === 10) offset += 2;
    if (buf[offset] === 45 && buf[offset + 1] === 45) break;
    const headerEnd = buf.indexOf("\r\n\r\n", offset);
    if (headerEnd < 0) break;
    const header = buf.slice(offset, headerEnd).toString("utf8");
    const next = buf.indexOf(boundary, headerEnd + 4);
    if (next < 0) break;
    const data = buf.slice(headerEnd + 4, next - 2);
    const name = /name="([^"]+)"/i.exec(header)?.[1];
    const filename = /filename="([^"]*)"/i.exec(header)?.[1] ?? "";
    const mime = /Content-Type:\s*([^\r\n]+)/i.exec(header)?.[1]?.trim() || "application/octet-stream";
    if (name === "media" && filename) file = { filename, mime, data };
    else if (name) fields[name] = data.toString("utf8");
    cursor = next;
  }
  return { fields, file };
}

function reportMediaUrl(filename: string | null) {
  return filename ? `/api/media/reports/${filename}` : null;
}

function tokenOf(req: IncomingMessage) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

function sessionOf(req: IncomingMessage): Session | null {
  return readToken(tokenOf(req));
}

function hasPerm(session: Session, ...needed: string[]) {
  if (session.kind === "admin" && session.permissions.includes("system")) return true;
  return needed.some((item) => session.permissions.includes(item));
}

function riyadhToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
}

function orderNo(id: string) {
  let n = 0;
  for (const char of id) n = (n * 33 + char.charCodeAt(0)) % 9000;
  return `QY-${1000 + n}`;
}

function canSeePhone(order: { status: string; event_date: string }) {
  return order.status === "confirmed" && String(order.event_date).slice(0, 10) <= riyadhToday();
}

function isoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const VISIT_PAGES = new Set(["marketing", "houses", "order", "login", "track", "orders", "profile", "legal", "rewards"]);

function visitStop(page: string, step: number) {
  if (page === "houses") return "استعراض المطاعم";
  if (page === "order") {
    return (
      ["اختيار المدينة", "اختيار المطعم", "اختيار الوجبة", "عدد الحضور", "اختيار الأصناف", "موعد المناسبة", "موقع الاستلام", "مراجعة الطلب"][step] ?? "بدء الطلب"
    );
  }
  if (page === "login") return "صفحة الدخول";
  if (page === "rewards") return "المكافآت";
  if (page === "track") return "متابعة الطلب";
  if (page === "orders") return "طلباتي";
  if (page === "profile") return "الملف الشخصي";
  if (page === "legal") return "الصفحات القانونية";
  return "تصفّح الرئيسية";
}

async function insightPayload() {
  const visitors = await query<{
    id: string;
    kind: string;
    user_id: string | null;
    last_seen: unknown;
    stop_label: string;
    started_order: boolean;
    reached_review: boolean;
    visits: number;
  }>("SELECT id, kind, user_id, last_seen, stop_label, started_order, reached_review, visits FROM visitors");
  const users = await query<{ id: string; first_name: string; last_name: string }>(
    "SELECT id, first_name, last_name FROM users WHERE kind = 'customer'",
  );
  const orderCounts = await query<{ user_id: string; n: number }>(
    "SELECT user_id, COUNT(*)::int AS n FROM orders GROUP BY user_id",
  );
  const ordersByUser = new Map(orderCounts.map((row) => [row.user_id, row.n]));
  const names = new Map(users.map((row) => [row.id, `${row.first_name} ${row.last_name}`.trim()]));
  const stopMap = new Map<string, { label: string; guests: number; customers: number; total: number }>();
  for (const row of visitors) {
    const sent = row.user_id ? (ordersByUser.get(row.user_id) ?? 0) > 0 : false;
    const label = sent ? "أكمل طلبًا" : row.stop_label;
    const current = stopMap.get(label) ?? { label, guests: 0, customers: 0, total: 0 };
    if (row.kind === "customer") current.customers += 1;
    else current.guests += 1;
    current.total += 1;
    stopMap.set(label, current);
  }
  const people = visitors
    .map((row) => {
      const orders = row.user_id ? ordersByUser.get(row.user_id) ?? 0 : 0;
      return {
        id: row.id,
        userId: row.user_id,
        name: row.kind === "customer" ? names.get(row.user_id ?? "") || "عميل" : `زائر ${row.id.slice(0, 4)}`,
        stop: orders > 0 ? "أكمل طلبًا" : row.stop_label,
        lastSeen: row.last_seen instanceof Date ? row.last_seen.toISOString() : String(row.last_seen ?? ""),
        visits: Number(row.visits),
        orders,
      };
    })
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  return {
    visitors: visitors.length,
    sessions: visitors.reduce((sum, row) => sum + Number(row.visits), 0),
    guests: visitors.filter((row) => row.kind === "guest").length,
    customers: users.length,
    sentOrders: orderCounts.length,
    funnel: [
      { label: "زار الموقع", value: visitors.length },
      { label: "بدأ الطلب", value: visitors.filter((row) => row.started_order).length },
      { label: "وصل للمراجعة", value: visitors.filter((row) => row.reached_review).length },
      { label: "أرسل طلبًا", value: visitors.filter((row) => row.user_id && (ordersByUser.get(row.user_id) ?? 0) > 0).length },
    ],
    stops: [...stopMap.values()].sort((a, b) => b.total - a.total),
    guestsList: people.filter((row) => !row.userId).slice(0, 12),
    customersList: people.filter((row) => row.userId).slice(0, 12),
  };
}

async function audit(actorId: string | null, action: string, entity: string, entityId?: string, detail?: unknown) {
  await query("INSERT INTO audit_log (id, actor_id, action, entity, entity_id, detail) VALUES ($1, $2, $3, $4, $5, $6)", [
    randomUUID(),
    actorId,
    action,
    entity,
    entityId ?? null,
    detail ? JSON.stringify(detail) : null,
  ]);
}

async function addEvent(orderId: string, actorId: string | null, fromStatus: string | null, toStatus: string, reason?: string) {
  await query("INSERT INTO order_events (id, order_id, actor_id, from_status, to_status, reason) VALUES ($1, $2, $3, $4, $5, $6)", [
    randomUUID(),
    orderId,
    actorId,
    fromStatus,
    toStatus,
    reason ?? null,
  ]);
}

async function balanceOf(userId: string) {
  const row = await one<{ balance: number }>("SELECT COALESCE(SUM(amount_halalas), 0)::int AS balance FROM reward_ledger WHERE user_id = $1", [userId]);
  return row?.balance ?? 0;
}

async function addLedger(input: {
  userId: string;
  kind: string;
  amount: number;
  orderId?: string | null;
  voucherId?: string | null;
  eligible?: number | null;
  reason?: string | null;
  actorId?: string | null;
}) {
  const after = (await balanceOf(input.userId)) + input.amount;
  await query(
    `INSERT INTO reward_ledger (id, user_id, kind, amount_halalas, balance_after_halalas, order_id, voucher_id, eligible_halalas, reason, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [randomUUID(), input.userId, input.kind, input.amount, after, input.orderId ?? null, input.voucherId ?? null, input.eligible ?? null, input.reason ?? null, input.actorId ?? null],
  );
  return after;
}

async function orderItems(orderId: string) {
  return query(
    "SELECT item_id AS \"itemId\", name, tier, unit_price AS \"unitPrice\", qty FROM order_items WHERE order_id = $1",
    [orderId],
  );
}

async function mapOrder(row: OrderRow, opts: { phone: boolean; extra?: boolean }) {
  const items = await orderItems(String(row.id));
  const attachments = opts.extra
    ? await query("SELECT id, kind, filename, mime, uploaded_at AS \"uploadedAt\" FROM attachments WHERE order_id = $1", [row.id])
    : [];
  return {
    id: row.id,
    publicNo: row.public_no,
    userId: row.user_id,
    restaurantId: row.restaurant_id,
    cityId: row.city_id,
    cityName: row.city_name,
    restaurantName: row.restaurant_name,
    clientName: row.client_name,
    phone: opts.phone ? row.phone : "",
    phoneHidden: !opts.phone,
    personalEmail: row.personal_email,
    companyEmail: row.company_email,
    companyName: row.company_name,
    mealType: row.meal_type,
    attendees: row.attendees,
    eventDate: String(row.event_date).slice(0, 10),
    pickupTime: row.pickup_time,
    pickupLocation: row.pickup_location,
    notes: row.notes,
    items,
    status: row.status,
    cancelRequested: row.cancel_requested,
    cancelRequestedAt: row.cancel_requested_at,
    rejectReason: row.reject_reason,
    subtotalHalalas: row.subtotal_halalas,
    voucherDiscountHalalas: row.voucher_discount_halalas,
    totalHalalas: row.total_halalas,
    voucherId: row.voucher_id,
    voucherUse: row.voucher_use,
    wifaqCoveredHalalas: row.wifaq_covered_halalas,
    rewardStatus: row.reward_status,
    rewardHalalas: row.reward_halalas,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    rejectedAt: row.rejected_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
    rating: row.rating_json ? JSON.parse(String(row.rating_json)) : undefined,
    attachments,
  };
}

async function releaseVoucher(order: OrderRow, actorId: string | null) {
  if (order.voucher_use !== "reserved" || !order.voucher_id) return;
  await query(
    "UPDATE vouchers SET status = 'available', reserved_order_id = NULL WHERE id = $1 AND status = 'reserved'",
    [order.voucher_id],
  );
  await addLedger({ userId: String(order.user_id), kind: "voucher_released", amount: 0, orderId: String(order.id), voucherId: String(order.voucher_id), actorId });
}

async function completeRewards(order: OrderRow) {
  const eligible = Number(order.total_halalas);
  const reward = Math.round((eligible * REWARD_PERCENT) / 100);
  let balance = await balanceOf(String(order.user_id));
  if (reward > 0) {
    balance = await addLedger({ userId: String(order.user_id), kind: "earn", amount: reward, orderId: String(order.id), eligible });
  }
  const count = Math.floor(balance / VOUCHER_VALUE);
  for (let i = 0; i < count; i += 1) {
    const voucherId = randomUUID();
    await query("INSERT INTO vouchers (id, user_id, value_halalas, status) VALUES ($1, $2, $3, 'available')", [voucherId, order.user_id, VOUCHER_VALUE]);
    await addLedger({ userId: String(order.user_id), kind: "voucher_issued", amount: -VOUCHER_VALUE, orderId: String(order.id), voucherId });
  }
  return reward;
}

async function publicCatalog() {
  const cities = await query<{ id: string; name: string; nameEn: string }>(
    `SELECT id, name, name_en AS "nameEn" FROM cities ORDER BY name`,
  );
  const houses = await query<{
    id: string;
    name: string;
    cityId: string;
    district: string;
    specialty: string;
    acceptingOrders: boolean;
  }>(
    `SELECT id, name, city_id AS "cityId", district, specialty, accepting_orders AS "acceptingOrders"
       FROM restaurants WHERE active = TRUE ORDER BY name`,
  );
  const items = await query<{
    id: string;
    restaurant_id: string;
    meal_type: "breakfast" | "lunch" | "dinner";
    name: string;
    description: string;
    price_luxury: number;
    price_regular: number;
  }>("SELECT id, restaurant_id, meal_type, name, description, price_luxury, price_regular FROM menu_items WHERE available = TRUE AND published = TRUE");
  return {
    cities,
    restaurants: houses.map((house) => ({
      id: house.id,
      cityId: house.cityId,
      name: house.name,
      district: house.district,
      specialty: house.specialty,
      acceptingOrders: house.acceptingOrders,
      menu: {
        breakfast: items.filter((item) => item.restaurant_id === house.id && item.meal_type === "breakfast").map(menuLine),
        lunch: items.filter((item) => item.restaurant_id === house.id && item.meal_type === "lunch").map(menuLine),
        dinner: items.filter((item) => item.restaurant_id === house.id && item.meal_type === "dinner").map(menuLine),
      },
    })),
  };
}

function menuLine(item: { id: string; name: string; description: string; price_luxury: number; price_regular: number }) {
  return { id: item.id, name: item.name, description: item.description, prices: { luxury: item.price_luxury, regular: item.price_regular } };
}

async function seedUsers() {
  const admin = await one("SELECT id FROM users WHERE email = 'admin@wifaq.local'");
  if (!admin) {
    await query(
      `INSERT INTO users (id, kind, email, password_hash, first_name, last_name, permissions)
       VALUES ($1, 'admin', 'admin@wifaq.local', $2, 'إدارة', 'قيفانتا', $3)`,
      [randomUUID(), hashPassword("WifaqAdmin2026"), JSON.stringify(["system", "ops", "finance"])],
    );
  } else {
    await query("UPDATE users SET last_name = 'قيفانتا' WHERE email = 'admin@wifaq.local' AND last_name = 'وفاق'");
  }
  const restaurants = await query<{ id: string; name: string }>("SELECT id, name FROM restaurants");
  for (const restaurant of restaurants) {
    const email = `${restaurant.id}@wifaq.local`;
    const exists = await one("SELECT id FROM users WHERE email = $1", [email]);
    if (exists) continue;
    await query(
      `INSERT INTO users (id, kind, email, password_hash, first_name, last_name, restaurant_id, permissions)
       VALUES ($1, 'restaurant', $2, $3, $4, 'المطعم', $5, $6)`,
      [
        randomUUID(),
        email,
        hashPassword("WifaqRest2026"),
        restaurant.name,
        restaurant.id,
        JSON.stringify(["manager", "orders", "delivery", "accounts"]),
      ],
    );
  }
  await seedDemoCustomer();
}

/** حساب عرض لموقع العميل: يدخلون ويجربون الفوتشر دون انتظار مكافأة مكتملة. */
async function seedDemoCustomer() {
  const email = "demo@qyvanta.local";
  let user = await one<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (!user) {
    const id = randomUUID();
    await query(
      `INSERT INTO users (id, kind, email, password_hash, first_name, last_name, phone, permissions)
       VALUES ($1, 'customer', $2, $3, 'ضيف', 'العرض', '0550001122', '[]')`,
      [id, email, hashPassword("QyvantaDemo2026")],
    );
    user = { id };
  }
  const ready = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM vouchers WHERE user_id = $1 AND status = 'available'", [user.id]);
  const missing = Math.max(0, 5 - (ready?.n ?? 0));
  for (let index = 0; index < missing; index += 1) {
    await query("INSERT INTO vouchers (id, user_id, value_halalas, status) VALUES ($1, $2, $3, 'available')", [
      randomUUID(),
      user.id,
      100_00,
    ]);
  }
}

function pathOf(req: IncomingMessage) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  return { method: req.method || "GET", path: url.pathname, url };
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const { method, path, url } = pathOf(req);
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
    });
    res.end();
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  try {
    if (method === "GET" && path === "/api/health") {
      json(res, 200, { ok: true, mode: process.env.DATABASE_URL ? "remote" : "local" });
      return;
    }

    if (method === "GET" && path === "/api/catalog") {
      json(res, 200, await publicCatalog());
      return;
    }

    if (method === "GET" && path === "/api/venues") {
      const venues = await query<{ id: string; name: string; district: string; email: string }>(
        `SELECT r.id, r.name, r.district, u.email
           FROM restaurants r
           JOIN users u ON u.restaurant_id = r.id AND u.kind = 'restaurant'
          WHERE r.active = TRUE
          ORDER BY r.name`,
      );
      json(res, 200, { venues });
      return;
    }

    if (method === "POST" && path === "/api/visits/ping") {
      const early = sessionOf(req);
      if (early?.kind === "admin" || early?.kind === "restaurant") {
        json(res, 200, { ok: true, skipped: true });
        return;
      }
      const body = await readBody(req);
      const visitorId = String(body.visitorId || "");
      const page = String(body.page || "marketing");
      const step = Math.max(0, Math.min(8, Number(body.step) || 0));
      if (!/^[0-9a-f-]{36}$/i.test(visitorId) || !VISIT_PAGES.has(page)) {
        json(res, 200, { ok: true, skipped: true });
        return;
      }
      const kind = early?.kind === "customer" ? "customer" : "guest";
      const userId = kind === "customer" ? early?.id ?? null : null;
      const started = page === "order";
      const review = page === "order" && step >= 7;
      const bump = body.sessionNew ? 1 : 0;
      await query(
        `INSERT INTO visitors (id, kind, user_id, page, step, stop_label, started_order, reached_review, visits)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)
         ON CONFLICT (id) DO UPDATE SET
           kind = CASE WHEN EXCLUDED.kind = 'customer' THEN 'customer' ELSE visitors.kind END,
           user_id = COALESCE(EXCLUDED.user_id, visitors.user_id),
           last_seen = NOW(),
           page = EXCLUDED.page,
           step = EXCLUDED.step,
           stop_label = EXCLUDED.stop_label,
           started_order = visitors.started_order OR EXCLUDED.started_order,
           reached_review = visitors.reached_review OR EXCLUDED.reached_review,
           visits = visitors.visits + $9`,
        [visitorId, kind, userId, page, step, visitStop(page, step), started, review, bump],
      );
      json(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && path === "/api/reports") {
      const contentType = String(req.headers["content-type"] || "");
      const raw = await readBuffer(req);
      if (raw.length > 20 * 1024 * 1024) return fail(res, 400, "حجم المرفق أكبر من 20 ميغابايت.");
      const parsed = contentType.includes("multipart/form-data")
        ? parseMultipart(raw, contentType)
        : { fields: JSON.parse(raw.length ? raw.toString("utf8") : "{}") as Record<string, string>, file: undefined };
      const message = String(parsed.fields.message || "").trim();
      if (message.length < 5) return fail(res, 400, "اكتب وصف المشكلة بوضوح (٥ أحرف على الأقل).");
      let mediaFilename: string | null = null;
      let mediaMime: string | null = null;
      let mediaKind: "image" | "video" | null = null;
      let mediaName: string | null = null;
      if (parsed.file?.data.length) {
        const meta = REPORT_MIME[parsed.file.mime.toLowerCase()];
        if (!meta) return fail(res, 400, "يُسمح بالصور أو فيديو قصير فقط (mp4/webm).");
        if (parsed.file.data.length > 20 * 1024 * 1024) return fail(res, 400, "حجم المرفق أكبر من 20 ميغابايت.");
        mediaFilename = `${randomUUID()}${meta.ext}`;
        mediaMime = parsed.file.mime;
        mediaKind = meta.kind;
        mediaName = basename(parsed.file.filename).slice(0, 180);
        writeFileSync(resolve(reportUploadDir, mediaFilename), parsed.file.data);
      }
      const early = sessionOf(req);
      const userId = early?.kind === "customer" ? early.id : null;
      const id = randomUUID();
      await query(
        `INSERT INTO reports (id, user_id, name, contact, message, page, order_no, media_filename, media_mime, media_kind, media_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          userId,
          String(parsed.fields.name || "").trim().slice(0, 80),
          String(parsed.fields.contact || "").trim().slice(0, 120),
          message.slice(0, 2000),
          String(parsed.fields.page || "").trim().slice(0, 180),
          String(parsed.fields.orderNo || parsed.fields.order_no || "").trim().slice(0, 40),
          mediaFilename,
          mediaMime,
          mediaKind,
          mediaName,
        ],
      );
      json(res, 201, { ok: true, id });
      return;
    }

    const reportFile = /^\/api\/media\/reports\/([^/]+)$/.exec(path);
    if (method === "GET" && reportFile) {
      const name = reportFile[1];
      if (!/^[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|m4v)$/i.test(name)) {
        return fail(res, 400, "المرفق غير صالح");
      }
      const filePath = resolve(reportUploadDir, name);
      if (!filePath.startsWith(reportUploadDir) || !existsSync(filePath)) return fail(res, 404, "المرفق غير موجود");
      const ext = extname(name).toLowerCase();
      const mime =
        ext === ".png" ? "image/png"
        : ext === ".webp" ? "image/webp"
        : ext === ".gif" ? "image/gif"
        : ext === ".mp4" ? "video/mp4"
        : ext === ".webm" ? "video/webm"
        : ext === ".mov" ? "video/quicktime"
        : ext === ".m4v" ? "video/x-m4v"
        : "image/jpeg";
      res.writeHead(200, { "Content-Type": mime, "Cache-Control": "private, max-age=3600" });
      res.end(readFileSync(filePath));
      return;
    }

    if (method === "POST" && path === "/api/auth/register") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || password.length < 8) return fail(res, 400, "بيانات الحساب غير مكتملة.");
      const taken = await one("SELECT id FROM users WHERE email = $1", [email]);
      if (taken) return fail(res, 409, "هذا البريد مسجّل مسبقًا.");
      const user = {
        id: randomUUID(),
        firstName: String(body.firstName || "").trim(),
        lastName: String(body.lastName || "").trim(),
        phone: String(body.phone || "").replace(/\s/g, ""),
        email,
        companyEmail: String(body.companyEmail || "").trim().toLowerCase(),
        companyName: String(body.companyName || "").trim(),
      };
      await query(
        `INSERT INTO users (id, kind, email, password_hash, first_name, last_name, phone, company_email, company_name, permissions)
         VALUES ($1, 'customer', $2, $3, $4, $5, $6, $7, $8, '[]')`,
        [user.id, email, hashPassword(password), user.firstName, user.lastName, user.phone, user.companyEmail, user.companyName],
      );
      const token = signToken({ id: user.id, kind: "customer", restaurantId: null, permissions: [] });
      json(res, 200, { token, user });
      return;
    }

    if (method === "POST" && path === "/api/auth/login") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const user = await one<Record<string, unknown>>("SELECT * FROM users WHERE email = $1", [email]);
      if (!user || !user.active || !verifyPassword(String(body.password || ""), String(user.password_hash))) {
        return fail(res, 401, "البريد أو كلمة المرور غير صحيحة.");
      }
      const permissions = parsePerms(String(user.permissions));
      const token = signToken({
        id: String(user.id),
        kind: String(user.kind),
        restaurantId: user.restaurant_id ? String(user.restaurant_id) : null,
        permissions,
      });
      json(res, 200, {
        token,
        user: publicUser(user),
      });
      return;
    }

    const session = sessionOf(req);

    if (method === "GET" && path === "/api/me") {
      if (!session) return fail(res, 401, "يلزم تسجيل الدخول");
      const user = await one<Record<string, unknown>>("SELECT * FROM users WHERE id = $1", [session.id]);
      if (!user) return fail(res, 401, "الحساب غير موجود");
      json(res, 200, { user: publicUser(user), kind: session.kind, permissions: session.permissions, restaurantId: session.restaurantId });
      return;
    }

    if (method === "PATCH" && path === "/api/me") {
      if (!session || session.kind !== "customer") return fail(res, 401, "يلزم تسجيل الدخول");
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const taken = await one("SELECT id FROM users WHERE email = $1 AND id <> $2", [email, session.id]);
      if (taken) return fail(res, 409, "هذا البريد الشخصي مسجّل مسبقًا.");
      await query(
        `UPDATE users SET first_name=$1, last_name=$2, phone=$3, email=$4, company_email=$5, company_name=$6 WHERE id=$7`,
        [
          String(body.firstName || "").trim(),
          String(body.lastName || "").trim(),
          String(body.phone || "").replace(/\s/g, ""),
          email,
          String(body.companyEmail || "").trim().toLowerCase(),
          String(body.companyName || "").trim(),
          session.id,
        ],
      );
      const user = await one<Record<string, unknown>>("SELECT * FROM users WHERE id = $1", [session.id]);
      json(res, 200, { user: publicUser(user!) });
      return;
    }

    if (method === "GET" && path === "/api/rewards") {
      if (!session || session.kind !== "customer") return fail(res, 401, "يلزم تسجيل الدخول");
      const [vouchers, ledger] = await Promise.all([
        query("SELECT * FROM vouchers WHERE user_id = $1 ORDER BY issued_at DESC", [session.id]),
        query("SELECT * FROM reward_ledger WHERE user_id = $1 ORDER BY at DESC", [session.id]),
      ]);
      json(res, 200, {
        balanceHalalas: await balanceOf(session.id),
        vouchers: vouchers.map(mapVoucher),
        ledger: ledger.map(mapLedger),
      });
      return;
    }

    if (method === "POST" && path === "/api/orders") {
      if (!session || session.kind !== "customer") return fail(res, 401, "يلزم تسجيل الدخول");
      const body = await readBody(req);
      const user = await one<Record<string, unknown>>("SELECT * FROM users WHERE id = $1", [session.id]);
      if (!user) return fail(res, 401, "يلزم تسجيل الدخول");
      const items = (Array.isArray(body.items) ? body.items : []) as { itemId: string; name: string; tier: string; unitPrice: number; qty: number }[];
      if (!items.length) return fail(res, 400, "يرجى مراجعة الطلب وإكمال البيانات الناقصة.");
      const restaurant = await one("SELECT * FROM restaurants WHERE id = $1 AND active = TRUE AND accepting_orders = TRUE", [body.restaurantId]);
      if (!restaurant) return fail(res, 400, "المطعم غير متاح لاستقبال الطلبات.");
      const mealType = String(body.mealType || "");
      if (mealType !== "breakfast" && mealType !== "lunch" && mealType !== "dinner") {
        return fail(res, 400, "يرجى اختيار نوع الوجبة.");
      }
      if (!timeFitsMeal(String(body.pickupTime || ""), mealType)) {
        return fail(res, 400, "وقت الاستلام يجب أن يكون داخل فترة الوجبة المختارة.");
      }
      let subtotal = 0;
      for (const line of items) {
        const menu = await one<{ price_luxury: number; price_regular: number }>("SELECT price_luxury, price_regular FROM menu_items WHERE id = $1 AND restaurant_id = $2", [
          line.itemId,
          body.restaurantId,
        ]);
        const unit = line.tier === "luxury" ? Number(menu?.price_luxury ?? line.unitPrice) : Number(menu?.price_regular ?? line.unitPrice);
        line.unitPrice = unit;
        subtotal += unit * 100 * line.qty;
      }
      const voucherId = body.voucherId ? String(body.voucherId) : "";
      let discount = 0;
      if (voucherId) {
        const voucher = await one<Record<string, unknown>>("SELECT * FROM vouchers WHERE id = $1", [voucherId]);
        if (!voucher || voucher.user_id !== session.id) return fail(res, 403, "الفوتشر غير صالح لهذا الحساب.");
        if (voucher.status !== "available") return fail(res, 409, "هذا الفوتشر غير متاح للاستخدام.");
        if (subtotal < VOUCHER_MIN) return fail(res, 400, "لا يمكن استخدام الفوتشر على طلب أقل من 100 ريال.");
        discount = Math.min(Number(voucher.value_halalas), subtotal);
      }
      const id = randomUUID();
      await query(
        `INSERT INTO orders (
          id, public_no, user_id, restaurant_id, city_id, city_name, restaurant_name, client_name, phone, personal_email, company_email, company_name,
          meal_type, attendees, event_date, pickup_time, pickup_location, notes, status, subtotal_halalas, voucher_discount_halalas, total_halalas,
          voucher_id, voucher_use, wifaq_covered_halalas
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending_restaurant',$19,$20,$21,$22,$23,$24)`,
        [
          id,
          orderNo(id),
          session.id,
          body.restaurantId,
          body.cityId,
          body.cityName,
          restaurant.name,
          `${user.first_name} ${user.last_name}`.trim(),
          user.phone,
          user.email,
          user.company_email,
          user.company_name,
          body.mealType,
          Number(body.attendees),
          body.eventDate,
          body.pickupTime,
          String(body.pickupLocation || "").trim(),
          String(body.notes || "").trim(),
          subtotal,
          discount,
          Math.max(0, subtotal - discount),
          voucherId || null,
          voucherId ? "reserved" : "none",
          discount,
        ],
      );
      for (const line of items) {
        await query(
          "INSERT INTO order_items (id, order_id, item_id, name, tier, unit_price, qty, line_halalas) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
          [randomUUID(), id, line.itemId, line.name, line.tier, line.unitPrice, line.qty, line.unitPrice * 100 * line.qty],
        );
      }
      if (voucherId) {
        await query("UPDATE vouchers SET status = 'reserved', reserved_order_id = $1 WHERE id = $2", [id, voucherId]);
        await addLedger({ userId: session.id, kind: "voucher_reserved", amount: 0, orderId: id, voucherId });
      }
      await addEvent(id, session.id, null, "pending_restaurant");
      await audit(session.id, "order.place", "order", id);
      const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1", [id]);
      json(res, 200, { order: await mapOrder(row!, { phone: true, extra: true }) });
      return;
    }

    if (method === "GET" && path === "/api/orders") {
      if (!session) return fail(res, 401, "يلزم تسجيل الدخول");
      if (session.kind === "customer") {
        const rows = await query<OrderRow>("SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC", [session.id]);
        json(res, 200, { orders: await Promise.all(rows.map((row) => mapOrder(row, { phone: true }))) });
        return;
      }
      return fail(res, 403, "غير مصرح");
    }

    const customerOrder = /^\/api\/orders\/([^/]+)$/.exec(path);
    if (method === "GET" && customerOrder && session?.kind === "customer") {
      const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1 AND user_id = $2", [customerOrder[1], session.id]);
      if (!row) return fail(res, 404, "لم نجد هذا الطلب");
      json(res, 200, { order: await mapOrder(row, { phone: true, extra: true }) });
      return;
    }

    const cancelReq = /^\/api\/orders\/([^/]+)\/cancel-request$/.exec(path);
    if (method === "POST" && cancelReq && session?.kind === "customer") {
      const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1 AND user_id = $2", [cancelReq[1], session.id]);
      if (!row) return fail(res, 404, "لا يمكن إلغاء هذا الطلب");
      if (row.cancel_requested) return fail(res, 409, "تم إرسال طلب الإلغاء من قبل");
      if (row.status !== "pending_restaurant" && row.status !== "confirmed") return fail(res, 409, "لا يمكن إلغاء هذا الطلب الآن");
      await query("UPDATE orders SET cancel_requested = TRUE, cancel_requested_at = NOW() WHERE id = $1", [row.id]);
      await audit(session.id, "order.cancel_request", "order", String(row.id));
      json(res, 200, { ok: true });
      return;
    }

    const rateReq = /^\/api\/orders\/([^/]+)\/rate$/.exec(path);
    if (method === "POST" && rateReq && session?.kind === "customer") {
      const body = await readBody(req);
      const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1 AND user_id = $2", [rateReq[1], session.id]);
      if (!row || row.status !== "delivered" || row.rating_json) return fail(res, 409, "لا يمكن حفظ التقييم الآن");
      await query("UPDATE orders SET rating_json = $1 WHERE id = $2", [JSON.stringify(body), row.id]);
      json(res, 200, { ok: true });
      return;
    }

    if (session?.kind === "restaurant") {
      const ok = await restaurantRoutes(req, res, session, method, path);
      if (ok) return;
    }

    if (session?.kind === "admin") {
      const ok = await adminRoutes(req, res, session, method, path, url);
      if (ok) return;
    }

    fail(res, 404, "المسار غير موجود");
  } catch (error) {
    console.error(error);
    fail(res, 500, error instanceof Error ? error.message : "تعذر تنفيذ العملية.");
  }
}

function publicUser(user: Record<string, unknown>) {
  return {
    id: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.kind === "customer" ? user.phone : "",
    email: user.email,
    companyEmail: user.company_email ?? "",
    companyName: user.company_name ?? "",
    kind: user.kind,
    restaurantId: user.restaurant_id ?? null,
    permissions: parsePerms(String(user.permissions ?? "[]")),
  };
}

function mapVoucher(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    valueHalalas: row.value_halalas,
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    reservedOrderId: row.reserved_order_id,
    usedOrderId: row.used_order_id,
    usedAt: row.used_at,
  };
}

function mapLedger(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    at: row.at,
    amountHalalas: row.amount_halalas,
    balanceAfterHalalas: row.balance_after_halalas,
    orderId: row.order_id,
    voucherId: row.voucher_id,
    eligibleHalalas: row.eligible_halalas,
  };
}

async function restaurantRoutes(req: IncomingMessage, res: ServerResponse, session: Session, method: string, path: string) {
  const restaurantId = session.restaurantId;
  if (!restaurantId) return fail(res, 403, "الحساب غير مربوط بمطعم"), true;

  if (method === "GET" && path === "/api/restaurant/dashboard") {
    const rows = await query<OrderRow>("SELECT * FROM orders WHERE restaurant_id = $1", [restaurantId]);
    const today = riyadhToday();
    json(res, 200, {
      counts: {
        pending: rows.filter((o) => o.status === "pending_restaurant").length,
        confirmed: rows.filter((o) => o.status === "confirmed").length,
        today: rows.filter((o) => String(o.event_date).slice(0, 10) === today && o.status !== "rejected" && o.status !== "cancelled").length,
        upcoming: rows.filter((o) => String(o.event_date).slice(0, 10) > today && o.status === "confirmed").length,
        delivered: rows.filter((o) => o.status === "delivered").length,
        closed: rows.filter((o) => o.status === "rejected" || o.status === "cancelled").length,
        total: rows.length,
        valueHalalas: rows.filter((o) => o.status === "delivered" || o.status === "confirmed").reduce((sum, o) => sum + Number(o.subtotal_halalas), 0),
        pendingCoverHalalas: rows.filter((o) => o.status === "delivered" && Number(o.wifaq_covered_halalas) > 0 && !o.settlement_id).reduce((sum, o) => sum + Number(o.wifaq_covered_halalas), 0),
      },
      actionNeeded: await Promise.all(rows.filter((o) => o.status === "pending_restaurant" || o.cancel_requested).map((o) => mapOrder(o, { phone: false }))),
    });
    return true;
  }

  if (method === "GET" && path === "/api/restaurant/orders") {
    const rows = await query<OrderRow>("SELECT * FROM orders WHERE restaurant_id = $1 ORDER BY created_at DESC", [restaurantId]);
    json(res, 200, { orders: await Promise.all(rows.map((row) => mapOrder(row, { phone: false }))) });
    return true;
  }

  const oneOrder = /^\/api\/restaurant\/orders\/([^/]+)$/.exec(path);
  if (method === "GET" && oneOrder) {
    const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2", [oneOrder[1], restaurantId]);
    if (!row) return fail(res, 404, "الطلب غير موجود"), true;
    const reveal = canSeePhone({ status: String(row.status), event_date: String(row.event_date) }) && hasPerm(session, "manager", "delivery", "orders");
    if (reveal) {
      await query("INSERT INTO phone_access_log (id, order_id, actor_id) VALUES ($1, $2, $3)", [randomUUID(), row.id, session.id]);
    }
    const mapped = await mapOrder(row, { phone: Boolean(reveal), extra: true });
    json(res, 200, {
      order: {
        ...mapped,
        personalEmail: undefined,
        companyEmail: undefined,
        mealsValueHalalas: row.subtotal_halalas,
        customerPaysHalalas: row.total_halalas,
        wifaqCoverHalalas: row.wifaq_covered_halalas,
      },
    });
    return true;
  }

  const confirm = /^\/api\/restaurant\/orders\/([^/]+)\/confirm$/.exec(path);
  if (method === "POST" && confirm) {
    if (!hasPerm(session, "manager", "orders")) return fail(res, 403, "ليست لديك صلاحية تأكيد الطلب"), true;
    const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2", [confirm[1], restaurantId]);
    if (!row || row.status !== "pending_restaurant") return fail(res, 409, "لا يمكن تأكيد هذا الطلب في حالته الحالية"), true;
    await query("UPDATE orders SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = $1 WHERE id = $2", [session.id, row.id]);
    await addEvent(String(row.id), session.id, "pending_restaurant", "confirmed");
    await audit(session.id, "order.confirm", "order", String(row.id));
    json(res, 200, { ok: true });
    return true;
  }

  const reject = /^\/api\/restaurant\/orders\/([^/]+)\/reject$/.exec(path);
  if (method === "POST" && reject) {
    if (!hasPerm(session, "manager", "orders")) return fail(res, 403, "ليست لديك صلاحية رفض الطلب"), true;
    const body = await readBody(req);
    const reason = String(body.reason || "").trim();
    if (reason.length < 3) return fail(res, 400, "يلزم كتابة سبب تعذر التأكيد."), true;
    const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2", [reject[1], restaurantId]);
    if (!row || row.status !== "pending_restaurant") return fail(res, 409, "الرفض متاح فقط قبل تأكيد الطلب"), true;
    await releaseVoucher(row, session.id);
    await query(
      "UPDATE orders SET status = 'rejected', rejected_at = NOW(), rejected_by = $1, reject_reason = $2, reward_status = 'not_eligible', voucher_use = CASE WHEN voucher_use = 'reserved' THEN 'released' ELSE voucher_use END, voucher_discount_halalas = CASE WHEN voucher_use = 'reserved' THEN 0 ELSE voucher_discount_halalas END, wifaq_covered_halalas = CASE WHEN voucher_use = 'reserved' THEN 0 ELSE wifaq_covered_halalas END, total_halalas = CASE WHEN voucher_use = 'reserved' THEN subtotal_halalas ELSE total_halalas END WHERE id = $3",
      [session.id, reason, row.id],
    );
    await addEvent(String(row.id), session.id, String(row.status), "rejected", reason);
    await audit(session.id, "order.reject", "order", String(row.id), { reason });
    json(res, 200, { ok: true });
    return true;
  }

  const deliver = /^\/api\/restaurant\/orders\/([^/]+)\/deliver$/.exec(path);
  if (method === "POST" && deliver) {
    if (!hasPerm(session, "manager", "delivery")) return fail(res, 403, "ليست لديك صلاحية تسجيل التسليم"), true;
    const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2", [deliver[1], restaurantId]);
    if (!row || row.status !== "confirmed") return fail(res, 409, "التسليم متاح فقط لطلب مؤكد"), true;
    if (row.reward_status === "earned") return fail(res, 409, "تم تسليم هذا الطلب من قبل"), true;
    if (row.voucher_use === "reserved" && row.voucher_id) {
      await query("UPDATE vouchers SET status = 'used', used_order_id = $1, used_at = NOW(), reserved_order_id = NULL WHERE id = $2", [row.id, row.voucher_id]);
      await addLedger({ userId: String(row.user_id), kind: "voucher_used", amount: 0, orderId: String(row.id), voucherId: String(row.voucher_id), actorId: session.id });
    }
    const reward = await completeRewards(row);
    await query(
      "UPDATE orders SET status = 'delivered', delivered_at = NOW(), delivered_by = $1, reward_status = $2, reward_halalas = $3, voucher_use = CASE WHEN voucher_use = 'reserved' THEN 'applied' ELSE voucher_use END WHERE id = $4",
      [session.id, reward > 0 ? "earned" : "not_eligible", reward, row.id],
    );
    await addEvent(String(row.id), session.id, "confirmed", "delivered");
    await audit(session.id, "order.deliver", "order", String(row.id));
    json(res, 200, { ok: true });
    return true;
  }

  const attach = /^\/api\/restaurant\/orders\/([^/]+)\/attachments$/.exec(path);
  if (method === "POST" && attach) {
    if (!hasPerm(session, "manager", "delivery")) return fail(res, 403, "ليست لديك صلاحية رفع المرفقات"), true;
    const body = await readBody(req);
    const kind = body.kind === "invoice" ? "invoice" : body.kind === "delivery" ? "delivery" : "";
    if (!kind) return fail(res, 400, "نوع المرفق غير صالح"), true;
    const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2", [attach[1], restaurantId]);
    if (!row || (row.status !== "delivered" && row.status !== "confirmed")) return fail(res, 409, "لا يمكن رفع المرفق في هذه الحالة"), true;
    const dataUrl = String(body.dataUrl || "");
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) return fail(res, 400, "صيغة الملف غير مدعومة"), true;
    const mime = match[1];
    if (!mime.startsWith("image/") && mime !== "application/pdf") return fail(res, 400, "يُسمح بالصور أو PDF فقط"), true;
    const buf = Buffer.from(match[2], "base64");
    if (buf.length > 8 * 1024 * 1024) return fail(res, 400, "حجم الملف أكبر من 8 ميغابايت"), true;
    const ext = mime === "application/pdf" ? ".pdf" : mime.includes("png") ? ".png" : ".jpg";
    const filename = `${row.id}-${kind}${ext}`;
    const filePath = resolve(uploadDir, filename);
    if (extname(filePath) !== ext) return fail(res, 400, "اسم الملف غير صالح"), true;
    writeFileSync(filePath, buf);
    await query("INSERT INTO attachments (id, order_id, kind, filename, mime, path, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
      randomUUID(),
      row.id,
      kind,
      filename,
      mime,
      filePath,
      session.id,
    ]);
    await audit(session.id, "attachment.upload", "order", String(row.id), { kind });
    json(res, 200, { ok: true });
    return true;
  }

  if (method === "GET" && path === "/api/restaurant/settlements") {
    if (!hasPerm(session, "manager", "accounts")) return fail(res, 403, "ليست لديك صلاحية التسويات"), true;
    const rows = await query("SELECT * FROM settlements WHERE restaurant_id = $1 ORDER BY created_at DESC", [restaurantId]);
    json(res, 200, { settlements: rows });
    return true;
  }

  return false;
}

async function adminRoutes(req: IncomingMessage, res: ServerResponse, session: Session, method: string, path: string, url: URL) {
  if (method === "GET" && path === "/api/admin/dashboard") {
    const orders = await query<OrderRow>("SELECT status, subtotal_halalas, wifaq_covered_halalas, user_id, restaurant_id FROM orders");
    const customers = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM users WHERE kind = 'customer'");
    const restaurants = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM restaurants");
    const pendingCover = await one<{ n: number }>("SELECT COALESCE(SUM(wifaq_covered_halalas),0)::int AS n FROM orders WHERE status = 'delivered' AND wifaq_covered_halalas > 0 AND settlement_id IS NULL");
    const settled = await one<{ n: number }>("SELECT COALESCE(SUM(paid_halalas),0)::int AS n FROM settlements WHERE status = 'settled'");
    const insight = await insightPayload();
    const newReports = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM reports WHERE status = 'new'");
    json(res, 200, {
      total: orders.length,
      pending: orders.filter((o) => o.status === "pending_restaurant").length,
      confirmed: orders.filter((o) => o.status === "confirmed").length,
      delivered: orders.filter((o) => o.status === "delivered").length,
      closed: orders.filter((o) => o.status === "rejected" || o.status === "cancelled").length,
      customers: customers?.n ?? 0,
      restaurants: restaurants?.n ?? 0,
      valueHalalas: orders.reduce((sum, o) => sum + Number(o.subtotal_halalas), 0),
      voucherHalalas: orders.reduce((sum, o) => sum + Number(o.wifaq_covered_halalas || 0), 0),
      pendingCoverHalalas: pendingCover?.n ?? 0,
      settledHalalas: settled?.n ?? 0,
      newReports: newReports?.n ?? 0,
      insight: {
        ...insight,
        orders: [
          { label: "بانتظار التأكيد", value: orders.filter((o) => o.status === "pending_restaurant").length },
          { label: "مؤكدة", value: orders.filter((o) => o.status === "confirmed").length },
          { label: "مسلّمة", value: orders.filter((o) => o.status === "delivered").length },
          { label: "مرفوضة أو ملغاة", value: orders.filter((o) => o.status === "rejected" || o.status === "cancelled").length },
        ],
      },
    });
    return true;
  }

  if (method === "GET" && path === "/api/admin/orders") {
    const status = url.searchParams.get("status");
    const rows = status && status !== "all"
      ? status === "cancel"
        ? await query<OrderRow>("SELECT * FROM orders WHERE cancel_requested = TRUE ORDER BY created_at DESC")
        : await query<OrderRow>("SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC", [status])
      : await query<OrderRow>("SELECT * FROM orders ORDER BY created_at DESC");
    json(res, 200, { orders: await Promise.all(rows.map((row) => mapOrder(row, { phone: true }))) });
    return true;
  }

  const adminOrder = /^\/api\/admin\/orders\/([^/]+)$/.exec(path);
  if (method === "GET" && adminOrder) {
    const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1", [adminOrder[1]]);
    if (!row) return fail(res, 404, "الطلب غير موجود"), true;
    const events = await query("SELECT * FROM order_events WHERE order_id = $1 ORDER BY at", [row.id]);
    json(res, 200, { order: await mapOrder(row, { phone: true, extra: true }), events });
    return true;
  }

  const adminCancel = /^\/api\/admin\/orders\/([^/]+)\/cancel$/.exec(path);
  if (method === "POST" && adminCancel) {
    if (!hasPerm(session, "ops", "system")) return fail(res, 403, "ليست لديك صلاحية الإلغاء"), true;
    const row = await one<OrderRow>("SELECT * FROM orders WHERE id = $1", [adminCancel[1]]);
    if (!row || row.status === "delivered") return fail(res, 409, "لا يمكن إلغاء طلب مكتمل"), true;
    if (row.status === "rejected" || row.status === "cancelled") return fail(res, 409, "الطلب مغلق من قبل"), true;
    await releaseVoucher(row, session.id);
    await query(
      "UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1, reward_status = 'not_eligible', voucher_use = CASE WHEN voucher_use = 'reserved' THEN 'released' ELSE voucher_use END, voucher_discount_halalas = CASE WHEN voucher_use = 'reserved' THEN 0 ELSE voucher_discount_halalas END, wifaq_covered_halalas = CASE WHEN voucher_use = 'reserved' THEN 0 ELSE wifaq_covered_halalas END, total_halalas = CASE WHEN voucher_use = 'reserved' THEN subtotal_halalas ELSE total_halalas END WHERE id = $2",
      [session.id, row.id],
    );
    await addEvent(String(row.id), session.id, String(row.status), "cancelled");
    await audit(session.id, "order.cancel", "order", String(row.id));
    json(res, 200, { ok: true });
    return true;
  }

  if (method === "GET" && path === "/api/admin/reports") {
    const rows = await query<{
      id: string;
      user_id: string | null;
      name: string;
      contact: string;
      message: string;
      page: string;
      order_no: string;
      media_filename: string | null;
      media_kind: string | null;
      media_name: string | null;
      status: string;
      created_at: unknown;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
    }>(
      `SELECT r.id, r.user_id, r.name, r.contact, r.message, r.page, r.order_no, r.media_filename, r.media_kind, r.media_name, r.status, r.created_at,
              u.first_name, u.last_name, u.email, u.phone
         FROM reports r
         LEFT JOIN users u ON u.id = r.user_id
        ORDER BY r.created_at DESC`,
    );
    json(res, 200, {
      reports: rows.map((row) => ({
        id: row.id,
        name: row.name || (row.first_name ? `${row.first_name} ${row.last_name ?? ""}`.trim() : "زائر"),
        contact: row.contact || row.email || row.phone || "",
        message: row.message,
        page: row.page,
        orderNo: row.order_no,
        status: row.status,
        createdAt: row.created_at,
        mediaUrl: reportMediaUrl(row.media_filename),
        mediaKind: row.media_kind,
        mediaName: row.media_name,
      })),
    });
    return true;
  }

  const reportStatus = /^\/api\/admin\/reports\/([^/]+)(?:\/done)?$/.exec(path);
  if ((method === "PATCH" || method === "POST") && reportStatus) {
    const row = await one<{ id: string; status: string }>("SELECT id, status FROM reports WHERE id = $1", [reportStatus[1]]);
    if (!row) return fail(res, 404, "البلاغ غير موجود"), true;
    const body = method === "POST" || path.endsWith("/done") ? { status: "done" } : await readBody(req);
    const status = String(body.status || "");
    if (status !== "new" && status !== "working" && status !== "done") return fail(res, 400, "حالة البلاغ غير معروفة"), true;
    await query(
      `UPDATE reports
          SET status = $1,
              done_at = CASE WHEN $1 = 'done' THEN NOW() ELSE NULL END,
              done_by = CASE WHEN $1 = 'done' THEN $2 ELSE NULL END
        WHERE id = $3`,
      [status, session.id, row.id],
    );
    await audit(session.id, "report.status", "report", row.id, { status });
    json(res, 200, { ok: true });
    return true;
  }

  if (method === "GET" && path === "/api/admin/customers") {
    const users = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.company_name, u.created_at,
              v.stop_label, v.last_seen, v.kind AS visit_kind
         FROM users u
         LEFT JOIN visitors v ON v.user_id = u.id
        WHERE u.kind = 'customer'
        ORDER BY u.created_at DESC`,
    );
    json(res, 200, { customers: users });
    return true;
  }

  if (method === "GET" && path === "/api/admin/restaurants") {
    const restaurants = await query(
      `SELECT r.*, u.email AS login_email
         FROM restaurants r
         LEFT JOIN users u ON u.restaurant_id = r.id AND u.kind = 'restaurant'
        ORDER BY r.name`,
    );
    json(res, 200, { restaurants });
    return true;
  }

  if (method === "GET" && path === "/api/admin/rewards") {
    const vouchers = await query("SELECT status, COUNT(*)::int AS n, COALESCE(SUM(value_halalas),0)::int AS value FROM vouchers GROUP BY status");
    const earned = await one<{ n: number }>("SELECT COALESCE(SUM(amount_halalas),0)::int AS n FROM reward_ledger WHERE kind = 'earn'");
    json(res, 200, { vouchers, earnedHalalas: earned?.n ?? 0 });
    return true;
  }

  if (method === "GET" && path === "/api/admin/settlements") {
    const needed = await query<{
      id: string;
      name: string;
      district: string;
      orders: number;
      covered_halalas: number;
      period_start: unknown;
      period_end: unknown;
    }>(
      `SELECT r.id, r.name, r.district, COUNT(*)::int AS orders,
              COALESCE(SUM(o.wifaq_covered_halalas),0)::int AS covered_halalas,
              MIN(o.delivered_at::date) AS period_start, MAX(o.delivered_at::date) AS period_end
         FROM orders o
         JOIN restaurants r ON r.id = o.restaurant_id
        WHERE o.status = 'delivered' AND o.wifaq_covered_halalas > 0 AND o.settlement_id IS NULL
        GROUP BY r.id, r.name, r.district
        ORDER BY covered_halalas DESC`,
    );
    const rows = await query(
      `SELECT s.id, s.restaurant_id, r.name AS restaurant_name, s.period_start, s.period_end,
              s.covered_halalas, s.status, s.pay_ref, s.paid_at, s.created_at
         FROM settlements s
         JOIN restaurants r ON r.id = s.restaurant_id
        ORDER BY s.created_at DESC`,
    );
    json(res, 200, {
      needed: needed.map((row) => ({
        id: row.id,
        name: row.name,
        district: row.district,
        orders: row.orders,
        coveredHalalas: row.covered_halalas,
        periodStart: isoDate(row.period_start),
        periodEnd: isoDate(row.period_end),
      })),
      settlements: rows,
    });
    return true;
  }

  if (method === "POST" && path === "/api/admin/settlements") {
    if (!hasPerm(session, "finance", "system")) return fail(res, 403, "ليست لديك صلاحية التسويات"), true;
    const body = await readBody(req);
    const restaurantId = String(body.restaurantId || "");
    if (!restaurantId) return fail(res, 400, "اختر مطعمًا."), true;
    let start = String(body.periodStart || "");
    let end = String(body.periodEnd || "");
    if (!start || !end) {
      const span = await one<{ period_start: unknown; period_end: unknown }>(
        `SELECT MIN(delivered_at::date) AS period_start, MAX(delivered_at::date) AS period_end
           FROM orders
          WHERE restaurant_id = $1 AND status = 'delivered' AND wifaq_covered_halalas > 0 AND settlement_id IS NULL`,
        [restaurantId],
      );
      start = isoDate(span?.period_start);
      end = isoDate(span?.period_end);
    }
    if (!isIsoDate(start) || !isIsoDate(end)) return fail(res, 400, "حدد تاريخ البداية والنهاية بشكل صحيح."), true;
    if (start > end) return fail(res, 400, "تاريخ البداية يجب أن يكون قبل تاريخ النهاية."), true;
    const orders = await query<OrderRow>(
      "SELECT * FROM orders WHERE restaurant_id = $1 AND status = 'delivered' AND wifaq_covered_halalas > 0 AND settlement_id IS NULL AND delivered_at::date >= $2::date AND delivered_at::date <= $3::date",
      [restaurantId, start, end],
    );
    if (!orders.length) return fail(res, 400, "لا توجد طلبات مؤهلة في هذه الفترة."), true;
    const id = randomUUID();
    const covered = orders.reduce((sum, order) => sum + Number(order.wifaq_covered_halalas), 0);
    await query(
      "INSERT INTO settlements (id, restaurant_id, period_start, period_end, covered_halalas, status, created_by) VALUES ($1,$2,$3,$4,$5,'pending',$6)",
      [id, restaurantId, start, end, covered, session.id],
    );
    for (const order of orders) {
      await query("INSERT INTO settlement_orders (settlement_id, order_id, covered_halalas) VALUES ($1,$2,$3)", [id, order.id, order.wifaq_covered_halalas]);
      await query("UPDATE orders SET settlement_id = $1 WHERE id = $2", [id, order.id]);
    }
    await audit(session.id, "settlement.create", "settlement", id);
    json(res, 200, { id, coveredHalalas: covered, orderCount: orders.length });
    return true;
  }

  const pay = /^\/api\/admin\/settlements\/([^/]+)\/pay$/.exec(path);
  if (method === "POST" && pay) {
    if (!hasPerm(session, "finance", "system")) return fail(res, 403, "ليست لديك صلاحية تأكيد السداد"), true;
    const body = await readBody(req);
    const row = await one<Record<string, unknown>>("SELECT * FROM settlements WHERE id = $1", [pay[1]]);
    if (!row || row.status === "settled") return fail(res, 409, "هذه التسوية مكتملة أو غير موجودة"), true;
    const ref = String(body.payRef || "").trim();
    if (ref.length < 2) return fail(res, 400, "أدخل مرجع عملية السداد."), true;
    await query("UPDATE settlements SET status = 'settled', paid_halalas = covered_halalas, pay_ref = $1, paid_at = NOW() WHERE id = $2", [ref, row.id]);
    await audit(session.id, "settlement.pay", "settlement", String(row.id), { ref });
    json(res, 200, { ok: true });
    return true;
  }

  return false;
}

await migrate();
await seedUsers();

createServer((req, res) => {
  void handle(req, res);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`قيفانتا API على http://127.0.0.1:${PORT} (محلي، بدون اشتراك)`);
});
