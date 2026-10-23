import { useEffect, useState } from "react";
import { BackButton } from "../components";
import { arabicNumber, formatClock, formatDate, orderNo, riyal, riyalFromHalalas, riyalWords } from "../format";
import { orderHasVoucher } from "../rewards";
import { useStore } from "../store";
import type { Order, OrderStatus as Status } from "../types";

export function orderStateLabel(status: Status) {
  if (status === "pending_restaurant") return "بانتظار تأكيد المطعم";
  if (status === "confirmed") return "تم تأكيد الطلب";
  if (status === "rejected") return "تعذر على المطعم تأكيد الطلب";
  if (status === "cancelled") return "تم إلغاء الطلب";
  return "تم التسليم";
}

export function OrderStatus({ id, onBack, onHome, onRewards }: { id: string; onBack: () => void; onHome: () => void; onRewards?: () => void }) {
  const { orders, currentUser, ledger, rateOrder, requestCancel } = useStore();
  const [askCancel, setAskCancel] = useState(false);
  const order = orders.find((item) => item.id === id && item.userId === currentUser?.id);
  const issuedByThisOrder = order ? ledger.filter((entry) => entry.orderId === order.id && entry.kind === "voucher_issued").length : 0;
  if (!order) {
    return (
      <section className="wizard">
        <BackButton onBack={onBack} />
        <h1>لم نجد هذا الطلب</h1>
        <p>تأكد أنك داخل الحساب الذي أرسل الطلب.</p>
        <button className="btn primary" type="button" onClick={onHome}>
          العودة إلى الرئيسية
        </button>
      </section>
    );
  }
  const delivered = order.status === "delivered";
  const passed = order.status === "confirmed" || delivered;
  const steps = [
    { label: "تم إرسال الطلب", done: true },
    { label: "بانتظار تأكيد المطعم", done: order.status !== "pending_restaurant" },
    { label: "تم تأكيد الطلب", done: passed },
    { label: "يوم المناسبة", done: delivered },
    { label: "تم التسليم", done: delivered },
    { label: "الفاتورة النهائية", done: delivered },
    { label: "التقييم", done: Boolean(order.rating) },
  ];
  return (
    <section className="wizard">
      <BackButton onBack={onBack} />
      <div className="success-mark" aria-hidden="true">
        ✓
      </div>
      <h1>{order.status === "pending_restaurant" ? "تم إرسال طلبك بنجاح" : order.status === "delivered" ? "تم إكمال طلبك" : "حالة طلبك"}</h1>
      <p className="lead">
        {order.status === "pending_restaurant"
          ? "تم استلام طلبك وإرساله إلى المطعم للمراجعة والتأكيد."
          : order.status === "confirmed"
            ? "تم تأكيد الطلب. يصلك التحديث على بريدك الشخصي."
            : order.status === "rejected"
              ? "تعذر على المطعم تأكيد الطلب. يمكنك بدء طلب جديد من مطعم آخر متاح."
              : order.status === "cancelled"
                ? "تم إلغاء هذا الطلب بناءً على طلبك."
                : "تم التسليم، وتُرسل الفاتورة النهائية إلى بريدك الإلكتروني الشخصي."}
      </p>
      <p>
        رقم الطلب <strong dir="ltr">#{orderNo(order.id)}</strong>
      </p>
      <p className={`order-state is-${order.status}`}>{orderStateLabel(order.status)}</p>
      {orderHasVoucher(order) ? (
        <p className="reward-msg is-ok">تم تطبيق فوتشر قيفانتا بنجاح. وفرت {arabicNumber(order.voucherDiscountHalalas / 100)} ريال على طلبك.</p>
      ) : null}
      {order.voucherUse === "released" ? (
        <p className="reward-msg">لم يكتمل هذا الطلب، لذلك أعدنا الفوتشر إلى رصيدك ويمكنك استخدامه في طلب آخر.</p>
      ) : null}
      {order.rewardStatus === "earned" ? (
        <p className="reward-msg is-ok">شكرًا لطلبك من قيفانتا! أضفنا {riyalWords(order.rewardHalalas)} إلى رصيد مكافآتك.</p>
      ) : null}
      {issuedByThisOrder > 0 ? (
        <p className="reward-msg is-gold">
          مبروك! حصلت على {issuedByThisOrder > 1 ? `${arabicNumber(issuedByThisOrder)} فوتشرات قيفانتا بقيمة 100 ريال لكل منها` : "فوتشر قيفانتا بقيمة 100 ريال"}. يمكنك استخدامه في طلبك القادم.
        </p>
      ) : null}
      {(order.rewardStatus === "earned" || issuedByThisOrder > 0) && onRewards ? (
        <button type="button" className="text-link reward-link" onClick={onRewards}>
          عرض مكافآتي
        </button>
      ) : null}
      <PreliminaryInvoice order={order} />
      {order.cancelRequested ? <p className="fine">تم إرسال طلب الإلغاء</p> : null}
      {!order.cancelRequested && (order.status === "pending_restaurant" || order.status === "confirmed") ? (
        <button type="button" className="btn ghost order-cancel" onClick={() => setAskCancel(true)}>
          طلب إلغاء الطلب
        </button>
      ) : null}
      {askCancel ? (
        <CancelDialog
          onClose={() => setAskCancel(false)}
          onConfirm={() => {
            void requestCancel(order.id);
            setAskCancel(false);
          }}
        />
      ) : null}
      <h2>حالة الطلب</h2>
      <ol className="timeline">
        {steps.map((item) => (
          <li key={item.label} className={item.done ? "done" : ""}>
            <strong>{item.label}</strong>
          </li>
        ))}
      </ol>
      {order.status === "delivered" ? (
        <RateBox
          done={Boolean(order.rating)}
          onSave={(scores) => rateOrder(order.id, { ...scores, comment: "" })}
        />
      ) : null}
      <div className="wizard-actions is-stack">
        <button className="btn ghost" type="button" onClick={onHome}>
          العودة إلى الرئيسية
        </button>
        <button className="btn primary" type="button" onClick={() => window.scrollTo(0, 0)}>
          متابعة الطلب
        </button>
      </div>
    </section>
  );
}

function InvoiceMark() {
  return (
    <svg className="mark" width="40" height="40" viewBox="4 0 56 56" aria-hidden="true">
      <circle cx="16" cy="24" r="6" />
      <circle className="mark-gold" cx="32" cy="16" r="6" />
      <circle cx="48" cy="24" r="6" />
      <path d="M8 44h48" />
    </svg>
  );
}

function PreliminaryInvoice({ order }: { order: Order }) {
  const hasDiscount = order.voucherDiscountHalalas > 0 && orderHasVoucher(order);
  const meal = order.mealType === "breakfast" ? "فطور" : order.mealType === "lunch" ? "غداء" : "عشاء";
  return (
    <article className="invoice" aria-labelledby="invoice-title">
      <div className="invoice-top">
        <div className="invoice-brand">
          <InvoiceMark />
          <div>
            <strong>قيفانتا</strong>
            <span className="wordmark-latin" lang="en" dir="ltr">
              Qyvanta
            </span>
          </div>
        </div>
        <p className="invoice-kicker" id="invoice-title">
          فاتورة مبدئية
        </p>
      </div>
      <p className="invoice-restaurant">{order.restaurantName}</p>
      <p className="fine">{order.cityName} · {meal}</p>
      <dl className="invoice-meta">
        <div>
          <dt>رقم الطلب</dt>
          <dd dir="ltr">#{orderNo(order.id)}</dd>
        </div>
        <div>
          <dt>تاريخ المناسبة</dt>
          <dd>{formatDate(order.eventDate)}</dd>
        </div>
        <div>
          <dt>وقت الاستلام</dt>
          <dd>{formatClock(order.pickupTime)}</dd>
        </div>
        <div>
          <dt>عدد الحضور</dt>
          <dd>{arabicNumber(order.attendees)}</dd>
        </div>
      </dl>
      <ul className="invoice-lines">
        {order.items.map((item) => (
          <li key={item.key}>
            <span>
              {item.name}
              <small>
                {item.tier === "luxury" ? "فاخر" : "عادي"} · {arabicNumber(item.qty)} × <span className="ltr">{riyal(item.unitPrice)}</span>
              </small>
            </span>
            <strong className="ltr">{riyal(item.unitPrice * item.qty)}</strong>
          </li>
        ))}
      </ul>
      {hasDiscount ? (
        <div className="invoice-totals">
          <div>
            <span>المجموع</span>
            <strong className="ltr">{riyalFromHalalas(order.subtotalHalalas)}</strong>
          </div>
          <div className="is-discount">
            <span>خصم فوتشر قيفانتا</span>
            <strong className="ltr">- {riyalFromHalalas(order.voucherDiscountHalalas)}</strong>
          </div>
        </div>
      ) : null}
      <div className="invoice-sum">
        <span>{hasDiscount ? "الإجمالي بعد الخصم" : "القيمة التقديرية"}</span>
        <strong className="ltr">{riyalFromHalalas(order.totalHalalas)}</strong>
      </div>
      {hasDiscount ? <p className="invoice-note">قيمة الفوتشر تتحملها قيفانتا، ولا تؤثر على مستحقات المطعم.</p> : null}
      <p className="invoice-note">عرض تقديري. القيمة الحالية تقديرية وقد تتغير بعد تأكيد المطعم. هذه ليست فاتورة نهائية.</p>
    </article>
  );
}

function RateBox({
  done,
  onSave,
}: {
  done: boolean;
  onSave: (scores: { food: number; timing: number; accuracy: number; presentation: number }) => string | null | Promise<string | null>;
}) {
  const [scores, setScores] = useState({ food: 0, timing: 0, accuracy: 0, presentation: 0 });
  const [error, setError] = useState("");
  if (done) return <p>شكرًا، وصل تقييمك.</p>;
  const items = [
    ["food", "جودة الوجبة"],
    ["timing", "الالتزام بالوقت"],
    ["accuracy", "مطابقة الطلب"],
    ["presentation", "التقديم"],
  ] as const;
  return (
    <section className="soft-card">
      <h2>قيّم تجربتك مع قيفانتا</h2>
      {items.map(([key, label]) => (
        <div key={key}>
          <span>{label}</span>
          <div className="score">
            {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                className={scores[key] === score ? "on" : ""}
                aria-pressed={scores[key] === score}
                onClick={() => setScores((current) => ({ ...current, [key]: score }))}
              >
                {score}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error ? <p className="err">{error}</p> : null}
      <button
        className="btn primary"
        type="button"
        onClick={() => {
          if (items.some(([key]) => scores[key] < 1)) {
            setError("اختر درجة لكل بند حتى نفهم تجربتك.");
            return;
          }
          void Promise.resolve(onSave(scores)).then((result) => setError(result ?? ""));
        }}
      >
        إرسال التقييم
      </button>
    </section>
  );
}

function CancelDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-back" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
        <h2 id="cancel-title">هل تريد طلب إلغاء هذا الطلب؟</h2>
        <p>سيتم إرسال طلب الإلغاء للمراجعة، وقد تعتمد إمكانية الإلغاء على حالة الطلب والشروط المعمول بها.</p>
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            العودة
          </button>
          <button type="button" className="btn primary" onClick={onConfirm}>
            تأكيد طلب الإلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

