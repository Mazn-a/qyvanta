export function englishDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export function personNameError(value: string) {
  const name = value.trim();
  if (!name) return "يرجى كتابة الاسم باستخدام الأحرف فقط.";
  if (/[0-9٠-٩۰-۹]/.test(name)) return "يرجى إزالة الأرقام من الاسم.";
  if (!/^[\u0621-\u064Aa-zA-Z\s]+$/.test(name)) return "يرجى كتابة الاسم باستخدام الأحرف فقط.";
  return "";
}

export function normalizePhone(value: string) {
  return englishDigits(value).replace(/\D/g, "").slice(0, 10);
}

export function phoneError(value: string) {
  if (!/^05\d{8}$/.test(value)) return "يرجى إدخال رقم جوال صحيح مكوّن من 10 أرقام ويبدأ بـ 05.";
  return "";
}

export function normalizeEmail(value: string) {
  return value.replace(/\s/g, "").toLowerCase().slice(0, 254);
}

export function emailError(value: string) {
  if (value.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) {
    return "يرجى إدخال بريد إلكتروني صحيح، مثل example@email.com";
  }
  return "";
}

export function companyError(value: string) {
  const name = value.trim();
  if (name.length < 2 || name.length > 120 || !/^[\u0621-\u064Aa-zA-Z0-9\s.&'-]+$/.test(name)) {
    return "يرجى إدخال اسم شركة صالح.";
  }
  return "";
}

export function countError(value: string) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 5000) return "يرجى إدخال عدد صحيح بين 1 و5000.";
  return "";
}

export function locationError(value: string) {
  const text = value.trim();
  if (text.length < 3 || text.length > 200) return "يرجى إدخال موقع الاستلام بتفصيل يكفي للتسليم، وبحد أقصى 200 حرف.";
  return "";
}

export function passwordError(value: string) {
  if (value.length < 8) return "كلمة المرور يجب أن تكون 8 أحرف على الأقل.";
  if (value.length > 128) return "كلمة المرور أطول من الحد المسموح.";
  return "";
}
