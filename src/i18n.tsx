import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LANG_KEY, readMigrated } from "./storage";

export type Lang = "ar" | "en";

const copy = {
  ar: {
    skip: "تخطي إلى المحتوى",
    metaTitle: "قيفانتا — منصة طلبات المطاعم",
    brand: "قيفانتا",
    brandLatin: "Qyvanta",
    "nav.home": "الرئيسية",
    "nav.about": "عن قيفانتا",
    "nav.journey": "رحلة الطلب",
    "nav.rewards": "مكافآتي",
    "nav.faq": "الأسئلة الشائعة",
    "nav.menu": "القائمة",
    "nav.start": "ابدأ طلبك",
    "nav.login": "تسجيل الدخول",
    "nav.signup": "إنشاء حساب",
    "nav.account": "معلوماتي",
    "nav.orders": "طلباتي",
    "nav.logout": "تسجيل الخروج",
    "nav.lang": "English",
    "faq.eyebrow": "قبل أن تطلب",
    "faq.title": "الأسئلة الشائعة",
    "faq.1.q": "إلى أين تصل الفاتورة؟",
    "faq.1.a": "إلى بريدك الشخصي، لا إلى بريد الشركة.",
    "faq.2.q": "متى يتواصل المطعم؟",
    "faq.2.a": "يوم المناسبة، بعد أن يؤكد الطلب. رقمك لا يظهر له قبل ذلك.",
    "faq.3.q": "ماذا بعد التوصيل؟",
    "faq.3.a": "يرفع المطعم صورة الفاتورة وصورة الطلب، ثم تصلك الفاتورة النهائية وقائمة التقييم.",
    "footer.tag": "منصة طلبات المطاعم",
    "footer.note": "الفواتير على البريد الشخصي.",
    "footer.rights": "جميع الحقوق محفوظة.",
    "auth.show": "إظهار",
    "auth.hide": "إخفاء",
    "details.date": "تاريخ المناسبة",
    "details.datePh": "اختر تاريخ المناسبة",
    "details.time": "وقت استلام الطلب",
    "details.timePh": "اختر وقت الاستلام",
  },
  en: {
    skip: "Skip to main content",
    metaTitle: "Qyvanta — Restaurant orders",
    brand: "Qyvanta",
    brandLatin: "قيفانتا",
    "nav.home": "Home",
    "nav.about": "About Qyvanta",
    "nav.journey": "Order path",
    "nav.rewards": "My rewards",
    "nav.faq": "Questions",
    "nav.menu": "Menu",
    "nav.start": "Start order",
    "nav.login": "Log in",
    "nav.signup": "Create account",
    "nav.account": "My details",
    "nav.orders": "My orders",
    "nav.logout": "Log out",
    "nav.lang": "العربية",
    "faq.eyebrow": "Before you order",
    "faq.title": "Questions",
    "faq.1.q": "Where does the invoice go?",
    "faq.1.a": "To your personal email, not the company email.",
    "faq.2.q": "When does the restaurant call?",
    "faq.2.a": "On the event day, after they confirm. Your number stays hidden until then.",
    "faq.3.q": "What happens after delivery?",
    "faq.3.a": "The restaurant uploads the invoice and a photo of the order. You then receive the final invoice and a rating list.",
    "footer.tag": "Restaurant order platform",
    "footer.note": "Invoices go to the personal email.",
    "footer.rights": "All rights reserved.",
    "auth.show": "Show",
    "auth.hide": "Hide",
    "details.date": "Event date",
    "details.datePh": "Choose the event date",
    "details.time": "Pickup time",
    "details.timePh": "Choose the pickup time",
  },
} as const;

export type CopyKey = keyof typeof copy.ar;

interface LangApi {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: CopyKey) => string;
  dir: "rtl" | "ltr";
}

const Ctx = createContext<LangApi | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (readMigrated(LANG_KEY, "diyafa-lang") === "en") localStorage.setItem(LANG_KEY, "ar");
    return "ar";
  });

  const api = useMemo<LangApi>(() => {
    const dir = lang === "ar" ? "rtl" : "ltr";
    return {
      lang,
      dir,
      setLang: (next) => {
        localStorage.setItem(LANG_KEY, next);
        setLangState(next);
      },
      t: (key) => copy[lang][key],
    };
  }, [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = api.dir;
    document.title = api.t("metaTitle");
  }, [api, lang]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useLang() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Language missing");
  return value;
}
