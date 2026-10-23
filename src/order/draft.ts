import { timeFitsMeal } from "../meals";
import type { MealType, Tier } from "../types";
import { countError, locationError } from "./validate";

export const DRAFT_KEY = "wifaq-order-draft-v1";
export const PROFILE_KEY = "wifaq-profile-v1";
const RESUME_KEY = "wifaq-resume-v1";

export interface DishLine {
  itemId: string;
  tier: Tier;
  qty: number;
}

export interface Draft {
  cityId: string;
  restaurantId: string;
  mealType: MealType | "";
  lines: DishLine[];
  attendees: string;
  eventDate: string;
  pickupTime: string;
  pickupLocation: string;
  notes: string;
  /** الفوتشر الذي اختار العميل تطبيقه في المراجعة (يُتحقق منه في المخزن عند الإرسال). */
  voucherId: string;
}

export function emptyDraft(): Draft {
  return {
    cityId: "",
    restaurantId: "",
    mealType: "",
    lines: [],
    attendees: "",
    eventDate: "",
    pickupTime: "",
    pickupLocation: "",
    notes: "",
    voucherId: "",
  };
}

export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return emptyDraft();
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return { ...emptyDraft(), ...parsed, lines: Array.isArray(parsed.lines) ? parsed.lines : [] };
  } catch {
    return emptyDraft();
  }
}

export type ResumePlace = {
  page: "order" | "track" | "orders";
  step: number;
  trackId: string | null;
};

export function reachedStep(draft: Draft) {
  if (!draft.cityId) return 0;
  if (!draft.restaurantId) return 1;
  if (!draft.mealType) return 2;
  if (countError(draft.attendees)) return 3;
  if (!draft.lines.some((line) => line.qty > 0)) return 4;
  if (!draft.eventDate || !draft.mealType || !timeFitsMeal(draft.pickupTime, draft.mealType)) return 5;
  if (locationError(draft.pickupLocation)) return 6;
  return 7;
}

export function saveResume(email: string, place: ResumePlace) {
  try {
    const all = readResumeMap();
    all[email] = place;
    localStorage.setItem(RESUME_KEY, JSON.stringify(all));
  } catch {
    /* يبقى التقدّم في المسودة إن تعذر حفظ موضع الرجوع */
  }
}

export function loadResume(email: string): ResumePlace | null {
  const place = readResumeMap()[email];
  if (!place) return null;
  if (place.page !== "order" && place.page !== "track" && place.page !== "orders") return null;
  const step = Number(place.step);
  return {
    page: place.page,
    step: Number.isInteger(step) && step >= 0 && step <= 7 ? step : 0,
    trackId: typeof place.trackId === "string" ? place.trackId : null,
  };
}

function readResumeMap(): Record<string, ResumePlace> {
  try {
    const parsed = JSON.parse(localStorage.getItem(RESUME_KEY) ?? "{}") as Record<string, ResumePlace>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
