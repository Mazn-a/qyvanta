import { useEffect, useState } from "react";
import { Brand, InvoicePaper, StatusPill } from "../components";
import { formatDateTime, mealLabel } from "../format";
import { useStore } from "../store";
import type { Order } from "../types";

interface Alert {
  id: string;
  at: string;
  orderId: string;
  tone: "wait" | "ok" | "no";
  title: string;
  body: string;
}

type Filter = "all" | "wait" | "ok" | "no";

export function AdminPortal({ onGate }: { onGate: () => void }) {
  const { orders } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const alerts = buildAlerts(orders).filter((alert) => filter === "all" || alert.tone === filter);
  const selected = orders.find((order) => order.id === selectedId) ?? null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedId]);

  return (
    <div className="wide">
      <div className="spread" style={{ marginBottom: 16 }}>
        <Brand compact />
        <button className="icon-btn" type="button" onClick={onGate}>
          الواجهات
        </button>
      </div>
      <h2>واجهة الإدارة</h2>
      <p className="lead">تنبيه عند الطلب الجديد، ثم ظهور أن المطعم أكد. القبول والرفض من المطعم، وليس من هنا.</p>
      <div className={selected ? "split has-detail" : "split"}>
        <div className="list-pane">
          <div className="tabs">
            {(
              [
                ["all", "الكل"],
                ["wait", "بانتظار"],
                ["ok", "تأكيد"],
                ["no", "مرفوض"],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" className={filter === key ? "on" : ""} onClick={() => setFilter(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className="stack">
            {alerts.length === 0 ? <div className="card empty">لا توجد تنبيهات بعد.</div> : null}
            {alerts.map((alert) => (
              <button key={alert.id} type="button" className="card" onClick={() => setSelectedId(alert.orderId)}>
                <div className="spread">
                  <strong>{alert.title}</strong>
                  <span className={`pill ${alert.tone}`}>{formatDateTime(alert.at)}</span>
                </div>
                <p className="fine">{alert.body}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="detail-pane">
          {selected ? (
            <AdminOrder order={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="card empty">اختر تنبيهًا لعرض الطلب.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminOrder({ order, onBack }: { order: Order; onBack: () => void }) {
  return (
    <div className="stack">
      <div className="spread">
        <button className="icon-btn" type="button" onClick={onBack}>
          رجوع
        </button>
        <StatusPill status={order.status} />
      </div>
      <AdminBanner order={order} />
      <InvoicePaper order={order} audience="admin" />
      <p className="fine">
        نوع الوجبة: {mealLabel[order.mealType]}. الرسائل تذهب إلى {order.personalEmail} وليس إلى {order.companyEmail}.
      </p>
      {order.invoicePhoto || order.deliveryPhoto ? (
        <div className="photos">
          {order.invoicePhoto ? <img src={order.invoicePhoto} alt="صورة الفاتورة المرفوعة" /> : null}
          {order.deliveryPhoto ? <img src={order.deliveryPhoto} alt="صورة الطلب بعد التوصيل" /> : null}
        </div>
      ) : null}
    </div>
  );
}

function AdminBanner({ order }: { order: Order }) {
  if (order.status === "confirmed" || order.status === "delivered") {
    return <div className="banner ok">المطعم أكد الطلب.</div>;
  }
  if (order.status === "rejected") return <div className="banner no">المطعم رفض الطلب.</div>;
  return <div className="banner">تنبيه: طلب جديد بانتظار رد المطعم.</div>;
}

function buildAlerts(orders: Order[]): Alert[] {
  const alerts: Alert[] = [];
  for (const order of orders) {
    alerts.push({
      id: `${order.id}-new`,
      at: order.createdAt,
      orderId: order.id,
      tone: "wait",
      title: "تنبيه: طلب جديد",
      body: `${order.clientName} أرسل طلبًا إلى ${order.restaurantName}`,
    });
    if (order.confirmedAt) {
      alerts.push({
        id: `${order.id}-ok`,
        at: order.confirmedAt,
        orderId: order.id,
        tone: "ok",
        title: "المطعم أكد الطلب",
        body: `${order.restaurantName} أكد طلب ${order.clientName}`,
      });
    }
    if (order.rejectedAt) {
      alerts.push({
        id: `${order.id}-no`,
        at: order.rejectedAt,
        orderId: order.id,
        tone: "no",
        title: "المطعم رفض الطلب",
        body: `${order.restaurantName} رفض طلب ${order.clientName}`,
      });
    }
    if (order.deliveredAt) {
      alerts.push({
        id: `${order.id}-done`,
        at: order.deliveredAt,
        orderId: order.id,
        tone: "ok",
        title: "تم التوصيل وإرسال الفاتورة",
        body: `الفاتورة النهائية وقائمة التقييم أُرسلتا إلى ${order.personalEmail}`,
      });
    }
  }
  return alerts.sort((a, b) => (a.at < b.at ? 1 : -1));
}
