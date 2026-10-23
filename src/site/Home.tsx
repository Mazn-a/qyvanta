import type { ReactNode } from "react";
import { getCity, useCatalog } from "../catalog";
import { restaurantPhoto } from "../data";
import { useLang } from "../i18n";

const faqs = [
  ["متى يتم تأكيد الطلب؟", "بعد إرسال الطلب، تتم مراجعته من المطعم وتظهر لك حالة الطلب حتى يتم التأكيد."],
  ["إلى أين تصل الفاتورة؟", "تُرسل الفاتورة النهائية إلى بريدك الإلكتروني الشخصي."],
  ["متى يتواصل المطعم؟", "يتم إتاحة رقم التواصل للمطعم عند حلول المرحلة المخصصة لتنسيق التسليم وفق آلية النظام."],
  ["ماذا يحدث إذا لم يوافق المطعم؟", "ستظهر حالة الطلب، ويمكنك بدء طلب جديد من مطعم آخر متاح."],
  ["هل أستطيع تعديل الطلب؟", "يمكن تعديل البيانات قبل إرسال الطلب وفق الخطوة الحالية، بينما التعديل بعد الإرسال يعتمد على حالة الطلب."],
];

export function HomePage({
  onOrder,
  onMore,
  onChoose,
  onRewards,
}: {
  onOrder: () => void;
  onMore: () => void;
  onChoose: (restaurantId: string) => void;
  onRewards: () => void;
}) {
  const photo = `${import.meta.env.BASE_URL}hospitality/buffet.jpg`;
  function aboutWifaq() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("why")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }
  return (
    <>
      <section className="hero-screen" id="home">
        <div className="hero-stage">
          <div className="hero-copy">
            <p className="hero-kicker">
              <span className="hero-gem" aria-hidden="true" />
              مرحبًا بك في قيفانتا
            </p>
            <h1>
              <span>نصنع يَوْمَك..</span>
              <span>ونُقرّب عالمَك</span>
            </h1>
            <p className="hero-lead">
              منصة تجمع بين حيوية الحركة والآفاق الممتدة، وتصلك بأفضل الوجبات بضغطة زر.
            </p>
          </div>
          <img className="hero-photo" src={photo} alt="مائدة ضيافة مجهزة لمناسبة" fetchPriority="high" />
          <div className="hero-actions">
            <button type="button" className="btn primary hero-order" onClick={onOrder}>
              ابدأ طلبك
            </button>
            <button type="button" className="hero-more" onClick={aboutWifaq}>
              تعرّف على قيفانتا
            </button>
          </div>
        </div>
      </section>
      <section className="section" id="restaurants">
        <div className="wrap">
          <div className="section-head">
            <h2>اختر المطعم المناسب لمناسبتك</h2>
            <p>استعرض المطاعم المتاحة في مدينتك واختر ما يناسب احتياجك.</p>
          </div>
        </div>
        <HouseRow onMore={onMore} onChoose={onChoose} />
      </section>

      <section className="section" id="journey">
        <div className="wrap surface-panel">
          <div className="section-head flow-head">
            <h2>رحلتك مع قيفانتا</h2>
            <p>تجربة منظمة تساعدك على إكمال طلبك خطوة بخطوة دون تعقيد.</p>
          </div>
          <ol className="flow">
            {flowSteps.map((step, index) => (
              <li key={step.label}>
                <div className="flow-step">
                  <span className="flow-icon">{step.icon}</span>
                  <span>{step.label}</span>
                </div>
                {index < flowSteps.length - 1 ? (
                  <span className="flow-arrow" aria-hidden="true">
                    <svg viewBox="0 0 28 12">
                      <path d="M26 6H4M9 1.5 3.5 6 9 10.5" />
                    </svg>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className="section rewards-section" id="rewards">
        <div className="wrap">
          <div className="rewards-promo">
            <div className="rewards-promo-badge" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="34" height="34">
                <path
                  d="M5 11a2 2 0 0 1 2-2h18a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V21a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path d="M13 9v14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2.5 2.5" />
              </svg>
              <span>5%</span>
            </div>
            <div className="rewards-promo-copy">
              <h2>طلباتك مع قيفانتا تكافئك!</h2>
              <p>
                مع كل طلب، تكسب مكافآت تعادل 5% من قيمة طلبك. اجمع 100 ريال من المكافآت واحصل على فوتشر بقيمة 100 ريال تستخدمه في طلباتك القادمة.
              </p>
              <button type="button" className="btn rewards-cta" onClick={onRewards}>
                اكتشف مكافآتي
              </button>
            </div>
          </div>
        </div>
      </section>
      <section className="section" id="why">
        <div className="wrap">
          <div className="section-head flow-head">
            <h2>عن قيفانتا</h2>
            <p>
              مرحبًا بك في قيفانتا (Qyvanta) — المنصة التي تجمع بين حيوية الحركة والآفاق الممتدة، لنقدّم لك تجربة حديثة، سريعة، ومترابطة تصلك بأفضل الوجبات بضغطة زر.
            </p>
          </div>
          <div className="why">
            {whyCards.map((card) => (
              <article className="why-card" key={card.label}>
                <span className="why-icon">{card.icon}</span>
                <p>{card.label}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section faq-section" id="faq">
        <div className="wrap narrow-copy surface-panel">
          <div className="section-head">
            <h2>الأسئلة الشائعة</h2>
          </div>
          <div className="faq">
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="wrap">
          <div className="ready">
            <h2>جاهز لطلب ضيافتك؟</h2>
            <p>ابدأ طلبك الآن، وأكمل الخطوات الأساسية قبل إرسال الطلب للمطعم.</p>
            <button type="button" className="btn primary" onClick={onOrder}>
              ابدأ طلبك
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const flowSteps: { label: string; icon: ReactNode }[] = [
  {
    label: "اختر المدينة والمطعم",
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="9" y="6" width="14" height="20" rx="2" {...stroke} />
        <path d="M13 6.5h6V10h-6zM12 15h8M12 19h5" {...stroke} />
      </svg>
    ),
  },
  {
    label: "اختر الوجبة والبكج",
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="7" y="8" width="18" height="16" rx="2" {...stroke} />
        <path d="M7 13h18M12 6.5v4M20 6.5v4" {...stroke} />
      </svg>
    ),
  },
  {
    label: "أدخل تفاصيل المناسبة",
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="8" {...stroke} />
        <path d="M16 12v4.5l3 2" {...stroke} />
      </svg>
    ),
  },
  {
    label: "راجع طلبك",
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M10 6h8l5 5v15H10z" {...stroke} />
        <path d="M18 6v5h5M13 16h7M13 20h5" {...stroke} />
      </svg>
    ),
  },
  {
    label: "أرسل الطلب وتابع حالته",
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="m16 7.5 2.1 4.8 5.2.5-4 3.4 1.2 5.1L16 18.8l-4.5 2.5 1.2-5.1-4-3.4 5.2-.5z" {...stroke} />
      </svg>
    ),
  },
];

const whyCards: { label: string; icon: ReactNode }[] = [
  {
    label: "مطاعم متاحة حسب مدينتك",
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 5.5 24.5 8.8v7c0 4.8-3.3 8.8-8.5 10.8-5.2-2-8.5-6-8.5-10.8v-7z" {...stroke} />
        <path d="m12.2 15.4 2.4 2.4 5.2-5.4" {...stroke} />
      </svg>
    ),
  },
  {
    label: "تجربة طلب بخطوات واضحة",
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="8" {...stroke} />
        <path d="M16 11.5V16l3 2" {...stroke} />
      </svg>
    ),
  },
  {
    label: "اختر المدينة المتاحة لمناسبتك",
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 26.5s7-6.4 7-12.2a7 7 0 1 0-14 0c0 5.8 7 12.2 7 12.2z" {...stroke} />
        <circle cx="16" cy="14.2" r="2.2" {...stroke} />
      </svg>
    ),
  },
  {
    label: "متابعة واضحة لحالة طلبك",
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M8.5 16.5a7.5 7.5 0 0 1 15 0" {...stroke} />
        <path d="M8.5 16.5v5.2a2 2 0 0 0 2 2h.8v-7.2h-.8a2 2 0 0 0-2 2zM23.5 16.5v5.2a2 2 0 0 1-2 2h-.8v-7.2h.8a2 2 0 0 1 2 2zM13.5 24.5h5" {...stroke} />
      </svg>
    ),
  },
];

function HouseCard({ id, onChoose }: { id: string; onChoose: () => void }) {
  const { lang } = useLang();
  const { restaurants } = useCatalog();
  const house = restaurants.find((item) => item.id === id);
  if (!house) return null;
  const city = getCity(house.cityId);
  return (
    <article className="house-card">
      <img src={restaurantPhoto(house.id)} alt="" loading="lazy" />
      <h3>{house.name}</h3>
      <p className="fine">{city ? (lang === "en" ? city.nameEn : city.name) : ""} · {house.specialty} من {house.district}.</p>
      <button type="button" className="btn primary" onClick={onChoose}>
        اختيار المطعم
      </button>
    </article>
  );
}

function HouseRow({ onMore, onChoose }: { onMore: () => void; onChoose: (id: string) => void }) {
  const { restaurants } = useCatalog();
  return (
    <div className="houses">
      <div className="wrap house-grid is-preview">
        {restaurants.slice(0, 3).map((house) => (
          <HouseCard key={house.id} id={house.id} onChoose={() => onChoose(house.id)} />
        ))}
      </div>
      <div className="wrap houses-more">
        <button type="button" className="houses-more-link" onClick={onMore}>
          <span>إظهار المزيد</span>
          <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function HousesPage({ onBack, onChoose }: { onBack: () => void; onChoose: (id: string) => void }) {
  const { restaurants } = useCatalog();
  return (
    <section className="section houses-page">
      <div className="wrap">
        <button type="button" className="text-back" onClick={onBack}>
          رجوع
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="section-head">
          <h1>اختر المطعم المناسب لمناسبتك</h1>
          <p>استعرض المطاعم المتاحة في مدينتك واختر ما يناسب احتياجك.</p>
        </div>
        <div className="house-grid is-all">
          {restaurants.map((house) => (
            <HouseCard key={house.id} id={house.id} onChoose={() => onChoose(house.id)} />
          ))}
        </div>
      </div>
    </section>
  );
}
