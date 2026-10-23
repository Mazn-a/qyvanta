import { useEffect, useState } from "react";
import { api } from "../api";
import { WifaqMark } from "../brand";
import { arabicNumber, formatClock, formatDate, orderTiming, riyal, riyalFromHalalas } from "../format";
import { RESTAURANT_PASSWORD } from "../staff";
import { useStore } from "../store";
import type { Order } from "../types";

type Counts = {
  pending: number;
  confirmed: number;
  today: number;
  upcoming: number;
  delivered: number;
  closed: number;
  total: number;
  valueHalalas: number;
  pendingCoverHalalas: number;
};

export function RestaurantSite({ onClient }: { onClient: () => void }) {
  const { sessionKind, restaurantId, login, logout, ready } = useStore();
  const [busyLogin, setBusyLogin] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<"home" | "orders" | "detail" | "settle">("home");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [actionNeeded, setActionNeeded] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [settlements, setSettlements] = useState<Record<string, unknown>[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [venues, setVenues] = useState<{ id: string; name: string; district: string; email: string }[]>([]);

  const inRest = sessionKind === "restaurant" && restaurantId;

  async function load() {
    if (!inRest) return;
    const dash = await api<{ counts: Counts; actionNeeded: Order[] }>("/api/restaurant/dashboard");
    const list = await api<{ orders: Order[] }>("/api/restaurant/orders");
    setCounts(dash.counts);
    setActionNeeded(dash.actionNeeded as Order[]);
    setOrders(list.orders);
    try {
      const money = await api<{ settlements: Record<string, unknown>[] }>("/api/restaurant/settlements");
      setSettlements(money.settlements);
    } catch {
      setSettlements([]);
    }
  }

  useEffect(() => {
    void api<{ venues: { id: string; name: string; district: string; email: string }[] }>("/api/venues")
      .then((data) => setVenues(data.venues))
      .catch(() => setVenues([]));
  }, []);

  useEffect(() => {
    if (!inRest) return;
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    const clock = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [inRest]);

  if (!ready) return <div className="admin-gate"><p>جارٍ التحميل…</p></div>;

  if (!inRest) {
    async function enter(email: string, password: string) {
      setBusyLogin(email);
      setError("");
      const result = await login(email, password);
      setError(result ?? "");
      setBusyLogin("");
    }
    return (
      <div className="admin-gate">
        <div className="admin-gate-card">
          <WifaqMark size={40} />
          <h1>قيفانتا</h1>
          <p>لوحة المطعم. الحسابات جاهزة — اختر مطعمك وادخل مباشرة.</p>
          <div className="staff-accounts">
            {venues.map((account) => (
              <button
                key={account.id}
                type="button"
                className="staff-account"
                disabled={Boolean(busyLogin)}
                onClick={() => void enter(account.email, RESTAURANT_PASSWORD)}
              >
                <strong>{account.name}</strong>
                <small>{account.district}</small>
              </button>
            ))}
          </div>
          {error ? <p className="err">{error}</p> : null}
          {busyLogin ? <p className="fine">جارٍ الدخول…</p> : null}
          <button className="text-back" type="button" onClick={onClient}>
            العودة لموقع العملاء
          </button>
        </div>
      </div>
    );
  }

  async function openDetail(id: string) {
    const data = await api<{ order: Order }>("/api/restaurant/orders/" + id);
    setSelected(data.order);
    setView("detail");
  }

  async function decide(id: string, action: "confirm" | "reject" | "deliver") {
    setBusy(id + action);
    setError("");
    try {
      const reason = reasons[id]?.trim();
      await api(`/api/restaurant/orders/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "reject" ? { reason } : {}),
      });
      await load();
      if (view === "detail") await openDetail(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy("");
    }
  }

  const offers = actionNeeded.filter((order) => order.status === "pending_restaurant" || order.cancelRequested);
  void now;

  return (
    <div className="admin-shell rest-shell">
      <header className="rest-bar">
        <div className="rest-brand">
          <WifaqMark size={34} />
          <span>
            <strong>قيفانتا</strong>
            <small>لوحة المطعم</small>
          </span>
        </div>
        <nav className="rest-nav" aria-label="أقسام اللوحة">
          <button type="button" className={view === "home" || view === "detail" ? "on" : ""} onClick={() => setView("home")}>
            العروض
          </button>
          <button type="button" className={view === "orders" ? "on" : ""} onClick={() => setView("orders")}>
            الطلبات
          </button>
          <button type="button" className={view === "settle" ? "on" : ""} onClick={() => setView("settle")}>
            التسويات
          </button>
        </nav>
        <button type="button" className="rest-out" onClick={logout}>
          خروج
        </button>
      </header>
      <main className="admin-main rest-main">
        {error ? <p className="err">{error}</p> : null}
        {view === "home" ? (
          <section>
            <header className="admin-page-head">
              <div>
                <p className="admin-kicker">عمل المطعم</p>
                <h1>العروض</h1>
              </div>
              <p className="admin-count">{offers.length} بانتظار قرارك</p>
            </header>
            <p className="admin-note">شاهد العرض، اقبله أو ارفضه. وقت ردك يُحسب من لحظة طلب العميل.</p>
            <div className="stack">
              {offers.length === 0 ? <p className="admin-empty">لا يوجد عرض بانتظار قرارك الآن.</p> : null}
              {offers.map((order) => (
                <OfferCard
                  key={order.id}
                  order={order}
                  reason={reasons[order.id] ?? ""}
                  busy={busy}
                  onReason={(value) => setReasons((current) => ({ ...current, [order.id]: value }))}
                  onAccept={() => void decide(order.id, "confirm")}
                  onReject={() => void decide(order.id, "reject")}
                  onOpen={() => void openDetail(order.id)}
                />
              ))}
            </div>
          </section>
        ) : null}
        {view === "orders" ? (
          <section>
            <header className="admin-page-head">
              <div>
                <p className="admin-kicker">السجل</p>
                <h1>كل الطلبات</h1>
              </div>
              {counts ? <p className="admin-count">{arabicNumber(counts.total)} طلب</p> : null}
            </header>
            <div className="stack">
              {orders.map((order) => {
                const time = orderTiming(order);
                return (
                  <button key={order.id} type="button" className="admin-order" onClick={() => void openDetail(order.id)}>
                    <span>
                      <strong>{order.clientName}</strong>
                      <small>
                        طلب العميل: {time.orderedAt}
                        {time.pending ? ` · ينتظر منذ ${time.waitingLabel}` : order.confirmedAt ? ` · قُبل خلال ${time.replyLabel}` : ""}
                      </small>
                    </span>
                    <em className={`admin-state is-${order.status}`}>{statusText[order.status]}</em>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
        {view === "detail" && selected ? (
          <OrderDetail
            order={selected}
            reason={reasons[selected.id] ?? ""}
            busy={busy}
            onBack={() => setView("home")}
            onReason={(value) => setReasons((current) => ({ ...current, [selected.id]: value }))}
            onAccept={() => void decide(selected.id, "confirm")}
            onReject={() => void decide(selected.id, "reject")}
            onDeliver={() => void decide(selected.id, "deliver")}
          />
        ) : null}
        {view === "settle" ? (
          <section>
            <h1>التسويات المالية</h1>
            <p className="lead">المطعم لا يعتمد السداد. قيفانتا تؤكد الدفع من لوحة الإدارة.</p>
            {settlements.length === 0 ? <p className="admin-empty">لا توجد تسويات بعد.</p> : null}
            <div className="stack">
              {settlements.map((item) => (
                <article key={String(item.id)} className="admin-track">
                  <strong dir="ltr">{String(item.id).slice(0, 8)}</strong>
                  <p>
                    {String(item.period_start)} → {String(item.period_end)} · {riyalFromHalalas(Number(item.covered_halalas))} · {String(item.status)}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function OfferCard({
  order,
  reason,
  busy,
  onReason,
  onAccept,
  onReject,
  onOpen,
}: {
  order: Order;
  reason: string;
  busy: string;
  onReason: (value: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onOpen: () => void;
}) {
  const time = orderTiming(order);
  const meal = order.mealType === "breakfast" ? "فطور" : order.mealType === "lunch" ? "غداء" : "عشاء";
  return (
    <article className="offer-card">
      <div className="offer-top">
        <span>
          <strong>{order.clientName || "طلب جديد"}</strong>
          <small>
            طلب العميل: {time.orderedAt}
            <b> · ينتظر منذ {time.waitingLabel}</b>
          </small>
        </span>
        <em className="admin-state">{order.cancelRequested ? "طلب إلغاء" : "عرض جديد"}</em>
      </div>
      <p className="offer-meta">
        {meal} · {arabicNumber(order.attendees)} ضيف · {formatDate(order.eventDate)} · {formatClock(order.pickupTime)}
      </p>
      <p className="offer-meta">{order.pickupLocation}</p>
      <ul className="offer-lines">
        {order.items.map((item) => (
          <li key={`${item.itemId}:${item.tier}`}>
            <span>
              {item.name} · {item.tier === "luxury" ? "فاخر" : "عادي"} · {arabicNumber(item.qty)}
            </span>
            <strong>{riyal(item.unitPrice * item.qty)}</strong>
          </li>
        ))}
      </ul>
      <p className="offer-total">
        <span>قيمة العرض</span>
        <strong className="ltr">{riyalFromHalalas(order.subtotalHalalas)}</strong>
      </p>
      {order.status === "pending_restaurant" ? (
        <div className="offer-actions">
          <button className="btn primary" type="button" disabled={Boolean(busy)} onClick={onAccept}>
            قبول العرض
          </button>
          <textarea value={reason} onChange={(event) => onReason(event.target.value)} placeholder="سبب الرفض إن رُفض" rows={2} />
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={onReject}>
            رفض العرض
          </button>
        </div>
      ) : null}
      <button className="text-back" type="button" onClick={onOpen}>
        تفاصيل أكثر
      </button>
    </article>
  );
}

function OrderDetail({
  order,
  reason,
  busy,
  onBack,
  onReason,
  onAccept,
  onReject,
  onDeliver,
}: {
  order: Order;
  reason: string;
  busy: string;
  onBack: () => void;
  onReason: (value: string) => void;
  onAccept: () => void;
  onReject: () => void;
  onDeliver: () => void;
}) {
  const time = orderTiming(order);
  const meal = order.mealType === "breakfast" ? "فطور" : order.mealType === "lunch" ? "غداء" : "عشاء";
  return (
    <section>
      <button className="text-back" type="button" onClick={onBack}>
        رجوع للعروض
      </button>
      <div className="admin-detail-head">
        <h1>{order.clientName}</h1>
        <em className={`admin-state is-${order.status}`}>{statusText[order.status]}</em>
      </div>
      <p className="admin-note">طلب العميل: {time.orderedAt}</p>
      <p className="admin-note">
        {time.pending
          ? `ينتظر قرارك منذ ${time.waitingLabel}`
          : order.confirmedAt
            ? `قُبل خلال ${time.replyLabel}`
            : order.rejectedAt
              ? `رُفض خلال ${time.replyLabel}`
              : ""}
      </p>
      <p>
        {meal} · {formatDate(order.eventDate)} · {formatClock(order.pickupTime)}
      </p>
      <p>{order.pickupLocation}</p>
      {order.notes ? <p>ملاحظات: {order.notes}</p> : null}
      <p className="admin-note">
        {order.phone ? `رقم التواصل: ${order.phone}` : "رقم التواصل متاح يوم المناسبة بعد قبول الطلب."}
      </p>
      <ul className="invoice-lines">
        {order.items.map((item) => (
          <li key={`${item.itemId}:${item.tier}`}>
            <span>
              {item.name}
              <small>
                {item.tier === "luxury" ? "فاخر" : "عادي"} · {arabicNumber(item.qty)}
              </small>
            </span>
            <strong>{riyal(item.unitPrice * item.qty)}</strong>
          </li>
        ))}
      </ul>
      <div className="invoice-totals">
        <div>
          <span>قيمة الوجبات</span>
          <strong className="ltr">{riyalFromHalalas(order.subtotalHalalas)}</strong>
        </div>
      </div>
      {order.status === "pending_restaurant" ? (
        <div className="offer-actions">
          <button className="btn primary" type="button" disabled={Boolean(busy)} onClick={onAccept}>
            قبول العرض
          </button>
          <textarea value={reason} onChange={(event) => onReason(event.target.value)} placeholder="سبب الرفض إن رُفض" rows={2} />
          <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={onReject}>
            رفض العرض
          </button>
        </div>
      ) : null}
      {order.status === "confirmed" ? (
        <button className="btn primary" type="button" disabled={Boolean(busy)} onClick={onDeliver}>
          تأكيد التسليم
        </button>
      ) : null}
    </section>
  );
}

const statusText: Record<Order["status"], string> = {
  pending_restaurant: "بانتظار القرار",
  confirmed: "مقبول",
  rejected: "مرفوض",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};
