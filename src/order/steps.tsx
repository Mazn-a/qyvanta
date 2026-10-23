import { useEffect, useRef, useState } from "react";
import { RequiredStar } from "../components";
import { getCity, getRestaurant, restaurantsIn, useCatalog } from "../catalog";
import { cityLabel, mealOrder, restaurantPhoto } from "../data";
import { arabicNumber, formatClock, formatDate, riyal } from "../format";
import { useLang } from "../i18n";
import { MEAL_WINDOWS, mealWindowHint, mealWindowShort, timeFitsMeal } from "../meals";
import { VOUCHER_MIN_ORDER_HALALAS } from "../rewards";
import type { MealType, Tier, Voucher } from "../types";
import type { DishLine, Draft } from "./draft";
import { countError, englishDigits } from "./validate";
import { DateField, TimeField } from "./WhenFields";

export function CityStep({
  draft,
  tried,
  onPick,
}: {
  draft: Draft;
  tried: boolean;
  onPick: (cityId: string) => void;
}) {
  const { lang } = useLang();
  const { cities } = useCatalog();
  const invalid = tried && !draft.cityId;
  return (
    <div className="city-pick">
      <div className="city-list" role="radiogroup" aria-label="مدينة المناسبة">
        {cities.map((city) => {
          const selected = draft.cityId === city.id;
          const quiet = restaurantsIn(city.id).length === 0;
          return (
            <button
              key={city.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={quiet}
              disabled={quiet}
              className={selected ? "city-row is-selected" : quiet ? "city-row is-soon" : "city-row"}
              onClick={() => onPick(city.id)}
            >
              <svg className="city-pin" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
              </svg>
              <span className="city-name">
                {cityLabel(city, lang)}
                {quiet ? <small>قريباً</small> : null}
              </span>
              <span className="city-radio" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {invalid ? <em className="err">يرجى اختيار مدينة للمتابعة.</em> : null}
    </div>
  );
}

export function RestaurantStep({
  cityId,
  selectedId,
  onPick,
  onChangeCity,
}: {
  cityId: string;
  selectedId: string;
  onPick: (id: string) => void;
  onChangeCity: () => void;
}) {
  const { lang } = useLang();
  const { restaurants } = useCatalog();
  const city = getCity(cityId);
  const list = restaurants.filter((item) => item.cityId === cityId);
  if (list.length === 0) {
    return (
      <div className="card">
        <h2>لا توجد مطاعم متاحة حاليًا</h2>
        <p>جرّب اختيار مدينة أخرى متاحة أو العودة في وقت لاحق.</p>
        <button type="button" className="btn primary" onClick={onChangeCity}>
          تغيير المدينة
        </button>
      </div>
    );
  }
  return (
    <div className="restaurant-list">
      {list.map((restaurant) => {
        const selected = restaurant.id === selectedId;
        return (
          <button
            key={restaurant.id}
            type="button"
            className={selected ? "restaurant-card is-selected" : "restaurant-card"}
            aria-pressed={selected}
            onClick={() => onPick(restaurant.id)}
          >
            <img src={restaurantPhoto(restaurant.id)} alt="" />
            <span className="restaurant-copy">
              <strong>{restaurant.name}</strong>
              <span className="restaurant-meta">
                <small>
                  {city ? cityLabel(city, lang) : ""} · {restaurant.district}
                </small>
                <small>{restaurant.specialty}</small>
              </span>
            </span>
            <span className={selected ? "pick-state is-on" : "pick-state"}>{selected ? "تم اختيار المطعم" : "اختيار المطعم"}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MealStep({ value, onPick }: { value: MealType | ""; onPick: (meal: MealType) => void }) {
  const { lang } = useLang();
  const labels = { breakfast: "فطور", lunch: "غداء", dinner: "عشاء" };
  const notes = {
    breakfast: "ضيافة الصباح، من الفول والتمر إلى المناقيش.",
    lunch: "ولائم الغداء، من الكبسة والمندي إلى المائدة.",
    dinner: "عشاء المناسبات، من المشاوي إلى المرق.",
  };
  return (
    <div className="choice-list">
      {mealOrder.map((meal) => (
        <button key={meal} type="button" className={value === meal ? "choice meal-choice on" : "choice meal-choice"} onClick={() => onPick(meal)}>
          <img src={`${import.meta.env.BASE_URL}hospitality/${meal}.jpg`} alt="" loading="lazy" />
          <span>
            <strong>{labels[meal]}</strong>
            <small>{notes[meal]}</small>
            <small>{mealWindowShort(meal, lang)}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

const QTY_MAX = 500;

function dishTitle(name: string, tier: Tier) {
  if (name === "وجبة") return tier === "luxury" ? "وجبة فاخرة" : "وجبة عادية";
  return tier === "luxury" ? `${name} فاخر` : `${name} عادي`;
}

function dishNote(name: string, tier: Tier) {
  const rich = tier === "luxury" ? "بتقديم أوفر" : "بالتقديم المعتاد";
  if (name === "وجبة") return `وجبة كاملة ${rich}، لكل شخص`;
  return `دجاج مظبي ${rich}، لكل شخص`;
}

function dishPhoto(itemId: string, tier: Tier) {
  const slug = itemId.includes("madhbi") ? "madhbi" : "meal";
  return `${import.meta.env.BASE_URL}hospitality/${slug}-${tier}.jpg`;
}

function HoldStep({
  className,
  label,
  disabled,
  every,
  onTap,
  onHold,
  children,
}: {
  className: string;
  label: string;
  disabled?: boolean;
  every: number;
  onTap: () => void;
  onHold: () => void;
  children: string;
}) {
  const holding = useRef(false);
  const timers = useRef<{ delay?: number; tick?: number }>({});
  const tapRef = useRef(onTap);
  const holdRef = useRef(onHold);
  tapRef.current = onTap;
  holdRef.current = onHold;

  function stop() {
    window.clearTimeout(timers.current.delay);
    window.clearInterval(timers.current.tick);
    timers.current.delay = undefined;
    timers.current.tick = undefined;
  }

  useEffect(() => stop, []);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled]);

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* some browsers reject capture on an untrusted event */
        }
        holding.current = false;
        stop();
        timers.current.delay = window.setTimeout(() => {
          holding.current = true;
          holdRef.current();
          timers.current.tick = window.setInterval(() => holdRef.current(), every);
        }, 280);
      }}
      onPointerUp={stop}
      onLostPointerCapture={stop}
      onClick={() => {
        if (holding.current) {
          holding.current = false;
          return;
        }
        tapRef.current();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}

export function DishStep({
  items,
  lines,
  attendees,
  tried,
  estimate,
  onChange,
}: {
  items: { id: string; name: string; description: string; prices: Record<Tier, number> }[];
  lines: DishLine[];
  attendees: number;
  tried: boolean;
  estimate: number;
  onChange: (lines: DishLine[]) => void;
}) {
  const linesRef = useRef(lines);
  linesRef.current = lines;

  function update(itemId: string, tier: Tier, next: DishLine | null) {
    const rest = linesRef.current.filter((line) => !(line.itemId === itemId && line.tier === tier));
    const linesNext = next ? [...rest, next] : rest;
    linesRef.current = linesNext;
    onChange(linesNext);
  }

  function bump(itemId: string, tier: Tier, delta: number) {
    const current = linesRef.current.find((entry) => entry.itemId === itemId && entry.tier === tier)?.qty ?? 0;
    const qty = Math.max(0, Math.min(QTY_MAX, current + delta));
    if (qty === current) return;
    update(itemId, tier, qty === 0 ? null : { itemId, tier, qty });
  }

  const chosen = lines.some((line) => line.qty > 0);
  return (
    <div className="dish-list">
      {attendees > 0 ? (
        <p className="dish-note" role="note">
          <strong>تنبيه.</strong> اقتراح الكمية حسب عدد الحضور {arabicNumber(attendees)}، والكمية لا تُملأ تلقائيًا.
        </p>
      ) : null}
      {items.flatMap((item) =>
        (["luxury", "regular"] as const).map((tier) => {
          const qty = lines.find((entry) => entry.itemId === item.id && entry.tier === tier)?.qty ?? 0;
          const title = dishTitle(item.name, tier);
          return (
            <article key={`${item.id}-${tier}`} className={qty > 0 ? "dish-card on" : "dish-card"}>
              <img src={dishPhoto(item.id, tier)} alt="" />
              <div className="dish-body">
                <h3>{title}</h3>
                <p>{dishNote(item.name, tier)}</p>
                <div className="dish-row">
                  <strong className="dish-price ltr">{riyal(item.prices[tier])}</strong>
                  <div className="dish-stepper">
                    <HoldStep
                      className="minus"
                      label={`إنقاص كمية ${title}`}
                      disabled={qty === 0}
                      every={140}
                      onTap={() => bump(item.id, tier, -1)}
                      onHold={() => bump(item.id, tier, -5)}
                    >
                      −
                    </HoldStep>
                    <span className="count">{arabicNumber(qty)}</span>
                    <HoldStep
                      className="plus"
                      label={`زيادة عدد ${title}`}
                      every={140}
                      onTap={() => bump(item.id, tier, 1)}
                      onHold={() => bump(item.id, tier, 5)}
                    >
                      +
                    </HoldStep>
                  </div>
                </div>
              </div>
            </article>
          );
        }),
      )}
      {tried && !chosen ? <p className="err">اختر وجبة واحدة على الأقل وحدد كميتها.</p> : null}
      <p className="fine">الكمية مستقلة عن عدد الحضور. تغيير الكمية لا يغيّر عدد الأشخاص.</p>
      <div className="dish-total">
        <span>السعر الإجمالي</span>
        <strong className="ltr">{riyal(estimate)}</strong>
      </div>
    </div>
  );
}

export function GuestStep({ value, tried, onChange }: { value: string; tried: boolean; onChange: (value: string) => void }) {
  const error = tried ? countError(value) : value ? countError(value) : "";
  return (
    <label className={error ? "field invalid" : "field"}>
      <span>عدد الحضور <RequiredStar /></span>
      <input
        inputMode="numeric"
        placeholder="مثال: 50"
        aria-invalid={Boolean(error)}
        value={value}
        onChange={(event) => onChange(englishDigits(event.target.value).replace(/\D/g, "").slice(0, 4))}
      />
      {error ? <em className="err">{error}</em> : null}
    </label>
  );
}

export function WhenStep({
  date,
  time,
  today,
  mealType,
  tried,
  onDate,
  onTime,
}: {
  date: string;
  time: string;
  today: string;
  mealType: MealType | "";
  tried: boolean;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
}) {
  const { lang } = useLang();
  const window = mealType ? MEAL_WINDOWS[mealType] : null;
  const timeOk = Boolean(mealType && time && timeFitsMeal(time, mealType));
  const timeWrong = Boolean(time && mealType && !timeFitsMeal(time, mealType));

  return (
    <>
      <label className={tried && !date ? "field invalid" : "field"}>
        <span>تاريخ المناسبة <RequiredStar /></span>
        <DateField value={date} min={today} onChange={onDate} />
        {tried && !date ? <em className="err">يرجى اختيار تاريخ المناسبة.</em> : null}
        {date && date < today ? <em className="err">تاريخ المناسبة لا يكون في الماضي.</em> : null}
      </label>
      <div>
        <h2>متى تحتاج الطلب؟</h2>
        <p className="lead">{mealType ? mealWindowHint(mealType, lang) : "حدّد الوقت الذي ترغب باستلام الطلب أو وصوله فيه."}</p>
      </div>
      <label className={tried && !timeOk ? "field invalid" : "field"}>
        <span>وقت الاستلام <RequiredStar /></span>
        <TimeField value={time} onChange={onTime} min={window?.start} max={window?.end} />
        {tried && !time ? <em className="err">يرجى تحديد وقت الاستلام.</em> : null}
        {timeWrong ? <em className="err">الوقت المختار خارج فترة الوجبة.</em> : null}
        {timeOk ? <p className="fine">{formatClock(time)}</p> : null}
      </label>
      {date ? <p className="fine">{formatDate(date)}</p> : null}
    </>
  );
}

export function PlaceStep({
  place,
  notes,
  tried,
  onPlace,
  onNotes,
}: {
  place: string;
  notes: string;
  tried: boolean;
  onPlace: (value: string) => void;
  onNotes: (value: string) => void;
}) {
  const error = tried && place.trim().length < 3;
  return (
    <>
      <label className={error ? "field invalid" : "field"}>
        <span>موقع الاستلام <RequiredStar /></span>
        <input
          placeholder="أدخل موقع المناسبة"
          maxLength={200}
          aria-invalid={error}
          value={place}
          onChange={(event) => onPlace(event.target.value.slice(0, 200))}
        />
        {error ? <em className="err">يرجى إدخال موقع الاستلام بتفصيل يكفي للتسليم، وبحد أقصى 200 حرف.</em> : null}
      </label>
      <div>
        <h2>هل لديك ملاحظات إضافية؟</h2>
        <p className="lead">أضف أي تفاصيل ترغب بإيصالها للمطعم قبل تنفيذ الطلب.</p>
      </div>
      <label className="field">
        <span>ملاحظات <small className="optional">اختياري</small></span>
        <textarea
          placeholder="اكتب ملاحظاتك هنا..."
          maxLength={500}
          value={notes}
          onChange={(event) => onNotes(event.target.value.slice(0, 500))}
        />
        <small className="fine">متبقي {arabicNumber(500 - notes.length)} من 500</small>
      </label>
    </>
  );
}

export function ReviewStep({
  draft,
  dishes,
  estimate,
  onEdit,
  voucher,
  applied,
  onVoucher,
}: {
  draft: Draft;
  dishes: { name: string; tier: Tier; qty: number; unitPrice: number }[];
  estimate: number;
  onEdit: (step: number) => void;
  /** فوتشر متاح للعميل الحالي يمكن عرضه، إن وجد. */
  voucher: Voucher | null;
  applied: boolean;
  onVoucher: (voucherId: string | null) => void;
}) {
  const { lang } = useLang();
  const [editOpen, setEditOpen] = useState(false);
  const [declined, setDeclined] = useState(false);
  const voucherRiyals = voucher ? voucher.valueHalalas / 100 : 0;
  const eligible = Boolean(voucher) && estimate >= VOUCHER_MIN_ORDER_HALALAS / 100;
  const discount = applied && eligible ? Math.min(voucherRiyals, estimate) : 0;
  const total = Math.max(0, estimate - discount);
  const city = getCity(draft.cityId);
  const restaurant = getRestaurant(draft.restaurantId);
  const meal = draft.mealType === "breakfast" ? "فطور" : draft.mealType === "lunch" ? "غداء" : "عشاء";
  const dishText = dishes.length
    ? dishes.map((line) => `${line.name} · ${line.tier === "luxury" ? "فاخر" : "عادي"} · ${arabicNumber(line.qty)} × ${riyal(line.unitPrice)}`).join("، ")
    : "—";
  const rows = [
    ["المدينة", city ? cityLabel(city, lang) : "—", 0],
    ["المطعم", restaurant?.name ?? "—", 1],
    ["نوع الوجبة", meal, 2],
    ["عدد الحضور", draft.attendees || "—", 3],
    ["تاريخ المناسبة", draft.eventDate ? formatDate(draft.eventDate) : "—", 5],
    ["وقت الاستلام", draft.pickupTime ? formatClock(draft.pickupTime) : "—", 5],
    ["موقع الاستلام", draft.pickupLocation || "—", 6],
    ["الملاحظات", draft.notes.trim() || "لا توجد ملاحظات", 6],
  ] as const;
  return (
    <div className="review-stage">
      <article className="invoice review-invoice" aria-label="فاتورة الطلب">
        <div className="invoice-top">
          <div className="invoice-brand">
            <svg className="mark" width="40" height="40" viewBox="4 0 56 56" aria-hidden="true">
              <circle cx="16" cy="24" r="6" />
              <circle className="mark-gold" cx="32" cy="16" r="6" />
              <circle cx="48" cy="24" r="6" />
              <path d="M8 44h48" />
            </svg>
            <div>
              <strong>قيفانتا</strong>
              <span className="wordmark-latin" lang="en" dir="ltr">
                Qyvanta
              </span>
            </div>
          </div>
          <p className="invoice-kicker">فاتورة مبدئية</p>
        </div>
        <div className="review-edit-bar">
          <button
            type="button"
            className={editOpen ? "review-edit-one on" : "review-edit-one"}
            aria-expanded={editOpen}
            onClick={() => setEditOpen((open) => !open)}
          >
            تعديل
          </button>
        </div>
        {editOpen ? (
          <div className="review-edit-list">
            {rows.map(([label, , edit]) => (
              <button type="button" key={label} onClick={() => onEdit(edit)}>
                <span>{label}</span>
                تعديل
              </button>
            ))}
            <button type="button" onClick={() => onEdit(4)}>
              <span>الوجبات</span>
              تعديل
            </button>
          </div>
        ) : null}
        <div className="review-lines">
          {rows.map(([label, value]) => (
            <div className="review-line" key={label}>
              <div>
                <span className="fine">{label}</span>
                <strong>{value}</strong>
              </div>
            </div>
          ))}
          <div className="review-line">
            <div>
              <span className="fine">الوجبات</span>
              {dishes.length ? null : <strong>{dishText}</strong>}
            </div>
          </div>
          {dishes.length ? (
            <ul className="invoice-lines">
              {dishes.map((line) => (
                <li key={`${line.name}-${line.tier}`}>
                  <span>
                    {line.name}
                    <small>
                      {line.tier === "luxury" ? "فاخر" : "عادي"} · {arabicNumber(line.qty)} × {riyal(line.unitPrice)}
                    </small>
                  </span>
                  <strong className="ltr">{riyal(line.unitPrice * line.qty)}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {voucher && eligible && !applied && !declined ? (
          <div className="voucher-ask" role="group" aria-label="فوتشر قيفانتا">
            <VoucherIcon />
            <div>
              <p>
                لديك فوتشر بقيمة {arabicNumber(voucherRiyals)} ريال، هل ترغب في استخدامه على هذا الطلب؟
              </p>
              <div className="voucher-ask-actions">
                <button type="button" className="btn primary" onClick={() => onVoucher(voucher.id)}>
                  استخدام الفوتشر
                </button>
                <button type="button" className="btn ghost" onClick={() => setDeclined(true)}>
                  متابعة بدون فوتشر
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {voucher && eligible && !applied && declined ? (
          <p className="voucher-line">
            <span>متابعة بدون فوتشر.</span>
            <button type="button" className="text-link" onClick={() => onVoucher(voucher.id)}>
              استخدام الفوتشر
            </button>
          </p>
        ) : null}
        {voucher && !eligible ? (
          <p className="voucher-line is-muted">
            <span>فوتشر قيفانتا يُستخدم على طلب بقيمة {arabicNumber(VOUCHER_MIN_ORDER_HALALAS / 100)} ريال فأكثر.</span>
          </p>
        ) : null}
        {discount > 0 ? (
          <div className="invoice-totals">
            <div>
              <span>المجموع</span>
              <strong className="ltr">{riyal(estimate)}</strong>
            </div>
            <div className="is-discount">
              <span>
                خصم فوتشر قيفانتا
                <button type="button" className="text-link" onClick={() => onVoucher(null)}>
                  إزالة
                </button>
              </span>
              <strong className="ltr">- {riyal(discount)}</strong>
            </div>
          </div>
        ) : null}
        <div className="invoice-sum">
          <span>{discount > 0 ? "الإجمالي بعد الخصم" : "القيمة التقديرية"}</span>
          <strong className="ltr">{riyal(total)}</strong>
        </div>
        {discount > 0 ? <p className="voucher-ok">تم تطبيق فوتشر قيفانتا. ستوفر {arabicNumber(discount)} ريال على هذا الطلب عند إرساله.</p> : null}
        <p className="invoice-note">القيمة النهائية تعتمد على تأكيد المطعم للطلب.</p>
      </article>
    </div>
  );
}

export function VoucherIcon() {
  return (
    <span className="voucher-icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="26" height="26">
        <path
          d="M5 11a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V21a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M13 9v14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2.5 2.5" />
      </svg>
    </span>
  );
}
