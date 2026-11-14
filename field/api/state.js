// Everything a screen needs in one call: who you are, settings, people, shops,
// check-ins for the chosen dates, today's locations and the leaderboards.
// Field users only receive their own check-ins and location.
import { store } from "../lib/store.js";
import { guard, loadUsers, fail, OWNER, DOMAIN } from "../lib/auth.js";
import { loadSettings, loadVisits, buildBoard, publicUser } from "../lib/data.js";
import { nepal, isDate, weekStart } from "../lib/time.js";
import { crmEnabled } from "../lib/crm.js";

export default async function handler(req, res) {
  try {
    const me = await guard(req, res);
    if (!me) return;
    const { date: today } = nepal();
    let from = isDate(req.query.from) ? req.query.from : today;
    let to = isDate(req.query.to) ? req.query.to : today;
    if (from > to) [from, to] = [to, from];

    const [users, settings, shops, days] = await Promise.all([
      loadUsers(),
      loadSettings(),
      store.hall("field:shops"),
      store.hall("field:day:" + today),
    ]);
    const monthStart = today.slice(0, 7) + "-01";
    const lo = [from, weekStart(today), monthStart].sort()[0];
    const hi = to > today ? to : today;
    const all = await loadVisits(lo, hi);
    const board = buildBoard(all, users, settings.points, today);

    let visits = all.filter((v) => v.date >= from && v.date <= to);
    let myDays = days;
    if (me.role === "rep") {
      visits = visits.filter((v) => v.rep === me.email);
      myDays = days[me.email] ? { [me.email]: days[me.email] } : {};
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      me: publicUser(me),
      today,
      from,
      to,
      settings,
      users: Object.values(users).map(publicUser),
      shops: Object.values(shops),
      visits,
      days: myDays,
      board,
      owner: OWNER,
      domain: DOMAIN,
      features: {
        crm: crmEnabled(),
        photos: !!process.env.BLOB_READ_WRITE_TOKEN,
        tv: !!process.env.FIELD_TV_KEY,
      },
    });
  } catch (e) {
    fail(res, e);
  }
}
