import { useEffect, useState } from "react";
import { BackButton } from "../components";
import { getCity, getRestaurant, useCatalog } from "../catalog";
import { cityLabel } from "../data";
import { lineTotal, todayISO } from "../format";
import { useLang } from "../i18n";
import { timeFitsMeal } from "../meals";
import { availableVouchers, VOUCHER_MIN_ORDER_HALALAS } from "../rewards";
import { useStore } from "../store";
import { AccountStep, LoginPanel } from "./account";
import { DRAFT_KEY, PROFILE_KEY, loadDraft, type Draft } from "./draft";
import { CityStep, DishStep, GuestStep, MealStep, PlaceStep, RestaurantStep, ReviewStep, WhenStep } from "./steps";
import { countError, locationError } from "./validate";

export { OrderStatus } from "./status";

export function OrderFlow({
  mode,
  seed,
  onHome,
  onTrack,
  onStart,
  onLoggedIn,
  resumeStep = null,
  onStep,
}: {
  mode: "order" | "login";
  seed?: { cityId: string; restaurantId: string } | null;
  onHome: () => void;
  onTrack: (id: string) => void;
  onStart: () => void;
  onLoggedIn: (email: string) => void;
  resumeStep?: number | null;
  onStep?: (step: number) => void;
}) {
  const { lang } = useLang();
  const store = useStore();
  useCatalog();
  const [step, setStep] = useState(mode === "login" ? 9 : resumeStep != null ? resumeStep : seed ? 2 : 0);
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = loadDraft();
    if (mode === "login" || resumeStep != null) return saved;
    if (!seed) return { ...saved, cityId: "" };
    return { ...saved, cityId: seed.cityId, restaurantId: seed.restaurantId, mealType: "", lines: [] };
  });
  const [tried, setTried] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const today = todayISO();

  useEffect(() => {
    if (mode === "login") return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, mode]);

  useEffect(() => {
    if (mode === "order" && step <= 7) onStep?.(step);
  }, [mode, onStep, step]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setTried(false);
  }, [step]);

  useEffect(() => {
    if (draft.mealType && draft.pickupTime && !timeFitsMeal(draft.pickupTime, draft.mealType)) {
      setDraft((current) => ({ ...current, pickupTime: "" }));
    }
  }, [draft.mealType, draft.pickupTime]);

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  const city = getCity(draft.cityId);
  const restaurant = getRestaurant(draft.restaurantId);
  const menu = restaurant && draft.mealType ? restaurant.menu[draft.mealType] : [];
  const priced = draft.lines.flatMap((line) => {
    if (line.qty < 1) return [];
    const item = menu.find((entry) => entry.id === line.itemId);
    if (!item) return [];
    return [{ ...line, name: item.name, unitPrice: item.prices[line.tier] }];
  });
  const estimate = lineTotal(priced);
  const guests = Number(draft.attendees);
  // الفوتشر يُعرض فقط لعميل داخل حسابه ولديه فوتشر متاح. الاختيار هنا مجرد طلب؛ التحقق النهائي في المخزن.
  const myVouchers = store.currentUser ? availableVouchers(store.vouchers, store.currentUser.id) : [];
  const offeredVoucher = myVouchers.find((item) => item.id === draft.voucherId) ?? myVouchers[0] ?? null;
  const voucherApplied = Boolean(offeredVoucher && draft.voucherId === offeredVoucher.id);
  const voucherEligible = voucherApplied && estimate >= VOUCHER_MIN_ORDER_HALALAS / 100;

  function stepReady(index: number) {
    if (index === 0) return Boolean(draft.cityId);
    if (index === 1) return Boolean(draft.restaurantId);
    if (index === 2) return Boolean(draft.mealType);
    if (index === 3) return !countError(draft.attendees);
    if (index === 4) return priced.length > 0;
    if (index === 5) {
      return Boolean(draft.eventDate && draft.eventDate >= today && draft.mealType && timeFitsMeal(draft.pickupTime, draft.mealType));
    }
    if (index === 6) return !locationError(draft.pickupLocation);
    return true;
  }

  function goNext() {
    if (!stepReady(step)) {
      setTried(true);
      return;
    }
    setStep((current) => current + 1);
  }

  async function send(profile?: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    companyName: string;
    companyEmail: string;
    password: string;
    save: boolean;
  }) {
    if (sending) return "جارٍ إرسال الطلب...";
    setSending(true);
    setSendError("");
    try {
    if (profile) {
      if (profile.save) {
        localStorage.setItem(
          PROFILE_KEY,
          JSON.stringify({
            firstName: profile.firstName,
            lastName: profile.lastName,
            phone: profile.phone,
            email: profile.email,
            companyName: profile.companyName,
            companyEmail: profile.companyEmail,
          }),
        );
      }
      const error = await store.register({
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        email: profile.email,
        password: profile.password,
        companyEmail: profile.companyEmail,
        companyName: profile.companyName,
      });
      if (error) return error;
    }
    if (!city || !restaurant || !draft.mealType || priced.length === 0) return "يرجى مراجعة الطلب وإكمال البيانات الناقصة.";
    if (!timeFitsMeal(draft.pickupTime, draft.mealType)) return "وقت الاستلام يجب أن يكون داخل فترة الوجبة المختارة.";
    const order = await store.placeOrder({
      cityId: city.id,
      cityName: cityLabel(city, lang),
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      mealType: draft.mealType,
      items: priced.map((line) => ({
        key: `${line.itemId}:${line.tier}`,
        itemId: line.itemId,
        name: line.name,
        tier: line.tier,
        unitPrice: line.unitPrice,
        qty: line.qty,
      })),
      attendees: guests,
      eventDate: draft.eventDate,
      pickupTime: draft.pickupTime,
      pickupLocation: draft.pickupLocation.trim(),
      notes: draft.notes.trim(),
    }, { voucherId: !profile && voucherEligible && offeredVoucher ? offeredVoucher.id : null });
    localStorage.removeItem(DRAFT_KEY);
    onTrack(order.id);
    return null;
    } catch (error) {
      const message = error instanceof Error && error.message.includes("فوتشر") ? error.message : "تعذر إرسال الطلب حاليًا. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.";
      setSendError(message);
      return message;
    } finally {
      setSending(false);
    }
  }

  if (step === 9 || mode === "login") {
    return (
      <LoginPanel
        onBack={() => (mode === "login" ? onHome() : setStep(8))}
        onStart={mode === "login" ? onStart : () => setStep(0)}
        onHome={onLoggedIn}
        showForgot={forgot}
        setShowForgot={setForgot}
      />
    );
  }

  if (step === 8) {
    return (
      <AccountStep
        onBack={() => setStep(7)}
        onLogin={() => setStep(9)}
        onSubmit={send}
      />
    );
  }

  const titles = [
    ["أين ستقام مناسبتك؟", "اختر المدينة التي ترغب بإتمام الطلب فيها."],
    ["اختر المطعم المناسب", "اختر المطعم الذي ترغب بتنفيذ طلب مناسبتك من خلاله."],
    ["ما نوع الوجبة التي تحتاجها؟", "اختر الوجبة المناسبة لموعد مناسبتك."],
    ["كم عدد الأشخاص؟", "أدخل العدد التقريبي للحضور حتى نتمكن من احتساب قيمة الطلب."],
    ["اختر الوجبات المناسبة", "كل صنف مستقل بصورته وسعره. حدّد الكمية التي تريدها."],
    ["متى موعد المناسبة؟", "اختر التاريخ المتوقع لتنفيذ الطلب."],
    ["أين سيتم استلام الطلب؟", "أدخل موقع المناسبة أو الاستلام بالتفصيل لتسهيل عملية التسليم."],
    ["راجع طلبك قبل الإرسال", "تأكد من صحة التفاصيل قبل إرسال الطلب إلى المطعم."],
  ] as const;

  return (
    <section className={step === 4 ? "wizard is-meals" : "wizard"}>
      <BackButton onBack={() => (step === 0 ? onHome() : setStep((current) => current - 1))} />
      <p className="progress-label" id="step-progress-label">
        الخطوة {step + 1} من 9
      </p>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={9}
        aria-valuenow={step + 1}
        aria-labelledby="step-progress-label"
      >
        <div className="progress-fill" style={{ width: `${((step + 1) / 9) * 100}%` }} />
      </div>
      <h1>{titles[step][0]}</h1>
      <p className="lead">{titles[step][1]}</p>
      <div className="content">
        {step === 0 ? (
          <CityStep draft={draft} tried={tried} onPick={(cityId) => patch({ cityId, restaurantId: "", mealType: "", lines: [] })} />
        ) : null}
        {step === 1 ? (
          <RestaurantStep
            cityId={draft.cityId}
            selectedId={draft.restaurantId}
            onPick={(restaurantId) => patch({ restaurantId, mealType: "", lines: [] })}
            onChangeCity={() => setStep(0)}
          />
        ) : null}
        {step === 2 ? <MealStep value={draft.mealType} onPick={(mealType) => patch({ mealType, lines: [], pickupTime: "" })} /> : null}
        {step === 3 ? <GuestStep value={draft.attendees} tried={tried} onChange={(attendees) => patch({ attendees })} /> : null}
        {step === 4 && draft.mealType ? (
          <DishStep
            items={menu}
            lines={draft.lines}
            attendees={guests}
            tried={tried}
            estimate={estimate}
            onChange={(lines) => patch({ lines })}
          />
        ) : null}
        {step === 5 ? (
          <WhenStep
            date={draft.eventDate}
            time={draft.pickupTime}
            today={today}
            mealType={draft.mealType}
            tried={tried}
            onDate={(eventDate) => patch({ eventDate })}
            onTime={(pickupTime) => patch({ pickupTime })}
          />
        ) : null}
        {step === 6 ? (
          <PlaceStep
            place={draft.pickupLocation}
            notes={draft.notes}
            tried={tried}
            onPlace={(pickupLocation) => patch({ pickupLocation })}
            onNotes={(notes) => patch({ notes })}
          />
        ) : null}
        {step === 7 ? (
          <ReviewStep
            draft={draft}
            dishes={priced}
            estimate={estimate}
            onEdit={setStep}
            voucher={offeredVoucher}
            applied={voucherApplied}
            onVoucher={(voucherId) => patch({ voucherId: voucherId ?? "" })}
          />
        ) : null}
      </div>
      {step === 7 && sendError ? (
        <p className="err" role="alert">
          {sendError}
        </p>
      ) : null}
      <div className="wizard-actions is-stack">
        <button type="button" className="text-back" onClick={() => (step === 0 ? onHome() : setStep((current) => current - 1))}>
          رجوع
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className={stepReady(step) && !sending ? "btn primary" : "btn primary is-disabled"}
          aria-disabled={!stepReady(step) || sending}
          disabled={sending}
          onClick={() => {
            if (step === 7 && store.currentUser) {
              void send();
              return;
            }
            if (step === 7) {
              setStep(8);
              return;
            }
            goNext();
          }}
        >
          {sending ? "جارٍ إرسال الطلب..." : step === 7 && store.currentUser ? "تأكيد وإرسال الطلب" : step === 7 ? "متابعة" : "التالي"}
        </button>
      </div>
    </section>
  );
}
