// Office TV screen: open /tv?key=YOUR_KEY. No sign-in, refreshes by itself.
// Built for a 16:9 TV seen from across the room: everything is sized from the
// screen width, so the same page fills a 720p, 1080p or 4K screen.
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Banknote, Camera, Clock, MapPin, Route, ShieldCheck, ShoppingBag, Store, WifiOff } from "lucide-react";
import { api } from "./api.js";
import MapView from "./MapView.jsx";
import { buildMapData, indexBy } from "./mapdata.js";
import { money, OUTCOMES } from "../shared/rules.js";

const REFRESH_MS = 15000;
const ALERTS_PER_PAGE = 4;
const PAGE_MS = 9000;
const FRESH_MS = 90000;

const kmText = (m) => (m >= 1000 ? (m / 1000).toFixed(1) : (m / 1000).toFixed(2));
const first = (name) => String(name || "").split(" ")[0];
const longDay = (date) => new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
const clockNow = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" });
const rupees = (n) => Math.round(Number(n) || 0).toLocaleString("en-IN");

export default function TV() {
  const key = new URLSearchParams(window.location.search).get("key") || "";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [clock, setClock] = useState(clockNow());
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState(null);
  const seen = useRef(null);
  const freshAt = useRef({});

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .tv(key)
        .then((d) => {
          if (!alive) return;
          // A check-in that was not there on the last refresh gets the spotlight.
          const ids = new Set(d.visits.map((v) => v.id));
          if (seen.current) {
            const added = d.visits.filter((v) => !seen.current.has(v.id));
            for (const v of added) freshAt.current[v.id] = Date.now();
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
    const base = buildMapData({ visits: data.visits, shops: data.shops, users: data.users, days: data.days, tracks: data.tracks, showShops: false });
    const flags = (data.watch ? data.watch.alerts : []).filter((a) => Number.isFinite(a.lat) && a.level !== "low").map((a, i) => ({ key: a.kind + i, lat: a.lat, lng: a.lng, level: a.level, title: a.title }));
    return { ...base, flags };
  }, [data]);

  if (!data) return <div className="tv2 tv2-wait"><img src="/brand/raymiyo-mark.png" alt="" /><p>{err || "Loading the field board…"}</p></div>;
  if (!data.watch) return <div className="tv2 tv2-wait"><p>Update the server to show the new board.</p></div>;

  const users = indexBy(data.users, "email");
  const { reps, alerts, team } = data.watch;
  const serious = alerts.filter((a) => a.level !== "low");
  const shownAlerts = serious.length ? serious : alerts;
  const pages = Math.max(1, Math.ceil(shownAlerts.length / ALERTS_PER_PAGE));
  const onPage = shownAlerts.slice((page % pages) * ALERTS_PER_PAGE, (page % pages) * ALERTS_PER_PAGE + ALERTS_PER_PAGE);
  const latest = data.visits.slice(-6).reverse();
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
          <Total icon={<Store />} value={team.visits} label="Shops visited" />
          <Total icon={<ShoppingBag />} value={team.orders} label="Orders" />
          <Total icon={<Banknote />} value={rupees(team.amount)} unit="Rs" label="Order value" gold />
          <Total icon={<Route />} value={kmText(team.metres)} unit="km" label="Travelled" />
        </div>
        <div className={"tv2-clock" + (err ? " lost" : "")}>
          <b>{clock}</b>
          <span>{err ? <><WifiOff /> Reconnecting…</> : <><i className="tv2-live" /> Live · {data.time}</>}</span>
        </div>
      </header>

      <main className="tv2-main">
        <section className="tv2-map">
          <MapView className="map-tv2" {...mapData} />
          {toast && (
            <div className="tv2-toast" style={{ "--rep": (users[toast.rep] || {}).color }}>
              <span className="tv2-avatar sm">{first((users[toast.rep] || {}).name)[0]}</span>
              <p>
                <b>{toast.shopName}</b>
                <span>{first((users[toast.rep] || {}).name)} · {OUTCOMES[toast.outcome]}{toast.outcome === "order" ? " · " + money(toast.value) : ""}</span>
              </p>
            </div>
          )}
          <ul className="tv2-legend">
            <li><i className="o-order" /> Order</li>
            <li><i className="o-interested" /> Interested</li>
            <li><i className="o-absent" /> Owner absent</li>
            <li><i className="o-no" /> Not interested</li>
            {mapData.flags.length > 0 && <li><i className="flag" /> Check this</li>}
            {!Object.keys(data.tracks || {}).length && <li className="note">Routes hidden on TV (Settings)</li>}
          </ul>
        </section>

        <section className="tv2-side">
          <div className="tv2-reps">
            {reps.map((r) => <RepCard key={r.email} r={r} visits={data.visits.filter((v) => v.rep === r.email)} />)}
          </div>
          <div className="tv2-watch">
            <h2>
              <ShieldCheck /> Watch list
              {high > 0 && <em className="hi">{high} serious</em>}
              {mid > 0 && <em className="md">{mid} to check</em>}
              {pages > 1 && <small>{(page % pages) + 1} / {pages}</small>}
            </h2>
            {shownAlerts.length === 0 ? (
              <p className="tv2-clear"><ShieldCheck /> Nothing unusual so far today.</p>
            ) : (
              <ol key={page % pages}>
                {onPage.map((a, i) => (
                  <li key={a.kind + a.rep + i} className={"lv-" + a.level} style={{ "--rep": (users[a.rep] || {}).color }}>
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
          </div>
        </section>

        <section className="tv2-strip" aria-label="Latest check-ins">
          {latest.length === 0 ? (
            <p className="tv2-empty"><Camera /> Shelf photos appear here as shops are checked in.</p>
          ) : (
            latest.map((v) => {
              const u = users[v.rep] || {};
              const fresh = Date.now() - (freshAt.current[v.id] || 0) < FRESH_MS;
              return (
                <figure key={v.id} className={"tv2-shot" + (fresh ? " fresh" : "")} style={{ "--rep": u.color }}>
                  {v.photo ? <img src={v.photo} alt="" loading="lazy" decoding="async" /> : <div className="tv2-nophoto">{(v.shopName || "?")[0]}</div>}
                  <figcaption>
                    <span className={"pill o-" + v.outcome}>{v.outcome === "order" ? money(v.value) : OUTCOMES[v.outcome]}</span>
                    <b>{v.shopName}</b>
                    <small><i style={{ background: u.color }} />{first(u.name)} · {v.time}{v.area ? " · " + v.area : ""}</small>
                  </figcaption>
                </figure>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}

function Total({ icon, value, unit, label, gold }) {
  return (
    <div className={"tv2-total" + (gold ? " gold" : "")}>
      {icon}
      <p>
        <b>{unit === "Rs" && <small>Rs </small>}{value}{unit === "km" && <small> km</small>}</b>
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
          <b>{r.name}</b>
          <span className="tv2-status"><i />{r.status.label}</span>
        </div>
      </header>
      <div className="tv2-nums">
        <Num icon={<Route />} value={kmText(r.metres)} unit="km" label={r.tracked ? "Travelled" : "No route yet"} dim={!r.tracked} />
        <Num icon={<Store />} value={r.visits} unit={`/ ${r.target}`} label="Shops visited" />
        <Num icon={<ShoppingBag />} value={r.orders} unit={r.firstOrders ? `${r.firstOrders} new` : ""} label="Orders" />
        <Num icon={<Banknote />} value={rupees(r.amount)} pre="Rs" label="Order value" gold />
      </div>
      <div className="tv2-ticks" aria-label={`${r.visits} of ${r.target} shops`}>
        {ticks.map((v, i) => <i key={i} className={v ? "o-" + v.outcome : ""} />)}
      </div>
      <footer>
        <span><Clock /> {r.start ? `Start ${r.start}` : "Not started"}</span>
        <span><MapPin /> {r.firstAt ? `First shop ${r.firstAt}` : "No shop yet"}</span>
        <span><Store /> {r.newShops} new</span>
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

