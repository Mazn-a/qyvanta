import { useEffect, useState } from "react";
import { cities as seedCities, restaurants as seedRestaurants } from "./data";
import type { City, MealType, Restaurant } from "./types";

let cities: City[] = seedCities;
let restaurants: Restaurant[] = seedRestaurants;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function catalogCities() {
  return cities;
}

export function catalogRestaurants() {
  return restaurants;
}

export function restaurantsIn(cityId: string) {
  return restaurants.filter((restaurant) => restaurant.cityId === cityId);
}

export function getCity(id: string) {
  return cities.find((city) => city.id === id);
}

export function getRestaurant(id: string) {
  return restaurants.find((restaurant) => restaurant.id === id);
}

export async function loadCatalog() {
  try {
    const response = await fetch("/api/catalog");
    const data = (await response.json()) as { cities?: City[]; restaurants?: Restaurant[] };
    if (!response.ok || !Array.isArray(data.restaurants) || !Array.isArray(data.cities)) return;
    cities = data.cities;
    restaurants = data.restaurants;
    emit();
  } catch {
    /* تبقى القائمة المحلية إذا تعذر الخادم */
  }
}

export function useCatalog() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onChange = () => setTick((value) => value + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return { cities, restaurants, mealTypes: ["breakfast", "lunch", "dinner"] as MealType[] };
}
