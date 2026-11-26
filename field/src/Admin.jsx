// The admin screen. The "view only" admin sees the same screens with every
// change control removed; the server also refuses changes from that account.
import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Flame, Gauge, MapPinned, MessageCircle, Rocket, Route, UsersRound, Search, Settings as Cog, Store, Trash2, Users } from "lucide-react";
import { api } from "./api.js";
import MapView from "./MapView.jsx";
import { chatTarget, openChat } from "./Chat.jsx";
import { Avatar, Board, VisitRow, VisitFacts, FocusList, fmtDay, PERIODS } from "./ui.jsx";
import { buildMapData, indexBy, weekStartOf, dayBefore, routeStats, checkins } from "./mapdata.js";
import { toRows, downloadCsv, downloadPdf } from "./export.js";
import { COLORS, OUTCOMES, ROLES, money, scoreboard, focusList, coach, shopOwes, daysBetween } from "../shared/rules.js";

const TABS = [
  ["live", "Map", MapPinned],
  ["insights", "Insights", Gauge],
  ["shops", "Shops", Store],
  ["team", "Team", Users],
  ["settings", "Settings", Cog],
  ["export", "Export", FileText],
];

export default function Admin({ data, reload, setRange, say }) {
  const canEdit = data.me.role === "admin";
  const [tab, setTab] = useState("live");
  const [person, setPerson] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const users = useMemo(() => indexBy(data.users, "email"), [data.users]);
  const shops = useMemo(() => indexBy(data.shops, "id"), [data.shops]);
  const reps = data.users.filter((u) => u.role === "rep");
  const visits = useMemo(
    () => data.visits.filter((v) => (person === "all" || v.rep === person) && (outcome === "all" || v.outcome === outcome)),
    [data.visits, person, outcome]
  );
  const ctx = { data, reload, say, canEdit, users, shops, reps, visits, person, setPerson, outcome, setOutcome, setRange };

  return (
    <>
      <nav className="tabs appnav" aria-label="Sections">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); window.scrollTo(0, 0); }}>
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {!data.launch && <GoLive data={data} reload={reload} say={say} />}
      {!canEdit && <p className="banner">View only. You can see everything; changes are switched off for this account.</p>}
      {tab === "live" && <Live {...ctx} />}
      {tab === "insights" && <Insights {...ctx} />}
      {tab === "shops" && <Shops {...ctx} />}
      {tab === "team" && <Team {...ctx} />}
      {tab === "settings" && <SettingsTab {...ctx} />}
      {tab === "export" && <ExportTab {...ctx} />}
    </>
  );
}

/* ---------- before the real first day ---------- */
// Shown until the owner starts field sales. One tap, one time: it clears what was made while testing.
function GoLive({ data, reload, say }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const isOwner = data.me.email === data.owner;
  async function start() {
    setBusy(true);
    setErr("");
    try {
      const out = await api.admin("goLive", { confirm: "START" });
      await reload();
      say(`Field sales has started. ${out.shops} test shops and ${out.visits} test check-ins were cleared.`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }
  return (
    <div className="golive" role="region" aria-label="Start field sales">
      <div>
        <b>Testing mode</b>
        <p>Everything saved now is practice. {isOwner ? "When the team is ready for the real first day, start field sales." : "The owner starts field sales when the team is ready."}</p>
      </div>
      {isOwner && !ask && <button className="btn solid" onClick={() => setAsk(true)}><Rocket size={16} /> Start field sales</button>}
      {isOwner && ask && (
        <div className="warnbox">
          <p>This deletes all {data.shops.length} test shops, every test check-in, route and photo, and sets points back to zero. Your team, settings and product list stay. It cannot be undone and the button goes away afterwards.</p>
          {err && <p className="error">{err}</p>}
          <div className="chips">
            <button className="btn solid" disabled={busy} onClick={start}>{busy ? "Clearing…" : "Yes, clear the tests and start"}</button>
            <button className="btn" disabled={busy} onClick={() => setAsk(false)}>Not yet</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- date and people filters, shared by Map and Export ---------- */
function Filters({ data, reps, person, setPerson, outcome, setOutcome, setRange, withOutcome }) {
  const t = data.today;
  const presets = [
    ["Today", t, t],
    ["Yesterday", dayBefore(t), dayBefore(t)],
    ["Week", weekStartOf(t), t],
    ["Month", t.slice(0, 7) + "-01", t],
  ];
  // Only one preset lights up, even on a Sunday when "today" and "this week" are the same dates.
  const active = presets.find(([, from, to]) => data.from === from && data.to === to);
  return (
    <div className="filters">
      <div className="chips even" role="group" aria-label="Dates">
        {presets.map(([label, from, to]) => (
          <button key={label} className="chip" aria-pressed={!!active && active[0] === label} onClick={() => setRange({ from, to })}>
            {label}
          </button>
        ))}
      </div>
      <div className="two dates">
        <label className="field">
          From
          <input type="date" value={data.from} max={data.to} onChange={(e) => e.target.value && setRange({ from: e.target.value, to: data.to })} />
        </label>
        <label className="field">
          To
          <input type="date" value={data.to} min={data.from} max={t} onChange={(e) => e.target.value && setRange({ from: data.from, to: e.target.value })} />
        </label>
      </div>
      <div className="two">
        <label className="field">
          Person
          <select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="all">Everyone</option>
            {reps.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
          </select>
        </label>
        {withOutcome && (
          <label className="field">
            Outcome
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="all">All outcomes</option>
              {Object.entries(OUTCOMES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

/* ---------- Map tab ---------- */
function Live(ctx) {
  const { data, users, shops, visits, reps, person, setPerson, canEdit, reload, say } = ctx;
  const [sel, setSel] = useState(null);
  const [heatOn, setHeatOn] = useState(true);
  const [period, setPeriod] = useState("today");
  const isToday = data.from === data.today && data.to === data.today;
  const mapData = useMemo(() => {
    const days = isToday ? Object.fromEntries(Object.entries(data.days).filter(([e]) => person === "all" || e === person)) : {};
    const shopList = data.shops.filter((s) => person === "all" || s.owner === person);
    const mine = (set) => Object.fromEntries(Object.entries(set || {}).filter(([e]) => person === "all" || e === person));
    const tracks = data.from === data.to ? mine(data.tracks) : {};
    const trackDays = data.from !== data.to && data.trackDays ? Object.fromEntries(Object.entries(data.trackDays).map(([d, set]) => [d, mine(set)])) : null;
    return buildMapData({ visits, shops: shopList, users: data.users, days, tracks, trackDays });
  }, [visits, data.shops, data.users, data.days, data.tracks, data.trackDays, data.from, data.to, person, isToday]);
  // One person chosen: what their route says about the day.
  const focus = person !== "all" ? users[person] : null;
  const travel = useMemo(() => {
    if (!focus) return null;
    const days = data.from === data.to ? [[data.from, (data.tracks || {})[person]]] : Object.entries(data.trackDays || {}).map(([d, set]) => [d, set[person]]);
    const used = days.filter(([, line]) => line);
    return routeStats(used.map(([, line]) => line), used.map(([d]) => checkins(visits, person, d)));
  }, [focus, person, data.tracks, data.trackDays, data.from, data.to, visits]);
  const noRoutes = data.from !== data.to && !data.trackDays;
  const pick = (email) => {
    setPerson(person === email ? "all" : email);
    setSel(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // The chat button offers to message whoever is picked on the map.
  useEffect(() => {
    chatTarget(person !== "all" ? person : null);
    return () => chatTarget(null);
  }, [person]);
  const dayOf = focus && isToday ? data.days[person] : null;
  const orders = visits.filter((v) => v.outcome === "order");
  const chosen = sel && visits.find((v) => v.id === sel);
  const many = data.from !== data.to;

  return (
    <main className="shell wide">
      <MapView className="map-admin" legend {...mapData} showHeat={heatOn} focus={person} selected={sel} onSelect={setSel}>
        <button type="button" className="map-heat" aria-pressed={heatOn} onClick={() => setHeatOn(!heatOn)}>
          <Flame size={15} /> Heat
        </button>
      </MapView>
      <section className="panel">
        <div className="card who-card">
          <div className="people" role="group" aria-label="Whose map">
            <button aria-pressed={person === "all"} onClick={() => { setPerson("all"); setSel(null); }}>
              <span className="all"><UsersRound size={16} /></span>
              Everyone
            </button>
            {reps.map((u) => (
              <button key={u.email} aria-pressed={person === u.email} onClick={() => pick(u.email)}>
                <Avatar user={u} size={26} />
                {u.name.split(" ")[0]}
              </button>
            ))}
          </div>
          {focus && (
            <div className="travel">
              <p>
                <b>{focus.name}</b>
                <span>
                  {dayOf ? (dayOf.end ? `Day ended at ${dayOf.end}` : dayOf.start ? `In the field since ${dayOf.start}. Last seen ${dayOf.at || dayOf.start}` : "Has not started the day") : isToday ? "Has not tapped Start day today" : data.from === data.to ? fmtDay(data.from) : `${fmtDay(data.from)} to ${fmtDay(data.to)}`}
                  {` · ${visits.length} ${visits.length === 1 ? "check-in" : "check-ins"}`}
                </span>
              </p>
              <div className="stats three">
                <div className="stat"><b>{travel.km} km</b><span>Travelled</span></div>
                <div className="stat"><b>{travel.first || "-"}</b><span>Route starts</span></div>
                <div className="stat"><b>{travel.last || "-"}</b><span>Last point</span></div>
              </div>
              {!travel.points && <p className="muted small">{noRoutes ? "Routes are shown for one day or up to 7 days. Pick a shorter range." : "No route saved for these dates. The route is recorded by the Android app between Start day and End day, with Location set to Allow all the time."}</p>}
              <div className="chips">
                <button className="btn solid" onClick={() => openChat(focus.email)}><MessageCircle size={16} /> Message {focus.name.split(" ")[0]}</button>
                <button className="btn" onClick={() => { setPerson("all"); setSel(null); }}><UsersRound size={16} /> Show everyone</button>
              </div>
            </div>
          )}
          {!focus && <p className="muted small"><Route size={13} /> Tap a name to see only that person's route, heat and check-ins.</p>}
        </div>
        <div className="card">
          <Filters {...ctx} withOutcome />
          <div className="stats four">
            <div className="stat"><b>{visits.length}</b><span>Check-ins</span></div>
            <div className="stat"><b>{orders.length}</b><span>Orders</span></div>
            <div className="stat hot"><b>{money(orders.reduce((t, v) => t + v.value, 0))}</b><span>Order value</span></div>
            <div className="stat"><b>{visits.filter((v) => v.newShop).length}</b><span>New shops</span></div>
          </div>
        </div>

        {chosen && (
          <VisitCard key={chosen.id} v={chosen} shop={shops[chosen.shopId]} user={users[chosen.rep]} data={data} canEdit={canEdit} reload={reload} say={say} close={() => setSel(null)} />
        )}

        <div className="card">
          <div className="head">
            <h3>The race</h3>
            <div className="seg" role="group" aria-label="Leaderboard period">
              {PERIODS.map(([k, label]) => (
                <button key={k} aria-pressed={period === k} onClick={() => setPeriod(k)}>{label}</button>
              ))}
            </div>
          </div>
          <Board rows={data.board[period] || []} onPick={pick} picked={person} />
        </div>

        <div className="card">
          <h3>Check-ins, newest first</h3>
          <div className="rows">
            {visits.length ? (
              visits.slice().reverse().map((v) => (
                <VisitRow key={v.id} v={v} shop={shops[v.shopId]} user={users[v.rep]} showRep showDate={many} selected={sel === v.id} onClick={() => setSel(v.id)} />
              ))
            ) : (
              <p className="muted">No check-ins for these filters.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function VisitCard({ v, shop, user, data, canEdit, reload, say, close }) {
  const [edit, setEdit] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run(action, done) {
    setBusy(true);
    setErr("");
    try {
      await action();
      await reload();
      say(done);
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const saveEdit = async () => {
    const ok = await run(() => api.updateVisit({ id: v.id, outcome: edit.outcome, value: Number(String(edit.value || "").replace(/[^0-9]/g, "")), terms: edit.terms, contact: edit.contact, contactRole: edit.contactRole, note: edit.note }), "Check-in updated.");
    if (ok) setEdit(null);
  };
  const remove = async () => {
    const ok = await run(() => api.deleteVisit(v.id), "Check-in deleted.");
    if (ok) close();
  };

  return (
    <div className="card">
      <div className="head">
        <h2>{(shop && shop.name) || v.shopName}</h2>
        <button className="btn small" onClick={close}>Close</button>
      </div>
      {!edit && <VisitFacts v={v} shop={shop} user={user} points={data.settings.points} />}
      {edit && (
        <>
          <div className="chips" role="group" aria-label="Outcome">
            {Object.keys(OUTCOMES).map((k) => (
              <button key={k} className={`chip pick-${k}`} aria-pressed={edit.outcome === k} onClick={() => setEdit({ ...edit, outcome: k })}>{OUTCOMES[k]}</button>
            ))}
          </div>
          {edit.outcome === "order" && (
            <div className="two">
              <label className="field">
                Order amount in rupees
                <input value={edit.value} inputMode="numeric" onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
              </label>
              <label className="field">
                Payment
                <select value={edit.terms} onChange={(e) => setEdit({ ...edit, terms: e.target.value })}>
                  <option>Cash</option>
                  <option>Credit (Cheque)</option>
                </select>
              </label>
            </div>
          )}
          <div className="two">
            <label className="field">
              Talked to
              <input value={edit.contact} maxLength={60} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} />
            </label>
            <label className="field">
              Their role
              <select value={edit.contactRole} onChange={(e) => setEdit({ ...edit, contactRole: e.target.value })}>
                <option>Owner</option>
                <option>Staff</option>
                <option>Manager</option>
              </select>
            </label>
          </div>
          <label className="field">
            Note
            <textarea value={edit.note} maxLength={500} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
          </label>
        </>
      )}
      {err && <p className="error">{err}</p>}
      {canEdit && (
        <div className="chips">
          {edit ? (
            <>
              <button className="btn solid" disabled={busy} onClick={saveEdit}>Save changes</button>
              <button className="btn" disabled={busy} onClick={() => setEdit(null)}>Cancel</button>
            </>
          ) : confirmDelete ? (
            <>
              <button className="btn danger" disabled={busy} onClick={remove}>Yes, delete it</button>
              <button className="btn" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep it</button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setEdit({ outcome: v.outcome, value: v.value || "", terms: v.terms || "Cash", contact: v.contact || "", contactRole: v.contactRole || "Owner", note: v.note || "" })}>Edit</button>
              <button className="btn danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Insights tab: who is doing well, who and what needs a push ---------- */
const STATUS = { push: "Needs a push", watch: "Keep an eye", lead: "Leading", ok: "On track" };

function Insights({ data, users, canEdit, reload, say }) {
  const [period, setPeriod] = useState("today");
  const [dueView, setDueView] = useState("all");
  const t = data.today;
  const day = period === "yesterday" ? dayBefore(t) : t;
  const dues = data.shops
    .filter((s) => s.active !== false)
    .flatMap((s) => (s.dues || []).map((d) => ({ shop: s, ...d, late: d.date ? daysBetween(d.date, t) : 0 })))
    .sort((a, b) => b.late - a.late);
  const shownDues = dues.filter((d) => dueView === "all" || (dueView === "today" ? d.late === 0 : d.late > 0));
  const owed = dues.reduce((a, d) => a + d.amount, 0);
  const owedLate = dues.filter((d) => d.late > 0).reduce((a, d) => a + d.amount, 0);
  const from = period === "week" ? weekStartOf(t) : period === "month" ? t.slice(0, 7) + "-01" : day;
  const focus = useMemo(() => focusList(data.shops, t, { reorderDays: data.settings.reorderDays }), [data.shops, t, data.settings.reorderDays]);
  const nowTime = new Date(Date.now() + 345 * 60000).toISOString().slice(11, 16);
  const people = useMemo(
    () => coach(data.board[period] || [], focus, { from, today: day, dailyVisits: data.settings.dailyVisits, todayRows: data.board.today, nowTime, live: period !== "yesterday" }),
    [data.board, period, focus, from, day, data.settings.dailyVisits, nowTime]
  );
  const total = people.reduce((a, r) => ({ visits: a.visits + r.visits, orders: a.orders + r.orders, value: a.value + r.value, newShops: a.newShops + r.newShops }), { visits: 0, orders: 0, value: 0, newShops: 0 });
  const overdue = focus.filter((f) => f.level === "overdue");
  const dueToday = focus.filter((f) => f.level === "today");
  const pushes = focus.filter((f) => f.level === "push");
  const order = { push: 0, watch: 1, ok: 2, lead: 3 };
  const sorted = people.slice().sort((a, b) => order[a.status] - order[b.status] || b.flags.length - a.flags.length);
  const pct = (n) => Math.round(n * 100) + "%";
  return (
    <main className="shell single">
      <section className="panel">
        <div className="card">
          <div className="head">
            <h2>How the team is doing</h2>
            <div className="seg" role="group" aria-label="Period">
              {PERIODS.map(([k, label]) => (
              <button key={k} aria-pressed={period === k} onClick={() => setPeriod(k)}>{label}</button>
            ))}
            </div>
          </div>
          <p className="muted small">{period === "today" || period === "yesterday" ? fmtDay(day) : `${fmtDay(from)} to ${fmtDay(t)}`}</p>
          <div className="stats four">
            <div className="stat"><b>{total.visits}</b><span>Visits</span></div>
            <div className="stat"><b>{total.orders}</b><span>Orders ({total.visits ? pct(total.orders / total.visits) : "0%"} of visits)</span></div>
            <div className="stat hot"><b>{money(total.value)}</b><span>Order value</span></div>
            <div className="stat"><b>{total.newShops}</b><span>New shops</span></div>
          </div>
          <div className="stats">
            <div className="stat"><b style={{ color: overdue.length ? "var(--bad)" : undefined }}>{overdue.length}</b><span>Overdue tasks</span></div>
            <div className="stat"><b>{dueToday.length}</b><span>Due today</span></div>
            <div className="stat"><b>{pushes.length}</b><span>Shops to push</span></div>
          </div>
        </div>

        <div className="card">
          <div>
            <h2>People</h2>
            <p className="muted small">{PERIODS.find(([k]) => k === period)[1]}. Sorted with whoever needs your attention first. Target is {data.settings.dailyVisits} visits a day; Saturday is not counted.</p>
          </div>
          {sorted.map((r) => (
            <div key={r.email} className="coach">
              <div className="head">
                <b><Avatar user={r} size={28} /> {r.name}</b>
                <span className={"tag s-" + r.status}>{STATUS[r.status]}</span>
              </div>
              <div className="mini">
                <div><b>{r.today}</b><span>Visits today</span></div>
                <div><b>{r.visits}</b><span>{period === "today" ? "Visits" : period === "yesterday" ? "Visits yesterday" : "Visits in period"}</span></div>
                <div><b>{r.perDay.toFixed(1)}</b><span>Per field day</span></div>
                <div><b>{r.orders}</b><span>Orders ({pct(r.rate)})</span></div>
                <div><b>{money(r.value)}</b><span>Order value</span></div>
                <div><b>{r.newShops}</b><span>New shops</span></div>
                <div><b style={{ color: r.overdue ? "var(--bad)" : undefined }}>{r.overdue}</b><span>Overdue tasks</span></div>
                <div><b>{r.far}</b><span>Far check-ins</span></div>
                <div><b>{r.points}</b><span>Points</span></div>
              </div>
              {r.flags.length > 0 ? <ul>{r.flags.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="muted small">{r.visits ? "Nothing to chase. Tell them it is going well." : "No check-ins in this period yet."}</p>}
            </div>
          ))}
          {!people.length && <p className="muted">No field users on the team yet. Add them in the Team tab.</p>}
        </div>

        <div className="card">
          <div>
            <h2>Shops that need action</h2>
            <p className="muted small">Late deliveries and follow-ups first, then shops that have gone quiet.</p>
          </div>
          <FocusList items={[...overdue, ...dueToday, ...pushes].slice(0, 25)} users={users} canAct={canEdit} reload={reload} say={say} />
          {!overdue.length && !dueToday.length && !pushes.length && <p className="muted">Nothing is waiting. Next steps appear here after each check-in.</p>}
        </div>

        <div className="card">
          <div>
            <h2>Money to collect</h2>
            <p className="muted small">Cheques not yet cleared and payments promised for a date. A line drops off by itself when the CRM invoice balance reaches zero.</p>
          </div>
          <div className="seg" role="group" aria-label="Which payments">
            {[["all", "All"], ["today", "Due today"], ["late", "Late"]].map(([k, label]) => (
              <button key={k} aria-pressed={dueView === k} onClick={() => setDueView(k)}>{label}</button>
            ))}
          </div>
          <div className="stats four">
            <div className="stat hot"><b>{money(owed)}</b><span>Outstanding</span></div>
            <div className="stat"><b style={{ color: owedLate ? "var(--bad)" : undefined }}>{money(owedLate)}</b><span>Past its date</span></div>
          </div>
          <div className="rows">
            {shownDues.map((d) => (
              <div key={d.shop.id + d.visitId} className="row plain">
                <span className="what">
                  <b>{d.shop.name}</b>
                  <small>
                    {d.type === "cheque" ? "Cheque dated " : "Promised for "}
                    {fmtDay(d.date)}
                    {d.late > 0 ? ` · ${d.late} days late` : d.late === 0 ? " · today" : ` · in ${-d.late} days`}
                    {users[d.shop.owner] ? " · " + users[d.shop.owner].name.split(" ")[0] : ""}
                  </small>
                </span>
                <span className={"pill " + (d.late > 0 ? "o-no" : d.late >= -7 ? "o-interested" : "stage")}>{money(d.amount)}</span>
              </div>
            ))}
            {!shownDues.length && <p className="muted">{dues.length ? "Nothing in this list." : "Nobody owes anything from field orders."}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

/* ---------- Shops tab ---------- */
function Shops({ data, users, canEdit, reload, say }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const list = data.shops
    .filter((s) => (showArchived ? s.active === false : s.active !== false))
    .filter((s) => !q.trim() || (s.name + " " + (s.area || "")).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <main className="shell single">
      <section className="panel">
        <div className="card">
          <div className="head">
            <h2>{showArchived ? "Archived shops" : `${list.length} shops`}</h2>
            <button className="btn small" onClick={() => setShowArchived(!showArchived)}>{showArchived ? "Show active shops" : "Show archived"}</button>
          </div>
          <label className="search">
            <Search size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shops by name or area" aria-label="Search shops" />
          </label>
          <div className="rows">
            {list.map((s) =>
              open === s.id ? (
                <ShopForm key={s.id} shop={s} data={data} canEdit={canEdit} reload={reload} say={say} close={() => setOpen(null)} />
              ) : (
                <button key={s.id} className="row" onClick={() => setOpen(s.id)}>
                  <Avatar user={users[s.owner]} size={30} />
                  <span className="what">
                    <b>{s.name}</b>
                    <small>
                      {s.type}
                      {s.area ? ", " + s.area : ""} · {s.orders} orders{s.lastVisit ? " · last visit " + s.lastVisit : ""}
                    </small>
                  </span>
                  <span className="pill stage">{s.stage || "Prospect"}</span>
                </button>
              )
            )}
            {!list.length && <p className="muted">{data.shops.length ? "No shop matches." : "No shops yet. They appear here after the first check-in."}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

function ShopForm({ shop, data, canEdit, reload, say, close }) {
  const [f, setF] = useState({ name: shop.name, type: shop.type, area: shop.area || "", phone: shop.phone || "", owner: shop.owner, terms: shop.terms || "", margin: shop.margin ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sure, setSure] = useState(false);
  async function remove() {
    setBusy(true);
    setErr("");
    try {
      await api.admin("deleteShop", { id: shop.id });
      await reload();
      say("Shop deleted.");
      close();
    } catch (e) {
      setErr(e.message || "Could not delete the shop.");
      setBusy(false);
    }
  }
  const people = data.users.filter((u) => u.active && u.role !== "viewer");
  async function send(patch, done) {
    setBusy(true);
    setErr("");
    try {
      await api.saveShop({ id: shop.id, ...patch });
      await reload();
      say(done);
      close();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }
  const input = (key, label, props = {}) => (
    <label className="field">
      {label}
      <input value={f[key]} disabled={!canEdit} onChange={(e) => setF({ ...f, [key]: e.target.value })} {...props} />
    </label>
  );
  return (
    <div className="rowform">
      {input("name", "Shop name")}
      <div className="two">
        {input("area", "Area")}
        {input("phone", "Phone", { inputMode: "tel" })}
      </div>
      <div className="two">
        <label className="field">
          Type
          <select value={f.type} disabled={!canEdit} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option>Retailer</option>
            <option>Wholesaler</option>
          </select>
        </label>
        <label className="field">
          Payment terms
          <select value={f.terms} disabled={!canEdit} onChange={(e) => setF({ ...f, terms: e.target.value })}>
            <option value="">Not set</option>
            <option>Cash</option>
            <option>Credit (Cheque)</option>
          </select>
        </label>
      </div>
      {input("margin", `Margin, % off our price (maximum ${data.settings.maxMargin})`, { inputMode: "decimal" })}
      <label className="field">
        Belongs to
        <select value={f.owner} disabled={!canEdit} onChange={(e) => setF({ ...f, owner: e.target.value })}>
          {!people.some((u) => u.email === f.owner) && <option value={f.owner}>{f.owner}</option>}
          {people.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
        </select>
      </label>
      <p className="muted small">
        Stage: {shop.stage || "Prospect"} · {shop.orders} orders{shopOwes(shop) > 0 ? ` · owes ${money(shopOwes(shop))}` : ""} · added {shop.createdAt} ·{" "}
        <a href={`https://www.google.com/maps?q=${shop.lat},${shop.lng}`} target="_blank" rel="noreferrer">open in Google Maps</a>
      </p>
      {err && <p className="error">{err}</p>}
      <div className="chips">
        {canEdit && <button className="btn solid" disabled={busy} onClick={() => send(f, "Shop saved.")}>Save shop</button>}
        {canEdit && (
          <button className="btn danger" disabled={busy} onClick={() => send({ active: shop.active === false }, shop.active === false ? "Shop restored." : "Shop archived.")}>
            {shop.active === false ? "Restore shop" : "Archive shop"}
          </button>
        )}
        {canEdit && shop.active === false && !sure && <button className="btn danger" disabled={busy} onClick={() => setSure(true)}>Delete shop</button>}
        <button className="btn" disabled={busy} onClick={close}>Close</button>
      </div>
      {sure && (
        <div className="warnbox">
          <span>Delete {shop.name} and all its check-ins from the app? Points from those check-ins go too. This cannot be undone. Sales Orders and the Account in CRM are not touched.</span>
          <div className="chips">
            <button className="btn danger" disabled={busy} onClick={remove}>Yes, delete it</button>
            <button className="btn" disabled={busy} onClick={() => setSure(false)}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Team tab ---------- */
function Team({ data, canEdit, reload, say }) {
  const blank = { local: "", name: "", role: "rep" };
  const [add, setAdd] = useState(blank);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const order = { admin: 0, viewer: 1, rep: 2 };
  const list = data.users.slice().sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));

  async function run(op, payload, done) {
    setBusy(true);
    setErr("");
    try {
      await api.admin(op, payload);
      await reload();
      say(done);
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function addUser(e) {
    e.preventDefault();
    const email = add.local.trim().toLowerCase().replace(/@.*$/, "") + "@" + data.domain;
    if (await run("saveUser", { user: { email, name: add.name, role: add.role, active: true } }, "Person added. They can sign in now.")) setAdd(blank);
  }

  return (
    <main className="shell single">
      <section className="panel">
        {canEdit && (
          <form className="card" onSubmit={addUser}>
            <div>
              <h2>Add a person</h2>
              <p className="muted small">Only @{data.domain} emails can be added. They sign in with their Zoho account.</p>
            </div>
            <label className="field">
              Company email
              <span className="suffix">
                <input value={add.local} onChange={(e) => setAdd({ ...add, local: e.target.value })} placeholder="firstname.lastname" autoCapitalize="none" autoComplete="off" required />
                <em>@{data.domain}</em>
              </span>
            </label>
            <div className="two">
              <label className="field">
                Full name
                <input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} required />
              </label>
              <label className="field">
                Role
                <select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>
                  {Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </label>
            </div>
            {err && !open && <p className="error">{err}</p>}
            <button className="btn solid" disabled={busy}>Add person</button>
          </form>
        )}

        <div className="card">
          <h2>Team</h2>
          <div className="rows">
            {list.map((u) => {
              const isOwner = u.email === data.owner;
              if (open === u.email && canEdit) {
                return (
                  <UserForm key={u.email} user={u} isOwner={isOwner} isMe={u.email === data.me.email} busy={busy} err={err} close={() => { setOpen(null); setErr(""); }}
                    save={async (user) => (await run("saveUser", { user }, "Saved.")) && setOpen(null)}
                    remove={async () => (await run("removeUser", { email: u.email }, "Person removed.")) && setOpen(null)} />
                );
              }
              return (
                <button key={u.email} className="row" onClick={() => canEdit && setOpen(u.email)} disabled={!canEdit}>
                  <Avatar user={u} size={34} />
                  <span className="what">
                    <b>{u.name}{!u.active ? " (switched off)" : ""}</b>
                    <small>{u.email}</small>
                  </span>
                  <span className="pill role">{isOwner ? "Owner, admin" : ROLES[u.role]}</span>
                </button>
              );
            })}
          </div>
          <p className="muted small">
            Admin changes anything. Admin, view only sees everything and changes nothing. Field users check in and see only their own check-ins.
          </p>
        </div>
      </section>
    </main>
  );
}

function UserForm({ user, isOwner, isMe, busy, err, save, remove, close }) {
  const [f, setF] = useState({ ...user });
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="rowform">
      <p className="muted small">{user.email}</p>
      <div className="two">
        <label className="field">
          Full name
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="field">
          Role
          <select value={f.role} disabled={isOwner} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {Object.entries(ROLES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      </div>
      <div>
        <h3>Colour on the map</h3>
        <div className="swatches" role="group" aria-label="Colour on the map">
          {COLORS.map((c) => (
            <button key={c} type="button" style={{ background: c }} aria-pressed={f.color === c} aria-label={"Colour " + c} onClick={() => setF({ ...f, color: c })} />
          ))}
        </div>
      </div>
      {!isOwner && (
        <label className="check">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Can sign in
        </label>
      )}
      {err && <p className="error">{err}</p>}
      <div className="chips">
        <button className="btn solid" disabled={busy} onClick={() => save(f)}>Save</button>
        {!isOwner && !isMe && (confirm ? (
          <button className="btn danger" disabled={busy} onClick={remove}>Yes, remove {user.name.split(" ")[0]}</button>
        ) : (
          <button className="btn danger" disabled={busy} onClick={() => setConfirm(true)}>Remove</button>
        ))}
        <button className="btn" disabled={busy} onClick={close}>Close</button>
      </div>
    </div>
  );
}

/* ---------- Settings tab ---------- */
function SettingsTab({ data, canEdit, reload, say }) {
  const [points, setPoints] = useState(data.settings.points);
  const [far, setFar] = useState(data.settings.farMeters);
  const [brands, setBrands] = useState(data.settings.brands.join(", "));
  const [daily, setDaily] = useState(data.settings.dailyVisits);
  const [reorder, setReorder] = useState(data.settings.reorderDays);
  const [maxMargin, setMaxMargin] = useState(data.settings.maxMargin);
  const [routeAccess, setRouteAccess] = useState(data.settings.routeAccess || {});
  const [tvRoutes, setTvRoutes] = useState(!!data.settings.tvRoutes);
  const [busy, setBusy] = useState(false);
  async function refreshProducts() {
    setBusy(true);
    setErr("");
    try {
      const out = await api.admin("refreshProducts", {});
      await reload();
      say(`${out.count} products loaded from CRM.`);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }
  const [err, setErr] = useState("");
  useEffect(() => {
    setPoints(data.settings.points);
    setFar(data.settings.farMeters);
    setBrands(data.settings.brands.join(", "));
    setDaily(data.settings.dailyVisits);
    setReorder(data.settings.reorderDays);
    setMaxMargin(data.settings.maxMargin);
    setRouteAccess(data.settings.routeAccess || {});
    setTvRoutes(!!data.settings.tvRoutes);
  }, [data.settings]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api.admin("saveSettings", { settings: { points, farMeters: far, dailyVisits: daily, reorderDays: reorder, maxMargin, routeAccess, tvRoutes, brands: brands.split(",").map((b) => b.trim()).filter(Boolean) } });
      await reload();
      say("Settings saved. Leaderboards now use the new rules.");
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }
  const rule = (key, label, hint) => (
    <label className="field">
      {label}
      <input type="number" min="0" max="1000" value={points[key]} disabled={!canEdit} onChange={(e) => setPoints({ ...points, [key]: e.target.value })} />
      <small>{hint}</small>
    </label>
  );
  const status = [
    ["Saving check-ins to Zoho CRM", data.features.crm],
    ["Shelf photos", data.features.photos],
    ["Office TV link", data.features.tv],
  ];
  return (
    <main className="shell single">
      <section className="panel">
        <form className="card" onSubmit={save}>
          <div>
            <h2>Points rules</h2>
            <p className="muted small">Changing a rule re-scores every leaderboard straight away, including past days.</p>
          </div>
          <div className="two">
            {rule("visit", "Each check-in", "Given for every saved visit.")}
            {rule("newShop", "New shop added", "Extra, on top of the check-in.")}
          </div>
          <div className="two">
            {rule("firstOrder", "First order from a shop", "Extra, the first time a shop buys.")}
            {rule("repeatOrder", "Repeat order", "Extra, every later order.")}
          </div>
          <h2>Targets</h2>
          <div className="two">
            <label className="field">
              Visits each person should make in a day
              <input type="number" min="1" max="100" value={daily} disabled={!canEdit} onChange={(e) => setDaily(e.target.value)} />
              <small>Shown as the daily target on the field screen.</small>
            </label>
            <label className="field">
              Ask a buying shop for a reorder after this many days
              <input type="number" min="3" max="120" value={reorder} disabled={!canEdit} onChange={(e) => setReorder(e.target.value)} />
              <small>Puts the shop on the focus list.</small>
            </label>
          </div>
          <div>
            <h2>Travel map</h2>
            <p className="muted small">The route a person travelled and the heat map are private. You and view-only accounts always see them. Field users see nothing unless you allow it here.</p>
          </div>
          {data.users.filter((u) => u.role === "rep").map((u) => (
            <label className="field" key={u.email}>
              {u.name} can see
              <select value={routeAccess[u.email] || "none"} disabled={!canEdit} onChange={(e) => setRouteAccess({ ...routeAccess, [u.email]: e.target.value })}>
                <option value="none">No travel routes</option>
                <option value="own">Only their own route</option>
                <option value="team">Everyone's routes and live locations</option>
              </select>
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={tvRoutes} disabled={!canEdit} onChange={(e) => setTvRoutes(e.target.checked)} />
            <span>Draw travel routes on the office TV</span>
          </label>
          <h2>Orders</h2>
          <label className="field">
            Highest margin a field user can give a shop, in %
            <input type="number" min="0" max="90" value={maxMargin} disabled={!canEdit} onChange={(e) => setMaxMargin(e.target.value)} />
            <small>The margin is taken off our CRM price for the whole order and is remembered for each shop.</small>
          </label>
          <div className="row plain">
            <span className="what">
              <b>{data.products.length} products from CRM</b>
              <small>{data.productsAt ? "Last read " + new Date(data.productsAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + ". Names and prices refresh every 6 hours." : "Not read yet."}</small>
            </span>
            {canEdit && <button type="button" className="btn small" disabled={busy} onClick={refreshProducts}>Refresh now</button>}
          </div>
          <h2>Check-in rules</h2>
          <label className="field">
            Mark a check-in as far when it is more than this many metres from the shop
            <input type="number" min="20" max="5000" value={far} disabled={!canEdit} onChange={(e) => setFar(e.target.value)} />
            <small>Far check-ins are still saved. They are flagged so you can ask about them.</small>
          </label>
          <label className="field">
            Competitor brands the team can tick, separated by commas
            <input value={brands} disabled={!canEdit} onChange={(e) => setBrands(e.target.value)} />
          </label>
          {err && <p className="error">{err}</p>}
          {canEdit && <button className="btn solid" disabled={busy}>Save settings</button>}
        </form>
        <div className="card">
          <h2>Connections</h2>
          <div className="rows">
            {status.map(([label, on]) => (
              <div key={label} className="row plain">
                <span className="what"><b>{label}</b></span>
                <span className={"pill " + (on ? "o-order" : "o-absent")}>{on ? "On" : "Not connected yet"}</span>
              </div>
            ))}
          </div>
          <p className="muted small">Connections are switched on in Railway. The README file in the field folder lists the steps.</p>
        </div>
      </section>
    </main>
  );
}

/* ---------- Export tab ---------- */
function ExportTab(ctx) {
  const { data, users, shops, reps, visits, person, outcome, say } = ctx;
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => toRows(visits, shops, users, data.settings.points), [visits, shops, users, data.settings.points]);
  const summary = useMemo(() => scoreboard(visits, person === "all" ? reps : reps.filter((r) => r.email === person), data.settings.points), [visits, reps, person, data.settings.points]);
  const stamp = data.from === data.to ? data.from : `${data.from}_to_${data.to}`;
  const filterLine =
    `Dates: ${data.from === data.to ? data.from : data.from + " to " + data.to} · ` +
    `Person: ${person === "all" ? "Everyone" : users[person] ? users[person].name : person} · ` +
    `Outcome: ${outcome === "all" ? "All" : OUTCOMES[outcome]}`;

  async function pdf() {
    setBusy(true);
    try {
      await downloadPdf({ rows, summary, filterLine, name: `raymiyo-field-${stamp}.pdf` });
    } catch (e) {
      say("The PDF could not be made: " + e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shell single">
      <section className="panel">
        <div className="card">
          <div>
            <h2>Export check-ins</h2>
            <p className="muted small">Pick the dates, person and outcome. The file contains exactly what the preview shows.</p>
          </div>
          <Filters {...ctx} withOutcome />
          <div className="stats">
            <div className="stat"><b>{rows.length}</b><span>Check-ins</span></div>
            <div className="stat"><b>{rows.filter((r) => r.value > 0).length}</b><span>Orders</span></div>
            <div className="stat hot"><b>{money(rows.reduce((t, r) => t + r.value, 0))}</b><span>Order value</span></div>
          </div>
          <div className="chips">
            <button className="btn solid" disabled={busy || !rows.length} onClick={pdf}><Download size={16} /> {busy ? "Making the PDF…" : "Download PDF"}</button>
            <button className="btn" disabled={!rows.length} onClick={() => downloadCsv(rows, `raymiyo-field-${stamp}.csv`)}><Download size={16} /> Download Excel file (CSV)</button>
          </div>
        </div>
        <div className="card">
          <h3>Preview</h3>
          <div className="rows onlyPhone">
            {rows.slice(0, 100).map((r, i) => (
              <div key={i} className="row plain">
                <span className="what">
                  <b>{r.shop}</b>
                  <small>{r.date} · {r.time} · {r.person} · {r.outcome}{r.area ? " · " + r.area : ""}</small>
                </span>
                <span className="pill stage">{r.value ? money(r.value) : r.points + " pts"}</span>
              </div>
            ))}
          </div>
          <div className="tablewrap onlyWide">
            <table>
              <thead>
                <tr><th>Date</th><th>Time</th><th>Person</th><th>Shop</th><th>Area</th><th>Outcome</th><th className="num">Order</th><th className="num">Pts</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={i}><td>{r.date}</td><td>{r.time}</td><td>{r.person}</td><td>{r.shop}</td><td>{r.area}</td><td>{r.outcome}</td><td className="num">{r.value ? money(r.value) : ""}</td><td className="num">{r.points}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && <p className="muted">No check-ins for these filters.</p>}
          {rows.length > 100 && <p className="muted small">Showing the first 100 of {rows.length}. The file has all of them.</p>}
        </div>
      </section>
    </main>
  );
}
