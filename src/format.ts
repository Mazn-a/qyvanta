export type CalendarKind = "gregory" | "islamic-umalqura";

const CALENDAR_KEY = "wifaq-calendar";

function uiLanguage() {
  if (typeof document !== "undefined" && document.documentElement.lang === "en") return "en";
  return "ar-SA";
}

function uiLocale() {
  return `${uiLanguage()}-u-nu-latn`;
}

export function readCalendar(): CalendarKind {
  try {
    return localStorage.getItem(CALENDAR_KEY) === "islamic-umalqura" ? "islamic-umalqura" : "gregory";
  } catch {
    return "gregory";
  }
}

export function writeCalendar(kind: CalendarKind) {
  localStorage.setItem(CALENDAR_KEY, kind);
}

export function arabicNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

export function riyal(value: number) {
  if (uiLanguage() === "en") return `SAR ${arabicNumber(value)}`;
  return `${arabicNumber(value)} ر.س`;
}

/** يعرض مبلغًا مخزّنًا بالهللة. يُظهر الكسور فقط عند وجودها. */
export function riyalFromHalalas(halalas: number) {
  const value = halalas / 100;
  const text = new Intl.NumberFormat("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  if (uiLanguage() === "en") return `SAR ${text}`;
  return `${text} ر.س`;
}

/** صياغة نصية للمبلغ داخل الجمل: «50 ريالًا»، «5 ريالات»، «100 ريال». */
export function riyalWords(halalas: number) {
  const value = halalas / 100;
  const text = new Intl.NumberFormat("en", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  if (uiLanguage() === "en") return `SAR ${text}`;
  const whole = Number.isInteger(value);
  const unit = whole && value >= 3 && value <= 10 ? "ريالات" : whole && value >= 11 && value <= 99 ? "ريالًا" : "ريال";
  return `${text} ${unit}`;
}

export function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(`${uiLanguage()}-u-ca-${readCalendar()}-nu-latn`, { year: "numeric", month: "long", day: "numeric" }).format(date);
}

export function toIso(value?: string | Date | null) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function minutesBetween(from?: string | Date | null, to?: string | Date | null) {
  const start = new Date(toIso(from)).getTime();
  const end = to ? new Date(toIso(to)).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(0, Math.round((end - start) / 60000));
}

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 1) return "أقل من دقيقة";
  if (minutes === 1) return "دقيقة واحدة";
  if (minutes === 2) return "دقيقتان";
  if (minutes < 60) return `${arabicNumber(minutes)} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourText = hours === 1 ? "ساعة" : hours === 2 ? "ساعتان" : `${arabicNumber(hours)} ساعة`;
  return rest ? `${hourText} و${formatDuration(rest)}` : hourText;
}

export function formatWhen(iso?: string | Date | null) {
  const date = new Date(toIso(iso));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(`${uiLanguage()}-u-ca-${readCalendar()}-nu-latn`, {
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function orderTiming(order: { createdAt?: string | Date; confirmedAt?: string | Date; rejectedAt?: string | Date; status: string }) {
  const decidedAt = order.confirmedAt || order.rejectedAt;
  const reply = decidedAt ? minutesBetween(order.createdAt, decidedAt) : minutesBetween(order.createdAt);
  return {
    orderedAt: formatWhen(order.createdAt),
    decidedAt: decidedAt ? formatWhen(decidedAt) : "",
    waitingLabel: formatDuration(minutesBetween(order.createdAt)),
    replyLabel: formatDuration(reply),
    pending: order.status === "pending_restaurant",
  };
}

export function lineTotal(items: { unitPrice: number; qty: number }[]) {
  return items.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}

export function todayISO(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatDate(isoDate: string, calendar: CalendarKind = readCalendar()) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat(`${uiLanguage()}-u-ca-${calendar}-nu-latn`, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function formatClock(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return "";
  const [hour, minute] = value.split(":").map(Number);
  if (hour === undefined || minute === undefined || hour > 23 || minute > 59) return value;
  const date = new Date(2000, 0, 1, hour, minute);
  return new Intl.DateTimeFormat(uiLocale(), { hour: "numeric", minute: "2-digit" }).format(date);
}

export function orderNo(id: string) {
  let n = 0;
  for (const char of id) n = (n * 33 + char.charCodeAt(0)) % 9000;
  return `QY-${1000 + n}`;
}
