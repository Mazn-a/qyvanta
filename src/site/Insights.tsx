import { formatDateTime, orderTiming, riyalFromHalalas } from "../format";
import type { Order, OrderStage } from "../types";

export type InsightPerson = {
  id: string;
  userId: string | null;
  name: string;
  stop: string;
  lastSeen: string;
  visits: number;
  orders: number;
};

export type Insight = {
  visitors: number;
  sessions: number;
  guests: number;
  customers: number;
  sentOrders: number;
  funnel: { label: string; value: number }[];
  stops: { label: string; guests: number; customers: number; total: number }[];
  orders: { label: string; value: number }[];
  guestsList: InsightPerson[];
  customersList: InsightPerson[];
};

type Go = "orders" | "settle" | "clients" | "restaurants" | "reports";

export function AdminDesk({
  insight,
  orders,
  restaurants,
  neededSettlements,
  pendingCoverHalalas,
  newReports = 0,
  onGo,
}: {
  insight: Insight;
  orders: Order[];
  restaurants: Record<string, unknown>[];
  neededSettlements: number;
  pendingCoverHalalas: number;
  newReports?: number;
  onGo: (place: Go, stage?: OrderStage) => void;
}) {
  const cancels = orders.filter((order) => order.cancelRequested && (order.status === "pending_restaurant" || order.status === "confirmed"));
  const waiting = orders.filter((order) => order.status === "pending_restaurant").sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const confirmed = orders.filter((order) => order.status === "confirmed");
  const delivered = orders.filter((order) => order.status === "delivered");
  const oldest = waiting[0];
  const needs = [
    cancels.length
      ? { key: "cancel", title: `${cancels.length} طلب إلغاء`, detail: "بانتظار قرارك", go: () => onGo("orders", "attention") }
      : null,
    waiting.length
      ? {
          key: "wait",
          title: `${waiting.length} بانتظار المطعم`,
          detail: oldest ? `أقدمها منذ ${orderTiming(oldest).waitingLabel}` : "تابع الرد",
          go: () => onGo("orders", "pending_restaurant"),
        }
      : null,
    neededSettlements
      ? { key: "settle", title: `${neededSettlements} تسوية`, detail: pendingCoverHalalas ? riyalFromHalalas(pendingCoverHalalas) : "بعد التسليم", go: () => onGo("settle") }
      : null,
    newReports
      ? { key: "reports", title: `${newReports} بلاغ جديد`, detail: "نص أو مرفق", go: () => onGo("reports") }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صباح الخير" : "مساء الخير";

  return (
    <section className="desk pulse">
      <header className="desk-welcome">
        <p className="admin-kicker">مرحبًا بك في قيفانتا</p>
        <h1>{greeting}</h1>
        <p>{needs.length ? "هذا ما ينتظرك اليوم." : "يوم هادئ. لا شيء ينتظر قرارك."}</p>
      </header>

      {needs.length > 0 ? (
        <div className="pulse-needs">
          {needs.map((item) => (
            <button key={item.key} type="button" className="pulse-need" onClick={item.go}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
              <em>افتح</em>
            </button>
          ))}
        </div>
      ) : null}

      <section className="pulse-block is-orders">
        <h2>اليوم</h2>
        <p>مسار الطلب</p>
        <div className="pulse-grid">
          <Stat value={waiting.length} label="ينتظر" tone={waiting.length ? "warn" : "quiet"} onClick={() => onGo("orders", "pending_restaurant")} />
          <Stat value={confirmed.length} label="مؤكد" tone={confirmed.length ? "work" : "quiet"} onClick={() => onGo("orders", "confirmed")} />
          <Stat value={delivered.length} label="مسلّم" tone={delivered.length ? "done" : "quiet"} onClick={() => onGo("orders", "delivered")} />
        </div>
      </section>

      <section className="pulse-block is-account">
        <h2>المنصة</h2>
        <div className="pulse-grid is-four">
          <Stat value={insight.guests} label="زوار" onClick={() => onGo("clients")} />
          <Stat value={insight.customers} label="عملاء" onClick={() => onGo("clients")} />
          <Stat value={restaurants.length} label="مطاعم" onClick={() => onGo("restaurants")} />
          <Stat value={newReports} label="بلاغات" tone={newReports ? "alert" : "quiet"} onClick={() => onGo("reports")} />
        </div>
        {pendingCoverHalalas > 0 ? (
          <button type="button" className="pulse-money" onClick={() => onGo("settle")}>
            تغطية معلّقة <strong>{riyalFromHalalas(pendingCoverHalalas)}</strong>
          </button>
        ) : null}
      </section>

      <section className="pulse-move">
        <h2>حركة الموقع</h2>
        <div className="pulse-move-facts">
          <p><strong>{insight.visitors}</strong><span>زاروا</span></p>
          <p><strong>{insight.sessions}</strong><span>جلسة</span></p>
          <p><strong>{insight.sentOrders}</strong><span>أرسلوا طلبًا</span></p>
        </div>
        {insight.stops.length > 0 ? (
          <div className="pulse-move-stops">
            <p>أين توقفوا</p>
            {insight.stops.slice(0, 4).map((item) => (
              <BarRow key={item.label} label={item.label} value={item.total} max={Math.max(...insight.stops.map((row) => row.total), 1)} />
            ))}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function Stat({
  value,
  label,
  hint,
  tone = "plain",
  onClick,
}: {
  value: number;
  label: string;
  hint?: string;
  tone?: "plain" | "quiet" | "warn" | "work" | "done" | "alert";
  onClick: () => void;
}) {
  return (
    <button type="button" className={`pulse-stat is-${tone}`} onClick={onClick}>
      <strong>{value}</strong>
      <span>{label}</span>
      {hint ? <small>{hint}</small> : null}
    </button>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div className="pulse-stop">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <i style={{ width: `${Math.max(value ? 8 : 0, (value / max) * 100)}%` }} />
    </div>
  );
}

export function PeopleList({ title, empty, people, guest }: { title: string; empty: string; people: InsightPerson[]; guest?: boolean }) {
  return (
    <article className={`insight-card ${guest ? "is-guest" : ""}`}>
      <h2>{title}</h2>
      {people.length === 0 ? <p className="admin-empty">{empty}</p> : null}
      <div className="stack">
        {people.map((item) => (
          <article key={item.id} className="settle-card">
            <span>
              <strong>{item.name}</strong>
              <small>
                توقف عند: {item.stop}
                {item.orders ? ` · ${item.orders} طلب` : ""}
              </small>
            </span>
            <em className="admin-state">{item.lastSeen ? formatDateTime(item.lastSeen) : "—"}</em>
          </article>
        ))}
      </div>
    </article>
  );
}
