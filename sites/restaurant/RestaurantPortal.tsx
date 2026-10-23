import { useEffect, useState, type ReactNode } from "react";
import { Brand, Button, InvoicePaper, StatusPill } from "../components";
import { cities, getRestaurant, restaurantsIn } from "../data";
import { arabicNumber, eventDayReached, formatDate, mealLabel } from "../format";
import { readImage } from "../images";
import { useStore } from "../store";
import type { Order, OrderStatus } from "../types";

const REST_KEY = "wifaq-preview-restaurant";
const rank: Record<OrderStatus, number> = { pending_restaurant: 0, confirmed: 1, delivered: 2, rejected: 3 };

export function RestaurantPortal({ onGate }: { onGate: () => void }) {
  const { orders } = useStore();
  const [restaurantId, setRestaurantId] = useState<string | null>(() => sessionStorage.getItem(REST_KEY));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const restaurant = restaurantId ? getRestaurant(restaurantId) : undefined;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [selectedId, restaurantId]);

  function choose(id: string) {
    sessionStorage.setItem(REST_KEY, id);
    setRestaurantId(id);
    setSelectedId(null);
  }

  if (!restaurant) {
    return (
      <div className="wide">
        <Header onGate={onGate} />
        <h2>واجهة المطعم</h2>
        <p className="lead">اختر المطعم لعرض طلباته. رقم العميل لا يظهر إلا يوم المناسبة.</p>
        {cities.map((city) => {
          const list = restaurantsIn(city.id);
          if (list.length === 0) return null;
          return (
            <section key={city.id}>
              <h3>{city.name}</h3>
              <div className="stack">
                {list.map((item) => {
                  const pending = orders.filter((order) => order.restaurantId === item.id && order.status === "pending_restaurant").length;
                  return (
                    <button key={item.id} type="button" className="card" onClick={() => choose(item.id)}>
                      <div className="spread">
                        <strong>{item.name}</strong>
                        {pending > 0 ? <span className="count">{arabicNumber(pending)} جديد</span> : null}
                      </div>
                      <p className="fine">
                        {item.district} · {item.specialty}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  const mine = orders
    .filter((order) => order.restaurantId === restaurant.id)
    .sort((a, b) => rank[a.status] - rank[b.status] || a.eventDate.localeCompare(b.eventDate));
  const selected = mine.find((order) => order.id === selectedId) ?? null;

  return (
    <div className="wide">
      <Header
        onGate={onGate}
        extra={
          <button
            className="icon-btn"
            type="button"
            onClick={() => {
              sessionStorage.removeItem(REST_KEY);
              setRestaurantId(null);
              setSelectedId(null);
            }}
          >
            تغيير المطعم
          </button>
        }
      />
      <h2>{restaurant.name}</h2>
      <p className="lead">
        {restaurant.district} · الطلبات الجديدة تُقبل أو تُرفض من هنا. رقم العميل لا يظهر إلا يوم المناسبة.
      </p>
      <div className={selected ? "split has-detail" : "split"}>
        <div className="list-pane stack">
          {mine.length === 0 ? <div className="card empty">لا توجد طلبات لهذا المطعم بعد.</div> : null}
          {mine.map((order) => (
            <button
              key={order.id}
              type="button"
              className={order.status === "pending_restaurant" ? "card pending" : "card"}
              onClick={() => setSelectedId(order.id)}
            >
              <div className="spread">
                <strong>{order.clientName}</strong>
                <StatusPill status={order.status} />
              </div>
              <p className="fine">
                {mealLabel[order.mealType]} · {formatDate(order.eventDate)} · {arabicNumber(order.attendees)} حضور
              </p>
            </button>
          ))}
        </div>
        <div className="detail-pane">
          {selected ? (
            <RestaurantOrder order={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="card empty">اختر طلبًا من القائمة.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ onGate, extra }: { onGate: () => void; extra?: ReactNode }) {
  return (
    <div className="spread" style={{ marginBottom: 16 }}>
      <Brand compact />
      <div className="spread">
        {extra}
        <button className="icon-btn" type="button" onClick={onGate}>
          الواجهات
        </button>
      </div>
    </div>
  );
}

function RestaurantOrder({ order, onBack }: { order: Order; onBack: () => void }) {
  const { acceptOrder, rejectOrder } = useStore();
  const day = eventDayReached(order.eventDate);
  const showPhone = order.status === "confirmed" && day;
  const canDeliver = order.status === "confirmed" && day;

  return (
    <div className="stack">
      <div className="spread">
        <button className="icon-btn" type="button" onClick={onBack}>
          رجوع
        </button>
        <StatusPill status={order.status} />
      </div>
      <PhoneBlock order={order} showPhone={showPhone} />
      <InvoicePaper order={order} audience="restaurant" />
      {order.status === "pending_restaurant" ? (
        <div className="actions">
          <Button onClick={() => acceptOrder(order.id)}>قبول الطلب</Button>
          <Button kind="danger" onClick={() => rejectOrder(order.id)}>
            رفض الطلب
          </Button>
        </div>
      ) : null}
      {order.status === "confirmed" && !day ? (
        <div className="note">بعد التوصيل والدفع في يوم المناسبة يظهر هنا طلب صورة الفاتورة وصورة الطلب.</div>
      ) : null}
      {canDeliver ? <DeliveryBox orderId={order.id} /> : null}
      {order.status === "delivered" ? (
        <div className="banner ok">أُرسلت الفاتورة النهائية وقائمة التقييم إلى بريد المندوب الشخصي.</div>
      ) : null}
      {order.status === "rejected" ? <div className="banner no">تم رفض هذا الطلب.</div> : null}
    </div>
  );
}

function PhoneBlock({ order, showPhone }: { order: Order; showPhone: boolean }) {
  if (order.status === "pending_restaurant" || order.status === "rejected") {
    return <div className="note">رقم العميل لا يظهر قبل تأكيد الطلب، ولا قبل يوم المناسبة.</div>;
  }
  if (order.status === "delivered") {
    return <div className="note">تم التواصل والتوصيل. رقم العميل لم يعد ظاهرًا هنا.</div>;
  }
  if (!showPhone) {
    return <div className="note">رقم العميل يظهر يوم المناسبة فقط، حتى يتواصل المطعم معه.</div>;
  }
  return (
    <div className="card">
      <div className="fine">رقم العميل</div>
      <a className="phone" href={`tel:${order.phone}`}>
        {order.phone}
      </a>
      <p className="fine">تواصل مع {order.clientName} لتنسيق الاستلام.</p>
    </div>
  );
}

function DeliveryBox({ orderId }: { orderId: string }) {
  const { deliverOrder } = useStore();
  const [invoicePhoto, setInvoicePhoto] = useState<string | null>(null);
  const [deliveryPhoto, setDeliveryPhoto] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInvoicePhoto(null);
    setDeliveryPhoto(null);
    setPaid(false);
    setError("");
  }, [orderId]);

  async function onFile(file: File | undefined, setPhoto: (value: string) => void) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("اختر ملف صورة");
      return;
    }
    try {
      setPhoto(await readImage(file));
      setError("");
    } catch {
      setError("تعذّر قراءة الصورة");
    }
  }

  return (
    <section className="card">
      <h3>بعد التوصيل والدفع</h3>
      <p className="lead">أرفق صورة الفاتورة وصورة الطلب بعد ما يوصل.</p>
      <div className="photos">
        <label className="drop">
          <strong>صورة الفاتورة</strong>
          <input type="file" accept="image/*" onChange={(event) => void onFile(event.target.files?.[0], setInvoicePhoto)} />
          {invoicePhoto ? <img src={invoicePhoto} alt="صورة الفاتورة" /> : null}
        </label>
        <label className="drop">
          <strong>صورة الطلب</strong>
          <input type="file" accept="image/*" onChange={(event) => void onFile(event.target.files?.[0], setDeliveryPhoto)} />
          {deliveryPhoto ? <img src={deliveryPhoto} alt="صورة الطلب بعد التوصيل" /> : null}
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} />
        <span>تم توصيل الطلب واستلام الدفع</span>
      </label>
      {error ? <p className="err">{error}</p> : null}
      <Button
        block
        disabled={!invoicePhoto || !deliveryPhoto || !paid || busy}
        onClick={() => {
          if (!invoicePhoto || !deliveryPhoto) return;
          setBusy(true);
          const result = deliverOrder(orderId, invoicePhoto, deliveryPhoto);
          setBusy(false);
          setError(result ?? "");
        }}
      >
        إرسال الصور وإصدار الفاتورة النهائية
      </Button>
    </section>
  );
}
