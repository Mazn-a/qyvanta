import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.WIFAQ_DB_DIR || resolve(root, "data/wifaq");

mkdirSync(dataDir, { recursive: true });

export const db = new PGlite(dataDir);

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const result = await db.query<T>(sql, params);
  return result.rows;
}

export async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function migrate() {
  const schema = readFileSync(resolve(root, "schema.sql"), "utf8");
  await db.exec(schema);
  await widenReportStatus();
  await seedIfNeeded();
}

async function widenReportStatus() {
  const checks = await query<{ conname: string; def: string }>(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'reports' AND con.contype = 'c'`,
  );
  for (const check of checks) {
    if (!check.def.includes("status")) continue;
    await db.exec(`ALTER TABLE reports DROP CONSTRAINT ${quoteIdent(check.conname)}`);
  }
  await db.exec(`ALTER TABLE reports ADD CONSTRAINT reports_status_check CHECK (status IN ('new', 'working', 'done'))`);
}

function quoteIdent(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

async function seedIfNeeded() {
  const marked = await one<{ value: string }>("SELECT value FROM meta WHERE key = 'seeded'");
  if (marked?.value === "1") return;

  const cities = [
    ["riyadh", "الرياض", "Riyadh"],
    ["jeddah", "جدة", "Jeddah"],
    ["dammam", "الدمام", "Dammam"],
    ["makkah", "مكة المكرمة", "Makkah"],
    ["madinah", "المدينة المنورة", "Madinah"],
  ];
  for (const [id, name, nameEn] of cities) {
    await query("INSERT INTO cities (id, name, name_en) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [id, name, nameEn]);
  }

  const restaurants = [
    ["diwan", "الديوان", "riyadh", "العليا", "عزائم نجدية"],
    ["nakheel", "مائدة النخيل", "riyadh", "النرجس", "فطور وضيافة"],
    ["bait", "بيت المذاق", "jeddah", "الشاطئ", "ولائم بحرية"],
    ["sufra", "سفرة جدة", "jeddah", "الروضة", "بخاري ومشاوي"],
    ["wahah", "الواحة", "dammam", "الكورنيش", "المائدة الشرقية"],
    ["reef", "ريف مكة", "makkah", "العزيزية", "ولائم المناسبات"],
  ];
  const dishes: [string, string, string, number, number][] = [
    ["madhbi", "مظبي دجاج", "دجاج مظبي، وجبة لكل شخص", 90, 55],
    ["meal", "وجبة", "وجبة كاملة، واحدة لكل شخص", 70, 45],
  ];
  const meals = ["breakfast", "lunch", "dinner"] as const;

  for (const [id, name, cityId, district, specialty] of restaurants) {
    await query(
      "INSERT INTO restaurants (id, name, city_id, district, specialty) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
      [id, name, cityId, district, specialty],
    );
    for (const meal of meals) {
      for (const [slug, dishName, description, luxury, regular] of dishes) {
        await query(
          `INSERT INTO menu_items (id, restaurant_id, meal_type, name, description, price_luxury, price_regular)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
          [`${id}-${meal}-${slug}`, id, meal, dishName, description, luxury, regular],
        );
      }
    }
  }

  await query("INSERT INTO meta (key, value) VALUES ('seeded', '1') ON CONFLICT (key) DO UPDATE SET value = '1'");
}
