import type { City, MealType, MenuItem, Restaurant } from "./types";

export const mealOrder: MealType[] = ["breakfast", "lunch", "dinner"];

export const cities: City[] = [
  { id: "riyadh", name: "الرياض", nameEn: "Riyadh" },
  { id: "jeddah", name: "جدة", nameEn: "Jeddah" },
  { id: "dammam", name: "الدمام", nameEn: "Dammam" },
  { id: "makkah", name: "مكة المكرمة", nameEn: "Makkah" },
  { id: "madinah", name: "المدينة المنورة", nameEn: "Madinah" },
];

export function cityLabel(city: City, lang: "ar" | "en") {
  return lang === "en" ? city.nameEn : city.name;
}

const sharedDishes: [string, string, string, number, number][] = [
  ["madhbi", "مظبي دجاج", "دجاج مظبي، وجبة لكل شخص", 90, 55],
  ["meal", "وجبة", "وجبة كاملة، واحدة لكل شخص", 70, 45],
];

function sameMeals(restaurantId: string): Record<MealType, MenuItem[]> {
  const result = {} as Record<MealType, MenuItem[]>;
  for (const meal of mealOrder) {
    result[meal] = sharedDishes.map(([slug, name, description, luxury, regular]) => ({
      id: `${restaurantId}-${meal}-${slug}`,
      name,
      description,
      prices: { luxury, regular },
    }));
  }
  return result;
}

export const restaurants: Restaurant[] = [
  {
    id: "diwan",
    cityId: "riyadh",
    name: "الديوان",
    district: "العليا",
    specialty: "عزائم نجدية",
    menu: sameMeals("diwan"),
  },
  {
    id: "nakheel",
    cityId: "riyadh",
    name: "مائدة النخيل",
    district: "النرجس",
    specialty: "فطور وضيافة",
    menu: sameMeals("nakheel"),
  },
  {
    id: "bait",
    cityId: "jeddah",
    name: "بيت المذاق",
    district: "الشاطئ",
    specialty: "ولائم بحرية",
    menu: sameMeals("bait"),
  },
  {
    id: "sufra",
    cityId: "jeddah",
    name: "سفرة جدة",
    district: "الروضة",
    specialty: "بخاري ومشاوي",
    menu: sameMeals("sufra"),
  },
  {
    id: "wahah",
    cityId: "dammam",
    name: "الواحة",
    district: "الكورنيش",
    specialty: "المائدة الشرقية",
    menu: sameMeals("wahah"),
  },
  {
    id: "reef",
    cityId: "makkah",
    name: "ريف مكة",
    district: "العزيزية",
    specialty: "ولائم المناسبات",
    menu: sameMeals("reef"),
  },
];

export function restaurantsIn(cityId: string) {
  return restaurants.filter((restaurant) => restaurant.cityId === cityId);
}

export function getCity(id: string) {
  return cities.find((city) => city.id === id);
}

export function getRestaurant(id: string) {
  return restaurants.find((restaurant) => restaurant.id === id);
}

const photos: Record<string, "breakfast" | "lunch" | "dinner"> = {
  diwan: "lunch",
  nakheel: "breakfast",
  bait: "dinner",
  sufra: "lunch",
  wahah: "dinner",
  reef: "breakfast",
};

export function restaurantPhoto(id: string) {
  return `${import.meta.env.BASE_URL}hospitality/${photos[id] ?? "lunch"}.jpg`;
}
