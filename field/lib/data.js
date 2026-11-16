// Reading the app's saved data.
//   field:users              people and roles
//   field:settings           points rules, brands, distance limit
//   field:shops              every shop
//   field:visits:YYYY-MM     check-ins, one group per month
//   field:day:YYYY-MM-DD     start of day, end of day and last location per person
import { store } from "./store.js";
import { addDays, monthsBetween, weekStart } from "./time.js";
import { normalizeSettings, scoreboard } from "../shared/rules.js";

export async function loadSettings() {
  return normalizeSettings(await store.get("field:settings"));
}

export async function loadVisits(from, to) {
  const out = [];
  for (const month of monthsBetween(from, to)) {
    const group = await store.hall("field:visits:" + month);
    for (const v of Object.values(group)) if (v && v.date >= from && v.date <= to) out.push(v);
  }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

// Leaderboards for today, yesterday, this week (from Sunday) and this month.
export function buildBoard(visits, users, points, today) {
  const people = Object.values(users).filter((u) => u.role === "rep" && u.active !== false);
  const week = weekStart(today);
  const month = today.slice(0, 7) + "-01";
  const yesterday = addDays(today, -1);
  const make = (keep) => scoreboard(visits.filter(keep), people, points);
  return {
    today: make((v) => v.date === today),
    yesterday: make((v) => v.date === yesterday),
    week: make((v) => v.date >= week && v.date <= today),
    month: make((v) => v.date >= month && v.date <= today),
  };
}

export const publicUser = (u) => ({ email: u.email, name: u.name, role: u.role, color: u.color, active: u.active !== false });

export function stageFor(shop, outcome) {
  if (shop.orders >= 2) return "Repeat Buyer";
  if (shop.orders === 1) return "First Order";
  if (outcome === "interested") return "Interested";
  return shop.stage && shop.stage !== "First Order" && shop.stage !== "Repeat Buyer" ? shop.stage : "Prospect";
}
