import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { api } from "../api";
import { WifaqMark } from "../brand";
import { houseColor, RestaurantMark } from "../houseMark";
import { formatClock, formatDate, formatWhen, orderNo, orderTiming, riyal, riyalFromHalalas } from "../format";
import { AdminDesk, type Insight } from "./Insights";
import { ADMIN_LOGIN } from "../staff";
import { useStore } from "../store";
import type { Order, OrderStage, OrderStatus } from "../types";

type Dash = Record<string, number> & { insight?: Insight };

type View = "home" | "orders" | "clients" | "restaurants" | "rewards" | "settle" | "detail" | "reports";

type ReportRow = {
  id: string;
  name: string;
  contact: string;
  message: string;
  page: string;
  orderNo: string;
  status: "new" | "working" | "done";
  createdAt: string;
  mediaUrl: string | null;
  mediaKind: "image" | "video" | null;
  mediaName: string | null;
};

const statusLabel: Record<OrderStatus, string> = {
  pending_restaurant: "بانتظار المطعم",
  confirmed: "مؤكد",
  rejected: "مرفوض",
  delivered: "مسلّم",
  cancelled: "ملغى",
};

const stageHint: Record<OrderStage, string> = {
  attention: "العميل طلب الإلغاء. اعتمد القرار من تفاصيل الطلب.",
  pending_restaurant: "العميل أرسل الطلب. المطعم يقبل أو يرفض، والإدارة تتابع زمن الرد.",
  confirmed: "المطعم قبل العرض. يبقى الطلب هنا حتى يوم المناسبة والتسليم.",
  delivered: "اكتمل المسار. إن وُجدت تغطية قيفانتا تنتقل للتسويات.",
  stopped: "طلبات رفضها المطعم، أو أُلغيت قبل التسليم.",
  all: "كل الطلبات حسب وقت الإرسال.",
};

function inStage(order: Order, stage: OrderStage) {
  if (stage === "all") return true;
  if (stage === "attention") return Boolean(order.cancelRequested && (order.status === "pending_restaurant" || order.status === "confirmed"));
  if (stage === "stopped") return order.status === "rejected" || order.status === "cancelled";
  return order.status === stage;
}

function firstStage(orders: Order[]): OrderStage {
  if (orders.some((order) => inStage(order, "attention"))) return "attention";
  if (orders.some((order) => inStage(order, "pending_restaurant"))) return "pending_restaurant";
  if (orders.some((order) => inStage(order, "confirmed"))) return "confirmed";
  if (orders.some((order) => inStage(order, "delivered"))) return "delivered";
  return "all";
}

function sortStage(list: Order[], stage: OrderStage) {
  return [...list].sort((a, b) => {
    if (stage === "pending_restaurant" || stage === "attention") {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (stage === "confirmed") return a.eventDate.localeCompare(b.eventDate);
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function houseScore(orders: Order[], restaurantId: string) {
  const rated = orders.filter((order) => order.restaurantId === restaurantId && order.rating);
  if (!rated.length) return { avg: null as number | null, count: 0 };
  const total = rated.reduce((sum, order) => {
    const rating = order.rating!;
    return sum + (rating.food + rating.timing + rating.accuracy + rating.presentation) / 4;
  }, 0);
  return { avg: total / rated.length, count: rated.length };
}

function HouseScore({ avg, count }: { avg: number | null; count: number }) {
  if (avg == null || count === 0) {
    return (
      <p className="house-score is-empty">
        <span>بدون تقييم</span>
      </p>
    );
  }
  const shown = Math.round(avg * 10) / 10;
  const label = count === 1 ? "تقييم واحد" : count === 2 ? "تقييمان" : `${count} تقييمات`;
  return (
    <p className="house-score">
      <span className="house-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <i key={star} className={shown >= star - 0.25 ? "on" : ""} />
        ))}
      </span>
      <strong>{shown.toLocaleString("ar-SA", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
      <span>{label}</span>
    </p>
  );
}

export function AdminSite({ onClient }: { onClient: () => void }) {
  const { sessionKind, login, logout, ready } = useStore();
  const [view, setView] = useState<View>("home");
  const [stage, setStage] = useState<OrderStage>("pending_restaurant");
  const [dash, setDash] = useState<Dash | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);
  const [restaurants, setRestaurants] = useState<Record<string, unknown>[]>([]);
  const [neededSettlements, setNeededSettlements] = useState(0);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [error, setError] = useState("");

  const isAdmin = sessionKind === "admin";

  async function load() {
    if (!isAdmin) return;
    const [home, list, people, houses, money, inbox] = await Promise.all([
      api<Dash>("/api/admin/dashboard"),
      api<{ orders: Order[] }>("/api/admin/orders"),
      api<{ customers: Record<string, unknown>[] }>("/api/admin/customers"),
      api<{ restaurants: Record<string, unknown>[] }>("/api/admin/restaurants"),
      api<{ needed: { id: string }[] }>("/api/admin/settlements"),
      api<{ reports: ReportRow[] }>("/api/admin/reports"),
    ]);
    setDash(home);
    setOrders(list.orders);
    setCustomers(people.customers);
    setRestaurants(houses.restaurants);
    setNeededSettlements(money.needed.length);
    setReports(inbox.reports);
  }

  useEffect(() => {
    if (isAdmin) void load().catch((err) => setError(err instanceof Error ? err.message : "تعذر التحميل"));
  }, [isAdmin]);

  if (!ready) return <div className="admin-gate"><p>جارٍ التحميل…</p></div>;
  if (!isAdmin) return <AdminLogin onClient={onClient} onEnter={login} />;

  return (
    <div className="admin-shell rest-shell">
      <header className="rest-bar">
        <div className="rest-brand">
          <WifaqMark size={34} />
          <span>
            <strong>قيفانتا</strong>
            <small>لوحة الإدارة</small>
          </span>
        </div>
        <nav className="rest-nav" aria-label="أقسام اللوحة">
          <button type="button" className={view === "home" ? "on" : ""} onClick={() => setView("home")}>
            الرئيسية
          </button>
          <button
            type="button"
            className={view === "orders" || view === "detail" ? "on" : ""}
            onClick={() => {
              setStage(firstStage(orders));
              setView("orders");
            }}
          >
            الطلبات
            {orders.some((order) => inStage(order, "attention") || inStage(order, "pending_restaurant")) ? (
              <em className="nav-dot">
                {orders.filter((order) => inStage(order, "attention") || inStage(order, "pending_restaurant")).length}
              </em>
            ) : null}
          </button>
          <button type="button" className={view === "settle" ? "on" : ""} onClick={() => setView("settle")}>
            التسويات
            {neededSettlements ? <em className="nav-dot">{neededSettlements}</em> : null}
          </button>
          <button type="button" className={view === "clients" ? "on" : ""} onClick={() => setView("clients")}>
            العملاء
          </button>
          <button type="button" className={view === "restaurants" ? "on" : ""} onClick={() => setView("restaurants")}>
            المطاعم
          </button>
          <button type="button" className={view === "reports" ? "on" : ""} onClick={() => setView("reports")}>
            البلاغات
            {reports.some((item) => item.status === "new") ? (
              <em className="nav-dot">{reports.filter((item) => item.status === "new").length}</em>
            ) : null}
          </button>
        </nav>
        <button type="button" className="rest-out" onClick={logout}>
          خروج
        </button>
      </header>
      <main className="admin-main rest-main">
        {error ? <p className="err">{error}</p> : null}
        {view === "home" && dash?.insight ? (
          <AdminDesk
            insight={dash.insight}
            orders={orders}
            restaurants={restaurants}
            neededSettlements={neededSettlements}
            pendingCoverHalalas={Number(dash.pendingCoverHalalas || 0)}
            newReports={reports.filter((item) => item.status === "new").length}
            onGo={(place, next) => {
              if (next) setStage(next);
              setView(
                place === "orders"
                  ? "orders"
                  : place === "settle"
                    ? "settle"
                    : place === "clients"
                      ? "clients"
                      : place === "reports"
                        ? "reports"
                        : "restaurants",
              );
            }}
          />
        ) : null}
        {view === "orders" ? (
          <OrdersFlow
            orders={orders}
            stage={stage}
            onStage={setStage}
            onOpen={(order) => {
              setSelected(order);
              setView("detail");
            }}
          />
        ) : null}
        {view === "detail" && selected ? <AdminDetail order={selected} onBack={() => setView("orders")} onChange={() => void load()} /> : null}
        {view === "clients" ? (
          <section>
            <header className="admin-page-head">
              <div>
                <p className="admin-kicker">الناس</p>
                <h1>العملاء والزوار</h1>
              </div>
              <p className="admin-count">{customers.length} عميل</p>
            </header>
            {dash?.insight ? (
              <div className="insight-card is-guest">
                <h2>الزوار</h2>
                {dash.insight.guestsList.length === 0 ? <p className="admin-empty">لا يوجد زوار حتى الآن.</p> : null}
                <div className="stack">
                  {dash.insight.guestsList.map((item) => (
                    <article key={item.id} className="settle-card">
                      <span>
                        <strong>{item.name}</strong>
                        <small>توقف عند: {item.stop}</small>
                      </span>
                      <em className="admin-state">{item.visits} زيارة</em>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            <h2 className="rest-h2">العملاء</h2>
            <div className="stack">
              {customers.map((item) => (
                <article key={String(item.id)} className="admin-track">
                  <strong>{String(item.first_name)} {String(item.last_name)}</strong>
                  <p dir="ltr">{String(item.email)}</p>
                  <p>توقف عند: {item.stop_label ? String(item.stop_label) : "لم يزر الموقع بعد"}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {view === "restaurants" ? (
          <section>
            <header className="admin-page-head">
              <div>
                <p className="admin-kicker">الدليل</p>
                <h1>المطاعم</h1>
              </div>
              <p className="admin-count">{restaurants.length} مطعم</p>
            </header>
            <div className="stack">
              {restaurants.map((item) => {
                const id = String(item.id);
                const name = String(item.name);
                const score = houseScore(orders, id);
                return (
                  <article key={id} className="house-row" style={{ "--house": houseColor(id) } as CSSProperties}>
                    <RestaurantMark id={id} name={name} />
                    <div>
                      <strong>{name}</strong>
                      <p>
                        {String(item.district)} · {item.accepting_orders ? "يستقبل طلبات" : "متوقف"}
                      </p>
                      {item.specialty ? <p>{String(item.specialty)}</p> : null}
                      {item.login_email ? <p dir="ltr">{String(item.login_email)} · WifaqRest2026</p> : null}
                    </div>
                    <HouseScore avg={score.avg} count={score.count} />
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
        {view === "settle" ? <SettlePage restaurants={restaurants} /> : null}
        {view === "reports" ? <ReportsPage reports={reports} onChange={() => void load()} /> : null}
      </main>
    </div>
  );
}

function OrdersFlow({
  orders,
  stage,
  onStage,
  onOpen,
}: {
  orders: Order[];
  stage: OrderStage;
  onStage: (stage: OrderStage) => void;
  onOpen: (order: Order) => void;
}) {
  const attention = orders.filter((order) => inStage(order, "attention")).length;
  const pending = orders.filter((order) => inStage(order, "pending_restaurant")).length;
  const confirmed = orders.filter((order) => inStage(order, "confirmed")).length;
  const delivered = orders.filter((order) => inStage(order, "delivered")).length;
  const stopped = orders.filter((order) => inStage(order, "stopped")).length;
  const visible = sortStage(orders.filter((order) => inStage(order, stage)), stage);

  return (
    <section>
      <header className="admin-page-head">
        <div>
          <p className="admin-kicker">مسار الطلب</p>
          <h1>الطلبات</h1>
        </div>
        <p className="admin-count">{visible.length} في هذه المرحلة</p>
      </header>
      <p className="order-flow-line">العميل يرسل ← المطعم يقرر ← التسليم ← التسوية إن لزم</p>

      {attention > 0 ? (
        <button type="button" className={`order-urgent ${stage === "attention" ? "on" : ""}`} onClick={() => onStage("attention")}>
          <strong>يحتاج قرارك الآن</strong>
          <span>{attention} طلب إلغاء من عميل</span>
        </button>
      ) : null}

      <div className="order-path" role="tablist" aria-label="مراحل الطلب">
        <button type="button" className={stage === "pending_restaurant" ? "on" : ""} onClick={() => onStage("pending_restaurant")}>
          <small>١</small>
          <strong>بانتظار المطعم</strong>
          <em>{pending}</em>
        </button>
        <i aria-hidden="true" />
        <button type="button" className={stage === "confirmed" ? "on" : ""} onClick={() => onStage("confirmed")}>
          <small>٢</small>
          <strong>مؤكد</strong>
          <em>{confirmed}</em>
        </button>
        <i aria-hidden="true" />
        <button type="button" className={stage === "delivered" ? "on" : ""} onClick={() => onStage("delivered")}>
          <small>٣</small>
          <strong>مسلّم</strong>
          <em>{delivered}</em>
        </button>
      </div>

      <div className="order-side">
        <button type="button" className={stage === "stopped" ? "on" : ""} onClick={() => onStage("stopped")}>
          مرفوض أو ملغى · {stopped}
        </button>
        <button type="button" className={stage === "all" ? "on" : ""} onClick={() => onStage("all")}>
          كل الطلبات · {orders.length}
        </button>
      </div>

      <p className="admin-note">{stageHint[stage]}</p>
      <div className="stack">
        {visible.length === 0 ? <p className="admin-empty">لا توجد طلبات في هذه المرحلة.</p> : null}
        {visible.map((order) => {
          const time = orderTiming(order);
          return (
            <button
              key={order.id}
              type="button"
              className="admin-order"
              onClick={() => onOpen(order)}
            >
              <span>
                <strong dir="ltr">#{orderNo(order.id)}</strong>
                <small>
                  {order.clientName} · {order.restaurantName}
                  <br />
                  طلب العميل: {time.orderedAt}
                  {time.pending
                    ? ` · ينتظر منذ ${time.waitingLabel}`
                    : order.confirmedAt
                      ? ` · قُبل خلال ${time.replyLabel}`
                      : order.rejectedAt
                        ? ` · رُفض خلال ${time.replyLabel}`
                        : ""}
                </small>
              </span>
              <em className={`admin-state is-${order.status}`}>{statusLabel[order.status]}</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AdminLogin({ onClient, onEnter }: { onClient: () => void; onEnter: (email: string, password: string) => Promise<string | null> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await onEnter(ADMIN_LOGIN.email, ADMIN_LOGIN.password);
    setError(result ?? "");
    setBusy(false);
  }
  return (
    <div className="admin-gate">
      <form className="admin-gate-card" onSubmit={submit}>
        <WifaqMark size={40} />
        <h1>قيفانتا</h1>
        <p>لوحة الإدارة. الحساب جاهز — اضغط دخول.</p>
        {error ? <p className="err">{error}</p> : null}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "جارٍ الدخول…" : "دخول الإدارة"}
        </button>
        <button className="text-back" type="button" onClick={onClient}>العودة لموقع العملاء</button>
      </form>
    </div>
  );
}

function AdminDetail({ order, onBack, onChange }: { order: Order; onBack: () => void; onChange: () => void }) {
  const [error, setError] = useState("");
  const meal = order.mealType === "breakfast" ? "فطور" : order.mealType === "lunch" ? "غداء" : "عشاء";
  return (
    <section>
      <button className="text-back" type="button" onClick={onBack}>الطلبات</button>
      <div className="admin-detail-head">
        <h1 dir="ltr">#{orderNo(order.id)}</h1>
        <em className={`admin-state is-${order.status}`}>{statusLabel[order.status]}</em>
      </div>
      <p className="admin-note">قبول الطلب ورفضه من لوحة المطعم. الإدارة تعتمد الإلغاء والتسويات.</p>
      {order.cancelRequested ? <p className="admin-note">العميل أرسل طلب إلغاء وهو بانتظار المراجعة.</p> : null}
      {order.status === "pending_restaurant" || order.status === "confirmed" ? (
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            void api(`/api/admin/orders/${order.id}/cancel`, { method: "POST" })
              .then(onChange)
              .catch((err) => setError(err instanceof Error ? err.message : "تعذر الإلغاء"));
          }}
        >
          اعتماد الإلغاء
        </button>
      ) : null}
      {error ? <p className="err">{error}</p> : null}
      <div className="stack">
        <Row label="العميل" value={order.clientName} />
        <Row label="الجوال" value={order.phone} latin />
        <Row label="المطعم" value={order.restaurantName} />
        <Row label="طلب العميل" value={orderTiming(order).orderedAt} />
        <Row
          label="رد المطعم"
          value={
            order.confirmedAt
              ? `قُبل ${orderTiming(order).decidedAt} — خلال ${orderTiming(order).replyLabel}`
              : order.rejectedAt
                ? `رُفض ${orderTiming(order).decidedAt} — خلال ${orderTiming(order).replyLabel}`
                : `ما زال ينتظر منذ ${orderTiming(order).waitingLabel}`
          }
        />
        <Row label="الوجبة" value={meal} />
        <Row label="الموعد" value={`${formatDate(order.eventDate)} · ${formatClock(order.pickupTime)}`} />
        <Row label="تغطية قيفانتا" value={riyalFromHalalas(order.wifaqCoveredHalalas)} />
      </div>
      <h2>الأصناف</h2>
      {order.items.map((item) => (
        <div key={`${item.itemId}:${item.tier}`} className="admin-order">
          <span>
            <strong>{item.name}</strong>
            <small>
              {item.tier === "luxury" ? "فاخر" : "عادي"} · {item.qty} × <span className="ltr">{riyal(item.unitPrice)}</span>
            </small>
          </span>
          <strong className="ltr">{riyal(item.unitPrice * item.qty)}</strong>
        </div>
      ))}
    </section>
  );
}

type NeededRestaurant = {
  id: string;
  name: string;
  district: string;
  orders: number;
  coveredHalalas: number;
  periodStart: string;
  periodEnd: string;
};

function settleStatus(status: string) {
  return status === "settled" ? "تم السداد" : "بانتظار السداد";
}

function SettlePage({ restaurants }: { restaurants: Record<string, unknown>[] }) {
  const [needed, setNeeded] = useState<NeededRestaurant[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [restaurantId, setRestaurantId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function reload() {
    const data = await api<{ needed: NeededRestaurant[]; settlements: Record<string, unknown>[] }>("/api/admin/settlements");
    setNeeded(data.needed);
    setRows(data.settlements);
  }

  useEffect(() => {
    void reload().catch((err) => setMessage(err instanceof Error ? err.message : "تعذر التحميل"));
  }, []);

  async function createSheet(id: string, periodStart?: string, periodEnd?: string) {
    setBusy(id);
    setMessage("");
    try {
      await api("/api/admin/settlements", {
        method: "POST",
        body: JSON.stringify({ restaurantId: id, periodStart, periodEnd }),
      });
      await reload();
      setMessage("أُنشئ كشف التسوية.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذر إنشاء الكشف");
    } finally {
      setBusy("");
    }
  }

  return (
    <section>
      <header className="admin-page-head">
        <div>
          <p className="admin-kicker">المالية</p>
          <h1>التسويات</h1>
        </div>
        <p className="admin-count">{needed.length} مطعم يحتاج تسوية</p>
      </header>
      <p className="admin-note">هذه المطاعم عليها تغطية معلّقة بعد تسليم الطلب. أنشئ الكشف ثم أكّد السداد بعد التحويل.</p>

      <h2 className="rest-h2">تحتاج تسوية</h2>
      <div className="stack">
        {needed.length === 0 ? <p className="admin-empty">لا يوجد مطعم يحتاج تسوية الآن.</p> : null}
        {needed.map((item) => (
          <article key={item.id} className="settle-card">
            <span>
              <strong>{item.name}</strong>
              <small>
                {item.district} · {item.orders} طلب · {formatDate(item.periodStart)} — {formatDate(item.periodEnd)}
              </small>
            </span>
            <em className="admin-state">{riyalFromHalalas(item.coveredHalalas)}</em>
            <button
              className="btn primary"
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void createSheet(item.id, item.periodStart, item.periodEnd)}
            >
              {busy === item.id ? "جارٍ الإنشاء…" : "إنشاء كشف"}
            </button>
          </article>
        ))}
      </div>

      <button className="admin-advanced" type="button" onClick={() => setAdvanced((open) => !open)}>
        {advanced ? "إخفاء البحث المتقدم" : "بحث متقدم"}
      </button>
      {advanced ? (
        <div className="settle-advanced">
          <p className="admin-note">ابحث عن فترة محددة أو أنشئ كشفًا يدويًا لمطعم معيّن.</p>
          <label className="field">
            <span>المطعم</span>
            <select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
              <option value="">اختر مطعمًا</option>
              {restaurants.map((item) => (
                <option key={String(item.id)} value={String(item.id)}>
                  {String(item.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>من تاريخ</span>
            <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label className="field">
            <span>إلى تاريخ</span>
            <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
          <button
            className="btn primary"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => {
              if (!restaurantId) {
                setMessage("اختر مطعمًا.");
                return;
              }
              if ((start && !end) || (!start && end)) {
                setMessage("حدد تاريخ البداية والنهاية معًا، أو اتركهما فارغين للفترة المستحقة.");
                return;
              }
              void createSheet(restaurantId, start || undefined, end || undefined);
            }}
          >
            إنشاء كشف تسوية
          </button>
        </div>
      ) : null}

      {message ? <p className={message.includes("أُنشئ") ? "admin-note" : "err"}>{message}</p> : null}

      <h2 className="rest-h2">الكشوف</h2>
      <div className="stack">
        {rows.length === 0 ? <p className="admin-empty">لا توجد كشوف بعد.</p> : null}
        {rows.map((item) => (
          <article key={String(item.id)} className="settle-card">
            <span>
              <strong>{String(item.restaurant_name)}</strong>
              <small>
                {formatDate(isoDateClient(item.period_start))} — {formatDate(isoDateClient(item.period_end))} · {settleStatus(String(item.status))}
              </small>
            </span>
            <em className={`admin-state ${item.status === "settled" ? "is-settled" : ""}`}>
              {riyalFromHalalas(Number(item.covered_halalas))}
            </em>
            {item.status !== "settled" ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  const ref = window.prompt("مرجع عملية السداد");
                  if (!ref) return;
                  void api(`/api/admin/settlements/${item.id}/pay`, { method: "POST", body: JSON.stringify({ payRef: ref }) })
                    .then(() => reload())
                    .catch((err) => setMessage(err instanceof Error ? err.message : "تعذر تأكيد السداد"));
                }}
              >
                تأكيد السداد
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportsPage({ reports, onChange }: { reports: ReportRow[]; onChange: () => void }) {
  const fresh = reports.filter((item) => item.status === "new").length;
  const working = reports.filter((item) => item.status === "working").length;
  const solved = reports.filter((item) => item.status === "done").length;
  const [busy, setBusy] = useState("");
  async function setStatus(id: string, status: ReportRow["status"]) {
    setBusy(id);
    try {
      await api(`/api/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      onChange();
    } finally {
      setBusy("");
    }
  }
  const options = [
    ["new", "جديد"],
    ["working", "قيد الحل"],
    ["done", "تم حلّه"],
  ] as const;
  return (
    <section>
      <header className="admin-page-head">
        <div>
          <p className="admin-kicker">الدعم</p>
          <h1>البلاغات</h1>
        </div>
        <p className="report-counts">
          <span className="is-new">{fresh} جديد</span>
          <span className="is-working">{working} قيد الحل</span>
          <span className="is-done">{solved} تم حلّه</span>
        </p>
      </header>
      <div className="stack">
        {reports.length === 0 ? <p className="admin-empty">لا توجد بلاغات حتى الآن.</p> : null}
        {reports.map((item) => (
          <article key={item.id} className={`report-admin is-${item.status}`}>
            <header>
              <strong>{item.name}</strong>
              <em className={`report-pill is-${item.status}`}>{options.find(([key]) => key === item.status)?.[1]}</em>
            </header>
            <p className="report-admin-meta">
              {item.contact ? `${item.contact} · ` : ""}
              {item.orderNo ? `طلب ${item.orderNo} · ` : ""}
              {formatWhen(item.createdAt)}
            </p>
            <p className="report-admin-msg">{item.message}</p>
            {item.mediaUrl && item.mediaKind === "video" ? (
              <video className="report-admin-media" src={item.mediaUrl} controls playsInline />
            ) : null}
            {item.mediaUrl && item.mediaKind !== "video" ? (
              <a href={item.mediaUrl} target="_blank" rel="noopener noreferrer">
                <img className="report-admin-media" src={item.mediaUrl} alt={item.mediaName || "مرفق البلاغ"} />
              </a>
            ) : null}
            <div className="report-switch" role="group" aria-label={`حالة بلاغ ${item.name}`}>
              {options.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={item.status === key ? "on" : ""}
                  aria-pressed={item.status === key}
                  disabled={busy === item.id}
                  onClick={() => {
                    if (item.status !== key) void setStatus(item.id, key);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function isoDateClient(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value ?? "");
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? text;
}

function Row({ label, value, latin }: { label: string; value: string; latin?: boolean }) {
  return (
    <div className="soft-card profile-row">
      <span>{label}</span>
      <strong dir={latin ? "ltr" : undefined}>{value || "—"}</strong>
    </div>
  );
}
