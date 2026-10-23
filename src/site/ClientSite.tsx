import { cloneElement, forwardRef, isValidElement, useEffect, useId, useImperativeHandle, useRef, useState, type FormEvent, type ReactElement, type ReactNode, type RefObject } from "react";
import { BackButton, RequiredStar } from "../components";
import { getRestaurant } from "../catalog";
import { AdminSite } from "./Admin";
import { HomePage, HousesPage } from "./Home";
import { RestaurantSite } from "./Restaurant";
import { peekSessionKind } from "../store";
import { useLang } from "../i18n";
import { loadDraft, loadResume, reachedStep, saveResume } from "../order/draft";
import { companyError, emailError, normalizeEmail, normalizePhone, personNameError, phoneError } from "../order/validate";
import { orderStateLabel } from "../order/status";
import { OrderFlow, OrderStatus } from "../order/Wizard";
import { useStore } from "../store";
import { pingVisit } from "../visits";
import { RewardsPage } from "./Rewards";
import { ReportPage } from "./Report";

function staffDeskHere() {
  const host = window.location.hostname;
  return host === "127.0.0.1" || host === "localhost";
}

function staffPageFromHash(): "admin" | "restaurant" | null {
  if (!staffDeskHere()) return null;
  const key = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
  if (key === "admin") return "admin";
  if (key === "restaurant") return "restaurant";
  return null;
}

type BrandHandle = {
  enter: () => void;
  leave: () => void;
};

const BrandMark = forwardRef<BrandHandle, { size?: number }>(function BrandMark({ size = 34 }, ref) {
  const reduce = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)[0];
  const anims = useRef<Array<SVGAnimateElement | null>>([]);
  const hovering = useRef(false);
  const playing = useRef(false);
  const queued = useRef(false);
  const timer = useRef(0);

  function start() {
    if (reduce) return;
    playing.current = true;
    queued.current = false;
    anims.current.forEach((node) => node?.beginElement());
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      playing.current = false;
      if (queued.current && hovering.current) start();
    }, 900);
  }

  useImperativeHandle(ref, () => ({
    enter() {
      if (reduce) return;
      const cameFromOutside = !hovering.current;
      hovering.current = true;
      if (!cameFromOutside) return;
      if (playing.current) {
        queued.current = true;
        return;
      }
      start();
    },
    leave() {
      hovering.current = false;
      queued.current = false;
    },
  }));

  useEffect(() => {
    start();
    return () => {
      window.clearTimeout(timer.current);
      playing.current = false;
    };
  }, []);

  return (
    <svg className="mark" width={size} height={size} viewBox="4 0 56 56" aria-hidden="true">
      <MarkDot index={0} cx={16} cy={24} reduce={reduce} anims={anims} />
      <MarkDot index={1} cx={32} cy={16} gold reduce={reduce} anims={anims} />
      <MarkDot index={2} cx={48} cy={24} reduce={reduce} anims={anims} />
      <path d="M8 44h48" />
    </svg>
  );
});

function MarkDot({
  index,
  cx,
  cy,
  gold,
  reduce,
  anims,
}: {
  index: number;
  cx: number;
  cy: number;
  gold?: boolean;
  reduce: boolean;
  anims: RefObject<Array<SVGAnimateElement | null>>;
}) {
  if (reduce) return <circle className={gold ? "mark-gold" : undefined} cx={cx} cy={cy} r="6" />;
  return (
    <circle className={gold ? "mark-gold" : undefined} cx={cx} cy={cy} r="6">
      <animate
        ref={(node) => {
          anims.current[index] = node as SVGAnimateElement | null;
        }}
        attributeName="cy"
        begin="indefinite"
        values={`${cy};7;7;${cy}`}
        keyTimes="0;0.38;0.52;1"
        dur="0.9s"
        repeatCount="1"
        fill="freeze"
        calcMode="spline"
        keySplines="0.45 0.05 0.2 1;0.2 0.2 0.8 0.8;0.16 0.84 0.2 1"
      />
    </circle>
  );
}

export function ClientSite() {
  const { t, lang } = useLang();
  const { currentUser, orders, vouchers, apiDown, logout } = useStore();
  const orderCount = currentUser ? orders.filter((order) => order.userId === currentUser.id).length : 0;
  const freshVouchers = currentUser
    ? vouchers.filter((voucher) => voucher.userId === currentUser.id && voucher.status === "available").slice(0, 5)
    : [];
  type Page = "marketing" | "houses" | "order" | "login" | "track" | "orders" | "profile" | "legal" | "admin" | "rewards" | "restaurant";
  type LegalKey = "privacy" | "terms" | "cancel" | "contact" | "report";
  const [page, setPage] = useState<Page>(() => staffPageFromHash() ?? "marketing");
  const [legal, setLegal] = useState<LegalKey>("privacy");
  const [seed, setSeed] = useState<{ cityId: string; restaurantId: string } | null>(null);
  const historyRef = useRef<Page[]>([]);
  /** وجهة يُرجع إليها بعد تسجيل الدخول (مثل صفحة المكافآت). */
  const afterLoginRef = useRef<Page | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [resumeStep, setResumeStep] = useState<number | null>(null);
  const [orderStep, setOrderStep] = useState(0);
  const emailRef = useRef<string | null>(null);
  emailRef.current = currentUser ? normalizeEmail(currentUser.email) : null;

  function rememberPlace(place: { page: "order" | "track" | "orders"; step: number; trackId: string | null }) {
    const email = emailRef.current;
    if (email) saveResume(email, place);
  }
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const headerMark = useRef<BrandHandle>(null);
  const footerMark = useRef<BrandHandle>(null);

  useEffect(() => {
    pingVisit(page, page === "order" ? orderStep : 0);
  }, [page, orderStep]);

  useEffect(() => {
    function onHash() {
      const staff = staffPageFromHash();
      if (staff) setPage(staff);
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function openPage(next: Page, replace = false) {
    if ((next === "admin" || next === "restaurant") && !staffDeskHere()) return;
    if (!replace && page !== next) historyRef.current.push(page);
    setPage(next);
    setMenuOpen(false);
    setAccountOpen(false);
    if (next === "admin" || next === "restaurant") {
      if (window.location.hash !== `#${next}`) window.location.hash = next;
    } else if (window.location.hash === "#admin" || window.location.hash === "#restaurant") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    window.scrollTo(0, 0);
  }

  function goBack() {
    const prev = historyRef.current.pop() ?? "marketing";
    setPage(prev);
    setMenuOpen(false);
    setAccountOpen(false);
    window.scrollTo(0, 0);
  }

  function goHome() {
    historyRef.current = [];
    setPage("marketing");
    setMenuOpen(false);
    setAccountOpen(false);
    if (window.location.hash === "#admin" || window.location.hash === "#restaurant") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    window.scrollTo(0, 0);
  }

  function goSection(id: string) {
    setMenuOpen(false);
    if (page !== "marketing") {
      goHome();
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 40);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  function startOrder() {
    setSeed(null);
    setTrackId(null);
    setResumeStep(null);
    openPage("order");
  }

  function openRewards() {
    if (currentUser) {
      openPage("rewards");
      return;
    }
    afterLoginRef.current = "rewards";
    openPage("login");
  }

  function resumeAfterLogin(email: string) {
    const kind = peekSessionKind();
    if (kind === "admin" || kind === "restaurant") {
      if (!staffDeskHere()) return;
      openPage(kind === "admin" ? "admin" : "restaurant", true);
      return;
    }
    const target = afterLoginRef.current ?? (page === "rewards" ? "rewards" : null);
    afterLoginRef.current = null;
    if (target) {
      openPage(target, true);
      return;
    }
    const place = loadResume(normalizeEmail(email));
    if (place?.page === "track" && place.trackId) {
      const owns = orders.some((order) => order.id === place.trackId && normalizeEmail(order.personalEmail) === normalizeEmail(email));
      if (owns) {
        setTrackId(place.trackId);
        setResumeStep(null);
        openPage("track", true);
        return;
      }
    }
    if (place?.page === "order") {
      const draft = loadDraft();
      const step = Math.min(place.step, reachedStep(draft));
      const started = Boolean(draft.cityId || draft.restaurantId || draft.mealType || draft.attendees || draft.eventDate || draft.pickupLocation.trim() || draft.lines.some((line) => line.qty > 0));
      if (started || step > 0) {
        setSeed(null);
        setTrackId(null);
        setResumeStep(step);
        openPage("order", true);
        return;
      }
    }
    setResumeStep(null);
    openPage("orders", true);
  }

  function startFromRestaurant(id: string) {
    const restaurant = getRestaurant(id);
    if (!restaurant) return;
    setSeed({ cityId: restaurant.cityId, restaurantId: id });
    setTrackId(null);
    openPage("order");
  }

  function openLegal(key: LegalKey) {
    setLegal(key);
    openPage("legal");
  }

  if (page === "admin") {
    return (
      <div className="site">
        <AdminSite onClient={goHome} />
      </div>
    );
  }

  if (page === "restaurant") {
    return (
      <div className="site">
        <RestaurantSite onClient={goHome} />
      </div>
    );
  }

  return (
    <div className="site">
      <a className="skip" href="#main">
        {t("skip")}
      </a>
      <header className="site-header">
        <div className={menuOpen ? "wrap nav is-open" : "wrap nav"}>
          <a
            className="wordmark"
            href="#main"
            onClick={(event) => {
              event.preventDefault();
              goHome();
            }}
            onMouseEnter={() => headerMark.current?.enter()}
            onMouseLeave={() => headerMark.current?.leave()}
          >
            <span className="wordmark-lockup">
              <BrandMark ref={headerMark} size={34} />
              <span>
                {t("brand")}
                <span className="wordmark-latin" lang={lang === "ar" ? "en" : "ar"} dir={lang === "ar" ? "ltr" : "rtl"}>
                  {lang === "ar" ? t("brandLatin") : "قيفانتا"}
                </span>
              </span>
            </span>
          </a>
          <button
            className={orderCount > 0 ? "menu-btn has-alert" : "menu-btn"}
            type="button"
            aria-expanded={menuOpen}
            aria-label={orderCount > 0 ? `القائمة، عدد الطلبات ${orderCount}` : t("nav.menu")}
            onClick={() => {
              setMenuOpen((open) => !open);
              setAccountOpen(false);
            }}
          >
            ☰
            {orderCount > 0 ? <span className="menu-count">{orderCount}</span> : null}
          </button>
          <nav className="nav-links" aria-label={t("nav.menu")}>
            <button type="button" onClick={goHome}>
              {t("nav.home")}
            </button>
            <button type="button" onClick={() => goSection("why")}>
              {t("nav.about")}
            </button>
            {currentUser ? (
              <button type="button" onClick={openRewards}>
                {t("nav.rewards")}
              </button>
            ) : (
              <button type="button" onClick={() => goSection("journey")}>
                {t("nav.journey")}
              </button>
            )}
            <button type="button" onClick={() => goSection("faq")}>
              {t("nav.faq")}
            </button>
            <button type="button" className="nav-link-cta" onClick={startOrder}>
              {t("nav.start")}
            </button>
          </nav>
          <div className="nav-actions">
            {currentUser ? null : (
              <>
                <button type="button" className="nav-cta" onClick={startOrder}>
                  {t("nav.start")}
                </button>
                <button type="button" className="nav-login" onClick={() => openPage("login")}>
                  {t("nav.login")}
                </button>
              </>
            )}
            <div className={currentUser ? "nav-avatar-wrap" : "nav-avatar-wrap is-guest"}>
              <button
                type="button"
                className={currentUser ? "nav-avatar is-in" : "nav-avatar"}
                aria-expanded={accountOpen}
                aria-label={currentUser ? `${t("nav.account")}، ${currentUser.firstName}` : t("nav.login")}
                onClick={() => {
                  setMenuOpen(false);
                  setAccountOpen((open) => !open);
                }}
              >
                {currentUser ? currentUser.firstName.trim().charAt(0) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M5.5 19.2c1.2-3.2 3.6-4.8 6.5-4.8s5.3 1.6 6.5 4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                )}
                {currentUser && freshVouchers.length > 0 ? <span className="menu-count">1</span> : null}
              </button>
              {accountOpen ? (
                <>
                  <button type="button" className="account-backdrop" aria-label="إغلاق" onClick={() => setAccountOpen(false)} />
                  <div className={currentUser ? "account-menu is-user" : "account-menu"}>
                    {currentUser && freshVouchers.length > 0 ? (
                      <div className="account-note">
                        <strong>تنبيه جديد</strong>
                        <p>آخر الفوتشرات وصلت، وهي الخمسة. تلاقيها في مكافآتي.</p>
                        <button
                          type="button"
                          className="account-note-go"
                          onClick={() => {
                            setAccountOpen(false);
                            openRewards();
                          }}
                        >
                          افتح المكافآت
                        </button>
                      </div>
                    ) : null}
                    {currentUser ? (
                      <div className="account-card">
                        <strong>{`${currentUser.firstName} ${currentUser.lastName}`.trim()}</strong>
                        <span dir="ltr">{currentUser.phone}</span>
                        <span dir="ltr">{currentUser.email}</span>
                      </div>
                    ) : null}
                    {currentUser ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountOpen(false);
                            openPage("profile");
                          }}
                        >
                          {t("nav.account")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountOpen(false);
                            rememberPlace({ page: "orders", step: 0, trackId: null });
                            openPage("orders");
                          }}
                        >
                          {t("nav.orders")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountOpen(false);
                            openRewards();
                          }}
                        >
                          {t("nav.rewards")}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountOpen(false);
                            openPage("login");
                          }}
                        >
                          {t("nav.login")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountOpen(false);
                            startOrder();
                          }}
                        >
                          {t("nav.signup")}
                        </button>
                      </>
                    )}
                    <button type="button" className="account-lang" disabled>
                      {t("nav.lang")}
                    </button>
                    {currentUser ? (
                      <button
                        type="button"
                        className="account-logout"
                        onClick={() => {
                          setAccountOpen(false);
                          logout();
                          goHome();
                        }}
                      >
                        {t("nav.logout")}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {apiDown ? (
        <p className="reward-msg" style={{ margin: "12px auto", width: "min(720px, calc(100% - 32px))" }}>
          تعذر حفظ الطلبات الآن. أعد تشغيل الموقع من ملف التشغيل ثم حدّث الصفحة.
        </p>
      ) : null}
      <main id="main">
        {page === "marketing" ? (
          <HomePage onOrder={startOrder} onMore={() => openPage("houses")} onChoose={startFromRestaurant} onRewards={openRewards} />
        ) : page === "houses" ? (
          <HousesPage onBack={goBack} onChoose={startFromRestaurant} />
        ) : page === "legal" ? (
          legal === "report" ? <ReportPage onBack={goBack} /> : <LegalPage kind={legal} onBack={goBack} />
        ) : page === "profile" ? (
          <ProfilePage
            onBack={goBack}
            onLogout={goHome}
            onRewards={() => openPage("rewards")}
            onOrders={() => {
              rememberPlace({ page: "orders", step: 0, trackId: null });
              openPage("orders");
            }}
          />
        ) : page === "rewards" && currentUser ? (
          <RewardsPage onBack={goBack} onOrder={startOrder} />
        ) : page === "orders" ? (
          <OrdersPage
            onBack={goBack}
            onOpen={(id) => {
              setTrackId(id);
              rememberPlace({ page: "track", step: 0, trackId: id });
              openPage("track");
            }}
            onOrder={startOrder}
          />
        ) : page === "track" && trackId ? (
          <OrderStatus id={trackId} onBack={goBack} onHome={goHome} onRewards={() => openPage("rewards")} />
        ) : (
          <OrderFlow
            key={page}
            seed={seed}
            resumeStep={page === "order" ? resumeStep : null}
            mode={page === "login" || page === "rewards" ? "login" : "order"}
            onHome={goBack}
            onStart={startOrder}
            onStep={(step) => {
              setOrderStep(step);
              rememberPlace({ page: "order", step, trackId: null });
            }}
            onLoggedIn={resumeAfterLogin}
            onTrack={(id) => {
              setTrackId(id);
              rememberPlace({ page: "track", step: 0, trackId: id });
              openPage("track", true);
            }}
          />
        )}
      </main>

      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <a
              className="wordmark"
              href="#main"
              onClick={(event) => {
                event.preventDefault();
                goHome();
              }}
              onMouseEnter={() => footerMark.current?.enter()}
              onMouseLeave={() => footerMark.current?.leave()}
            >
              <span className="wordmark-lockup">
                <BrandMark ref={footerMark} size={40} />
                <span>
                  قيفانتا
                  <span className="wordmark-latin" lang="en" dir="ltr">
                    Qyvanta
                  </span>
                </span>
              </span>
            </a>
            <p>منصة طلبات المطاعم للمناسبات والفعاليات.</p>
          </div>
          <nav className="footer-col" aria-label="صفحات الموقع">
            <h2>الموقع</h2>
            <button type="button" onClick={goHome}>الرئيسية</button>
            <button type="button" onClick={() => goSection("why")}>عن قيفانتا</button>
            <button type="button" onClick={() => goSection("journey")}>رحلة الطلب</button>
            <button type="button" onClick={() => goSection("faq")}>الأسئلة الشائعة</button>
          </nav>
          <nav className="footer-col" aria-label="معلومات">
            <h2>معلومات</h2>
            <button type="button" onClick={() => openLegal("contact")}>تواصل معنا</button>
            <button type="button" onClick={() => openLegal("privacy")}>سياسة الخصوصية</button>
            <button type="button" onClick={() => openLegal("terms")}>الشروط والأحكام</button>
            <button type="button" onClick={() => openLegal("cancel")}>الإلغاء والاسترجاع</button>
            <button type="button" onClick={() => openLegal("report")}>الإبلاغ عن مشكلة</button>
          </nav>
          {staffDeskHere() ? (
            <nav className="footer-col" aria-label="العمل">
              <h2>العمل</h2>
              <button type="button" onClick={() => openPage("admin")}>لوحة الإدارة</button>
              <button type="button" onClick={() => openPage("restaurant")}>لوحة المطعم</button>
            </nav>
          ) : null}
        </div>
      </footer>
    </div>
  );
}


function ProfilePage({
  onBack,
  onLogout,
  onRewards,
  onOrders,
}: {
  onBack: () => void;
  onLogout: () => void;
  onRewards: () => void;
  onOrders: () => void;
}) {
  const { currentUser, logout, updateProfile } = useStore();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [values, setValues] = useState({
    firstName: currentUser?.firstName ?? "",
    lastName: currentUser?.lastName ?? "",
    phone: currentUser?.phone ?? "",
    email: currentUser?.email ?? "",
    companyEmail: currentUser?.companyEmail ?? "",
    companyName: currentUser?.companyName ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  if (!currentUser) return null;
  const user = currentUser;

  function openEdit() {
    setValues({
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      email: user.email,
      companyEmail: user.companyEmail,
      companyName: user.companyName,
    });
    setErrors({});
    setFormError("");
    setEditing(true);
  }

  function setField(key: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
    setFormError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const next = {
      firstName: personNameError(values.firstName),
      lastName: personNameError(values.lastName),
      phone: phoneError(values.phone),
      email: emailError(values.email),
      companyEmail: emailError(values.companyEmail),
      companyName: companyError(values.companyName),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const error = await updateProfile(values);
    if (error) {
      setFormError(error);
      return;
    }
    setEditing(false);
  }

  const rows: [string, string, boolean][] = [
    ["الاسم", `${currentUser.firstName} ${currentUser.lastName}`.trim(), false],
    ["الجوال", currentUser.phone, true],
    ["البريد الشخصي", currentUser.email, true],
    ["بريد الشركة", currentUser.companyEmail, true],
    ["الشركة", currentUser.companyName, false],
  ];

  return (
    <section className="wizard">
      <div className="profile-top">
        <BackButton onBack={onBack} />
        {editing ? (
          <button type="button" className="profile-edit" onClick={() => setEditing(false)}>
            إلغاء
          </button>
        ) : (
          <button type="button" className="profile-edit" onClick={openEdit}>
            تعديل البيانات
          </button>
        )}
      </div>
      <h1>معلوماتي</h1>
      <p className="lead">{editing ? "عدّل بيانات حسابك ثم احفظها." : "هذه البيانات التي سجّلت بها حسابك."}</p>
      {editing ? (
        <form className="stack" noValidate onSubmit={save}>
          <ProfileField label="الاسم الأول" error={errors.firstName}>
            <input autoComplete="given-name" value={values.firstName} onChange={(event) => setField("firstName", event.target.value)} />
          </ProfileField>
          <ProfileField label="اسم العائلة" error={errors.lastName}>
            <input autoComplete="family-name" value={values.lastName} onChange={(event) => setField("lastName", event.target.value)} />
          </ProfileField>
          <ProfileField label="الجوال" error={errors.phone}>
            <input
              className="ltr"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              value={values.phone}
              onChange={(event) => setField("phone", normalizePhone(event.target.value))}
            />
          </ProfileField>
          <ProfileField label="البريد الشخصي" error={errors.email}>
            <input
              className="ltr"
              dir="ltr"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={values.email}
              onChange={(event) => setField("email", normalizeEmail(event.target.value))}
            />
          </ProfileField>
          <ProfileField label="بريد الشركة" error={errors.companyEmail}>
            <input
              className="ltr"
              dir="ltr"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={values.companyEmail}
              onChange={(event) => setField("companyEmail", normalizeEmail(event.target.value))}
            />
          </ProfileField>
          <ProfileField label="الشركة" error={errors.companyName}>
            <input autoComplete="organization" value={values.companyName} onChange={(event) => setField("companyName", event.target.value)} />
          </ProfileField>
          {formError ? <p className="err">{formError}</p> : null}
          <button className="btn primary block" type="submit">
            حفظ التعديل
          </button>
        </form>
      ) : (
        <>
          <div className="stack">
            {rows.map(([label, value, latin]) => (
              <div key={label} className="soft-card profile-row">
                <span>{label}</span>
                <strong dir={latin ? "ltr" : undefined}>{value || "—"}</strong>
              </div>
            ))}
            <button type="button" className="soft-card profile-row profile-link" onClick={onOrders}>
              <span>الطلبات</span>
              <strong>طلباتي ←</strong>
            </button>
            <button type="button" className="soft-card profile-row profile-link" onClick={onRewards}>
              <span>المكافآت</span>
              <strong>مكافآتي وفوتشراتي ←</strong>
            </button>
          </div>
          <button className="profile-logout" type="button" onClick={() => setConfirming(true)}>
            تسجيل الخروج
          </button>
        </>
      )}
      {confirming ? (
        <div className="dialog-back" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title">
            <h2 id="logout-title">هل تريد تسجيل الخروج؟</h2>
            <p>ستبقى طلباتك محفوظة على هذا الجهاز. عند الدخول مرة أخرى نرجّعك إلى الخطوة أو الطلب الذي توقفت عنده.</p>
            <div className="dialog-actions">
              <button type="button" className="btn ghost" onClick={() => setConfirming(false)}>
                البقاء
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  logout();
                  onLogout();
                }}
              >
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProfileField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  const id = useId();
  const errorId = `${id}-error`;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>, {
        id,
        "aria-invalid": Boolean(error) || undefined,
        "aria-describedby": error ? errorId : undefined,
      })
    : children;
  return (
    <div className={error ? "field invalid" : "field"}>
      <label htmlFor={id}>
        {label}
        <RequiredStar />
      </label>
      {control}
      {error ? (
        <em id={errorId} className="err">
          {error}
        </em>
      ) : null}
    </div>
  );
}

function OrdersPage({ onBack, onOpen, onOrder }: { onBack: () => void; onOpen: (id: string) => void; onOrder: () => void }) {
  const { orders, currentUser, requestCancel } = useStore();
  const [cancelId, setCancelId] = useState<string | null>(null);
  const mine = currentUser ? orders.filter((order) => order.userId === currentUser.id) : [];
  return (
    <section className="wizard">
      <BackButton onBack={onBack} />
      <h1>طلباتي</h1>
      <p className="lead">حالة كل طلب ظاهرة هنا قبل فتح التفاصيل.</p>
      {mine.length === 0 ? (
        <>
          <p>لا توجد طلبات بعد.</p>
          <button className="btn primary orders-start" type="button" onClick={onOrder}>
            ابدأ طلبك
          </button>
        </>
      ) : (
        <div className="stack">
          {mine.map((order) => {
            const canCancel = !order.cancelRequested && (order.status === "pending_restaurant" || order.status === "confirmed");
            return (
              <article key={order.id} className="soft-card order-card">
                <button type="button" className="order-open" onClick={() => onOpen(order.id)}>
                  <strong>{order.restaurantName}</strong>
                  <span className={`order-state is-${order.status}`}>{orderStateLabel(order.status)}</span>
                </button>
                {order.cancelRequested ? <p className="fine">تم إرسال طلب الإلغاء</p> : null}
                {canCancel ? (
                  <button type="button" className="btn ghost order-cancel" onClick={() => setCancelId(order.id)}>
                    طلب إلغاء الطلب
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
      {cancelId ? (
        <CancelDialog
          onClose={() => setCancelId(null)}
          onConfirm={() => {
            void requestCancel(cancelId);
            setCancelId(null);
          }}
        />
      ) : null}
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

function LegalPage({ kind, onBack }: { kind: "privacy" | "terms" | "cancel" | "contact"; onBack: () => void }) {
  const page = legalPages[kind];
  return (
    <section className="wizard">
      <BackButton onBack={onBack} />
      <h1>{page.title}</h1>
      <div className="legal-copy">
        {page.blocks.map((block) => (
          <article key={block.heading}>
            <h2>{block.heading}</h2>
            {block.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}

const legalPages = {
  privacy: {
    title: "سياسة الخصوصية",
    blocks: [
      {
        heading: "التزامنا",
        body: [
          "تلتزم قيفانتا بحماية بياناتك الشخصية عند استخدام المنصة. لا نجمع من بياناتك إلا ما يلزم لإتمام طلب الضيافة ومتابعته، ولا نستخدمها لغرض لا يتصل بهذه الخدمة إلا بموافقتك.",
        ],
      },
      {
        heading: "البيانات التي نجمعها",
        body: [
          "بيانات الهوية والتواصل: الاسم، ورقم الجوال، والبريد الإلكتروني الشخصي، واسم الجهة وبريدها إن أدخلتهما.",
          "بيانات الطلب: المدينة، والمطعم، ونوع الوجبة، والكميات، وعدد الحضور، وموعد المناسبة، وموقع الاستلام، والملاحظات إن كتبتها.",
          "كلمة المرور لا تُعرض في صفحات الطلب، وتُحفظ بصيغة غير قابلة للقراءة. عدد الحضور مستقل عن كمية الوجبات، ويُحفظ كما تدخله.",
        ],
      },
      {
        heading: "كيف نستخدمها",
        body: [
          "نعالج طلبك ونرسله إلى المطعم المتاح في مدينتك، ونظهر حالته، ونتواصل معك عند الحاجة. تُرسل الفاتورة النهائية إلى بريدك الإلكتروني الشخصي فقط. اسم الجهة وبريدها يوضحان مناسبة الطلب، ولا يحلّان محل بريدك الشخصي.",
          "رسائل العروض اختيارية، ولا يُشترط قبولها لإرسال الطلب أو إنشاء الحساب.",
        ],
      },
      {
        heading: "المشاركة والإفصاح",
        body: [
          "لا نبيع بياناتك، ولا نشاركها مع أي طرف لغرض تسويقي. يطّلع المطعم على بيانات الطلب اللازمة لتنفيذه. رقم الجوال لا يُعرض للمطعم أثناء انتظار التأكيد أو التجهيز، ويُتاح فقط عند مرحلة تنسيق التسليم.",
          "يمكنك مراجعة بياناتك وتعديلها من صفحة معلوماتي، ومتابعة تفاصيل طلبك من طلباتي.",
        ],
      },
    ],
  },
  terms: {
    title: "الشروط والأحكام",
    blocks: [
      {
        heading: "قبول الشروط",
        body: [
          "باستخدامك منصة قيفانتا فإنك توافق على هذه الشروط. قيفانتا منصة لطلب وجبات المناسبات والفعاليات من المطاعم المتاحة في المدن المعروضة على الموقع.",
        ],
      },
      {
        heading: "نطاق الخدمة",
        body: [
          "يُختار المطعم بعد تحديد مدينة متاحة. لا يمكن إرسال طلب لمدينة غير مفعّلة، ولا اختيار مطعم قبل تحديد المدينة. موعد الاستلام يجب أن يقع ضمن وقت الوجبة التي تختارها: فطور أو غداء أو عشاء.",
        ],
      },
      {
        heading: "إنشاء الطلب",
        body: [
          "قبل الإرسال تراجع المدينة والمطعم ونوع الوجبة والكميات وموعد المناسبة وموقع الاستلام. كمية كل صنف هي عدد الوجبات المطلوبة، ولا تُستنتج من عدد الحضور.",
          "المبلغ الظاهر قبل رد المطعم تقديرٌ غير ملزم. لا يُعد الطلب مؤكدًا إلا بعد قبول المطعم وظهور حالة «تم تأكيد الطلب».",
        ],
      },
      {
        heading: "بعد الإرسال",
        body: [
          "تتابع حالة الطلب من طلباتي. إذا تعذر على المطعم القبول تظهر الحالة، ويمكنك بدء طلب جديد من مطعم آخر متاح. أي تعديل بعد الإرسال يعتمد على حالة الطلب الظاهرة لك.",
          "يُنشأ الحساب لمتابعة الطلبات. الفاتورة النهائية، بعد التسليم، تُرسل إلى بريدك الإلكتروني الشخصي.",
        ],
      },
    ],
  },
  cancel: {
    title: "الإلغاء والاسترجاع",
    blocks: [
      {
        heading: "طلب الإلغاء",
        body: [
          "يجوز طلب إلغاء الطلب وهو بانتظار تأكيد المطعم، أو بعد تأكيده وقبل التسليم. يخضع الطلب للمراجعة، وإرساله لا يعني اكتمال الإلغاء حتى تتغير حالة الطلب.",
          "لا يُقبل طلب إلغاء جديد بعد التسليم، ولا إذا تعذر على المطعم تأكيد الطلب، ولا إذا كان طلب إلغاء سابقًا قد أُرسل لنفس الطلب.",
        ],
      },
      {
        heading: "بعد التسليم",
        body: [
          "الوجبات تُجهَّز حسب موعد المناسبة، ولذلك لا تُعامل بعد التسليم كسلعة قابلة للإرجاع. إذا وصل الطلب ناقصًا أو مخالفًا لما تم تأكيده، أبلغ عن ذلك من صفحة الإبلاغ عن مشكلة مع ذكر رقم الطلب.",
          "لا يُحتسب مبلغ استرجاع أو مدة إرجاع عامة خارج حالة الطلب الظاهرة لك.",
        ],
      },
      {
        heading: "الفاتورة",
        body: [
          "تُرسل الفاتورة النهائية إلى بريدك الإلكتروني الشخصي بعد التسليم. إذا تعذر تأكيد الطلب فلا تُصدر له فاتورة نهائية.",
        ],
      },
    ],
  },
  contact: {
    title: "تواصل معنا",
    blocks: [
      {
        heading: "بخصوص طلب قائم",
        body: [
          "للتواصل بشأن طلب أرسلته، راسلنا من البريد الإلكتروني الشخصي المسجّل في حسابك، واذكر رقم الطلب كما يظهر في طلباتي، مع وصف موجز للمسألة.",
        ],
      },
      {
        heading: "بيانات المنشأة",
        body: [
          "رقم السجل التجاري والعنوان الوطني ورقم التواصل الرسمي تُنشر في هذه الصفحة عند اكتمال اعتماد النشاط. وحتى ذلك الحين يُعتمد التواصل عبر البريد المسجّل في الحساب.",
        ],
      },
    ],
  },
} as const;
