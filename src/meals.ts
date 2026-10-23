import type { MealType } from "./types";

export const MEAL_WINDOWS: Record<MealType, { start: string; end: string }> = {
  breakfast: { start: "06:00", end: "11:00" },
  lunch: { start: "12:00", end: "16:00" },
  dinner: { start: "18:00", end: "23:30" },
};

const MEAL_WINDOW_COPY: Record<MealType, { ar: string; en: string; nameAr: string; nameEn: string }> = {
  breakfast: { ar: "من 6 صباحًا إلى 11 صباحًا", en: "from 6:00 AM to 11:00 AM", nameAr: "الفطور", nameEn: "breakfast" },
  lunch: { ar: "من 12 ظهرًا إلى 4 عصرًا", en: "from 12:00 PM to 4:00 PM", nameAr: "الغداء", nameEn: "lunch" },
  dinner: { ar: "من 6 مساءً إلى 11:30 مساءً", en: "from 6:00 PM to 11:30 PM", nameAr: "العشاء", nameEn: "dinner" },
};

export function minutesOfClock(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const hour = Number(value.slice(0, 2));
  const minute = Number(value.slice(3));
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function timeFitsMeal(time: string, meal: MealType) {
  const point = minutesOfClock(time);
  const start = minutesOfClock(MEAL_WINDOWS[meal].start);
  const end = minutesOfClock(MEAL_WINDOWS[meal].end);
  return point != null && start != null && end != null && point >= start && point <= end;
}

export function mealWindowHint(meal: MealType, lang: "ar" | "en") {
  const copy = MEAL_WINDOW_COPY[meal];
  if (lang === "en") return `Choose a ${copy.nameEn} time ${copy.en} only.`;
  return `اختر وقتًا داخل فترة ${copy.nameAr}: ${copy.ar} فقط.`;
}

export function mealWindowShort(meal: MealType, lang: "ar" | "en") {
  return lang === "en" ? MEAL_WINDOW_COPY[meal].en : MEAL_WINDOW_COPY[meal].ar;
}
