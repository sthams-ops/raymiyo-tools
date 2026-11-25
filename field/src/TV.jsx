// Office TV screen: open /tv?key=YOUR_KEY. No sign-in, refreshes by itself.
// Built for a 16:9 TV seen from across the room, and for the old browser inside
// the office TV box: sizes come from the screen width, spacing uses margins
// (that browser ignores "gap" in rows of items), and the map is TVMap (Leaflet).
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Banknote, Clock, Crown, MapPin, Route, ShieldCheck, ShoppingBag, Store, Target, TrendingUp, WifiOff } from "lucide-react";
import { api } from "./api.js";
import TVMap from "./TVMap.jsx";
import { buildMapData, indexBy } from "./mapdata.js";
import { money, OUTCOMES } from "../shared/rules.js";

const REFRESH_MS = 15000;
const ALERTS_PER_PAGE = 3;
const PAGE_MS = 9000;

const kmText = (m) => (m >= 1000 ? (m / 1000).toFixed(1) : (m / 1000).toFixed(2));
const first = (name) => String(name || "").split(" ")[0];
const longDay = (date) => new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const monthName = (date) => new Date(date + "T00:00:00").toLocaleDateString("en-GB", { month: "long" });
const clockNow = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" });
const rupees = (n) => Math.round(Number(n) || 0).toLocaleString("en-IN");
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
function daysLeft(date) {
  const d = new Date(date + "T00:00:00Z");
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return Math.round((end - d) / 86400000);
}

export default function TV() {
  const key = new URLSearchParams(window.location.search).get("key") || "";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [clock, setClock] = useState(clockNow());
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState(null);
  const seen = useRef(null);
  const version = useRef("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .tv(key)
        .then((d) => {
          if (!alive) return;
          // A new version of the board was published: load it, so the TV never needs a restart.
          if (d.version && version.current && d.version !== version.current) return window.location.reload();
          version.current = d.version || version.current;
          const ids = new Set(d.visits.map((v) => v.id));
          if (seen.current) {
            const added = d.visits.filter((v) => !seen.current.has(v.id));
            if (added.length) setToast(added[added.length - 1]);
          }
          seen.current = ids;
          setData(d);
          setErr("");
        })
        .catch((e) => alive && setErr(e.message));
    load();
    const timer = setInterval(load, REFRESH_MS);
    const tick = setInterval(() => setClock(clockNow()), 5000);
    const pager = setInterval(() => setPage((p) => p + 1), PAGE_MS);
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(tick);
      clearInterval(pager);
    };
  }, [key]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 12000);
    return () => clearTimeout(t);
  }, [toast]);

  const mapData = useMemo(() => {
    if (!data) return null;
    // No live position on the TV: where they checked in today, every other Raymiyo shop, and the route if switched on.
    const base = buildMapData({ visits: data.visits, shops: data.shops, users: data.users, days: {}, tracks: data.tracks, showShops: true });
    const flags = (data.watch ? data.watch.alerts : []).filter((a) => Number.isFinite(a.lat) && a.level !== "low").map((a, i) => ({ key: a.kind + i, lat: a.lat, lng: a.lng, level: a.level, title: a.title }));
    return { pins: base.pins, dots: base.dots, routes: base.routes, flags };
  }, [data]);

  if (!data) return <div className="tv2 tv2-wait"><img src="/brand/raymiyo-mark.png" alt="" /><p>{err || "Loading the field board…"}</p></div>;
  if (!data.watch) return <div className="tv2 tv2-wait"><p>Update the server to show the new board.</p></div>;

  const users = indexBy(data.users, "email");
  const { reps, alerts, team } = data.watch;
  const serious = alerts.filter((a) => a.level !== "low");
  const shownAlerts = serious.length ? serious : alerts;
  const pages = Math.max(1, Math.ceil(shownAlerts.length / ALERTS_PER_PAGE));
  const onPage = shownAlerts.slice((page % pages) * ALERTS_PER_PAGE, (page % pages) * ALERTS_PER_PAGE + ALERTS_PER_PAGE);
  const high = alerts.filter((a) => a.level === "high").length;
  const mid = alerts.filter((a) => a.level === "mid").length;

  return (
    <div className="tv2">
      <header className="tv2-head">
        <div className="tv2-brand">
          <img src="/brand/raymiyo-mark.png" alt="" />
          <div>
            <b>Field Live</b>
            <span>{longDay(data.today)}</span>
          </div>
        </div>
        <div className="tv2-team" aria-label="Team today">
          <Total icon={<Store />} value={team.visits} label="Shops today" />
          <Total icon={<ShoppingBag />} value={team.orders} label="Orders today" />
          <Total icon={<Banknote />} value={rupees(team.amount)} pre="Rs" label="Sold today" gold />
          <Total icon={<Route />} value={kmText(team.metres)} unit="km" label="Travelled" />
        </div>
        <div className={"tv2-clock" + (err ? " lost" : "")}>
          <b>{clock}</b>
          <span>{err ? <><WifiOff /> Reconnecting</> : <><i className="tv2-live" /> Live</>}</span>
        </div>
      </header>

      <main className="tv2-main">
        <section className="tv2-map">
          <TVMap {...mapData} />
          {toast && (
            <div className="tv2-toast" style={{ "--rep": (users[toast.rep] || {}).color }}>
              <b>{toast.shopName}</b>
              <span>{first((users[toast.rep] || {}).name)} · {toast.outcome === "order" ? money(toast.value) : OUTCOMES[toast.outcome]}</span>
            </div>
          )}
          <ul className="tv2-legend">
            <li><i className="o-order" />Order</li>
            <li><i className="o-interested" />Interested</li>
            <li><i className="o-absent" />Absent</li>
            <li><i className="o-no" />No</li>
            <li><i className="shop" />Our shop</li>
          </ul>
        </section>

        <section className="tv2-reps">
          {reps.map((r) => <RepCard key={r.email} r={r} visits={data.visits.filter((v) => v.rep === r.email)} />)}
        </section>

        <Race data={data} />

        <section className="tv2-watch">
          <h2>
            <ShieldCheck /> Watch list
            {high > 0 && <em className="hi">{high} serious</em>}
            {mid > 0 && <em className="md">{mid} to check</em>}
            {pages > 1 && <small>{(page % pages) + 1}/{pages}</small>}
          </h2>
          {shownAlerts.length === 0 ? (
            <p className="tv2-clear"><ShieldCheck /> All clear so far today</p>
          ) : (
            <ol key={page % pages}>
              {onPage.map((a, i) => (
                <li key={a.kind + a.rep + i} className={"lv-" + a.level}>
                  <AlertTriangle />
                  <div>
                    <b>{a.title}</b>
                    {a.detail && <span>{a.detail}</span>}
                  </div>
                  {a.at && <time>{a.at}</time>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}

// The month race, ranked by money: total value of orders taken this month.
// Equal sales: more shops visited ranks higher. Store numbers sit beside it.
const bySales = (rows) => rows.slice().sort((a, b) => b.value - a.value || b.visits - a.visits || a.name.localeCompare(b.name));
const topSeller = (rows) => bySales(rows || []).find((r) => r.value > 0);

function Race({ data }) {
  const board = data.board || {};
  const rows = bySales(board.month || []);
  const leader = rows[0];
  const topValue = Math.max(1, ...rows.map((r) => r.value));
  const todayLead = topSeller(board.today);
  const ydayWin = topSeller(board.yesterday);
  const left = daysLeft(data.today);
  return (
    <section className="tv2-race">
      <header>
        <h2><Crown /> {monthName(data.today)} sales race</h2>
        <span className="tv2-chip">{left === 0 ? "Last day!" : `${left} day${left > 1 ? "s" : ""} left`}</span>
        {todayLead && <span className="tv2-chip hot">Today's top seller: {first(todayLead.name)}</span>}
        {ydayWin && <span className="tv2-chip">Yesterday: {first(ydayWin.name)}</span>}
      </header>
      <ol>
        {rows.map((r, i) => {
          const second = rows[1];
          const tiedTop = !!second && rows[0].value === second.value && rows[0].visits === second.visits;
          const leads = i === 0 && r.value > 0 && !tiedTop;
          const behind = leader ? leader.value - r.value : 0;
          const avg = r.orders ? r.value / r.orders : 0;
          const ordersToLead = avg > 0 ? Math.ceil((behind + 1) / avg) : 0;
          let line;
          if (r.value === 0) line = r.visits ? "No sales yet. Turn one interested shop into an order." : "No sales yet this month.";
          else if (tiedTop && behind === 0) line = "Level at the top. The next order takes the lead.";
          else if (i === 0) line = second ? `Top seller so far · ahead by ${money(r.value - second.value)}` : "Top seller so far";
          else line = `${money(behind)} behind ${first(leader.name)}` + (ordersToLead ? ` · about ${ordersToLead} order${ordersToLead > 1 ? "s" : ""} of their usual size to take the lead` : "");
          return (
            <li key={r.email} className={leads ? "lead" : ""} style={{ "--rep": r.color }}>
              <span className="tv2-rank">{leads ? <Crown /> : null}<b>{i + 1}</b></span>
              <div className="tv2-runner">
                <div className="tv2-runner-top">
                  <b>{r.name}</b>
                  <strong><small>Rs </small>{rupees(r.value)}</strong>
                </div>
                <div className="tv2-bar"><i style={{ width: Math.max(3, (r.value / topValue) * 100) + "%" }} /></div>
                <p>{line}</p>
              </div>
              <dl>
                <div><dt>Orders</dt><dd>{r.orders}</dd></div>
                <div><dt>Avg order</dt><dd><small>Rs </small>{rupees(avg)}</dd></div>
                <div><dt>Shops visited</dt><dd>{r.visits}</dd></div>
                <div><dt>New shops</dt><dd>{r.newShops}</dd></div>
                <div><dt>Win rate</dt><dd>{pct(r.orders, r.visits)}<small>%</small></dd></div>
              </dl>
            </li>
          );
        })}
      </ol>
      <footer>
        <TrendingUp /><span>Ranked by <b>total sales this month</b> (value of orders taken). Equal sales: more shops visited goes first.</span>
      </footer>
    </section>
  );
}

function Total({ icon, value, unit, pre, label, gold }) {
  return (
    <div className={"tv2-total" + (gold ? " gold" : "")}>
      {icon}
      <p>
        <b>{pre && <small>{pre} </small>}{value}{unit && <small> {unit}</small>}</b>
        <span>{label}</span>
      </p>
    </div>
  );
}

function RepCard({ r, visits }) {
  const ticks = Array.from({ length: Math.max(r.target, visits.length) }, (_, i) => visits[i]);
  return (
    <article className={"tv2-rep st-" + r.status.kind} style={{ "--rep": r.color }}>
      <header>
        <span className="tv2-avatar">{first(r.name)[0]}</span>
        <div>
          <b>{first(r.name)} <small>today</small></b>
          <span className="tv2-status"><i />{r.status.label}</span>
        </div>
      </header>
      <div className="tv2-nums">
        <Num icon={<Store />} value={r.visits} unit={`/ ${r.target}`} label="Shops" />
        <Num icon={<ShoppingBag />} value={r.orders} label="Orders" />
        <Num icon={<Banknote />} value={rupees(r.amount)} pre="Rs" label="Sold" gold />
        <Num icon={<Route />} value={kmText(r.metres)} unit="km" label={r.tracked ? "Travelled" : "No route"} dim={!r.tracked} />
      </div>
      <div className="tv2-ticks" aria-label={`${r.visits} of ${r.target} shops`}>
        {ticks.map((v, i) => <i key={i} className={v ? "o-" + v.outcome : ""} />)}
      </div>
      <footer>
        <span><Clock />{r.start ? `Start ${r.start}` : "Not started"}</span>
        <span><MapPin />{r.firstAt ? `1st shop ${r.firstAt}` : "No shop yet"}</span>
        <span><Target />{pct(r.visits, r.target)}% of target</span>
      </footer>
    </article>
  );
}

function Num({ icon, value, unit, pre, label, gold, dim }) {
  return (
    <div className={"tv2-num" + (gold ? " gold" : "") + (dim ? " dim" : "")}>
      <span>{icon}{label}</span>
      <b>{pre && <small>{pre} </small>}{value}{unit && <small> {unit}</small>}</b>
    </div>
  );
}
