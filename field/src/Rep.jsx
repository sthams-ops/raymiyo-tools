// The field user's screen: start the day, check in at shops, see today's race.
import { useEffect, useMemo, useState } from "react";
import { Camera, ChevronRight, MapPin, Play, Search, Square } from "lucide-react";
import { api } from "./api.js";
import { submit, flush, discard } from "./outbox.js";
import { getPosition, shrinkPhoto } from "./geo.js";
import MapView from "./MapView.jsx";
import { Board, VisitRow, VisitFacts, FocusList, firstName } from "./ui.jsx";
import { buildMapData, indexBy } from "./mapdata.js";
import { isAndroidApp, startTracking, stopTracking } from "./tracking.js";
import { OUTCOMES, distanceMeters, visitPoints, focusList, findDuplicate, phoneKey, orderTotals, shopOwes, money } from "../shared/rules.js";

const fmtDist = (m) => (m < 1000 ? m + " m" : (m / 1000).toFixed(1) + " km");

export default function Rep({ data, reload, say, waiting = [] }) {
  const me = data.me;
  const day = data.days[me.email] || null;
  const started = !!(day && day.start && !day.end);
  const [step, setStep] = useState("home");
  const [pos, setPos] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("today");
  const [view, setView] = useState("focus");
  const [shopQ, setShopQ] = useState("");

  // Android app only: share location all the time between Start day and End day.
  useEffect(() => {
    if (!isAndroidApp()) return;
    if (started) startTracking((text) => setErr(text));
    else stopTracking();
  }, [started]);

  const users = useMemo(() => indexBy(data.users, "email"), [data.users]);
  const shops = useMemo(() => indexBy(data.shops, "id"), [data.shops]);
  const todays = useMemo(() => data.visits.filter((v) => v.date === data.today && v.rep === me.email), [data.visits, data.today, me.email]);
  const mine = data.board.today.find((r) => r.email === me.email) || { visits: 0, orders: 0, points: 0 };
  const mapData = useMemo(
    () => buildMapData({ visits: todays, shops: data.shops.filter((s) => s.owner === me.email), users: data.users, days: data.days, tracks: data.tracks }),
    [todays, data.shops, data.users, data.days, data.tracks, me.email]
  );
  const focus = useMemo(() => focusList(data.shops, data.today, { owner: me.email, reorderDays: data.settings.reorderDays }), [data.shops, data.today, me.email, data.settings.reorderDays]);
  const twin = useMemo(
    () => (step === "pick" && pos && ((draft.newName || "").trim().length >= 3 || phoneKey(draft.newPhone)) ? findDuplicate(data.shops, { name: draft.newName, phone: draft.newPhone, lat: pos.lat, lng: pos.lng }) : null),
    [step, pos, draft.newName, draft.newPhone, data.shops]
  );
  const areas = useMemo(() => [...new Set(data.shops.map((s) => s.area).filter(Boolean))].sort(), [data.shops]);
  const set = (patch) => {
    setErr("");
    setDraft((d) => ({ ...d, ...patch }));
  };

  async function dayAction(action) {
    setErr("");
    setBusy(action);
    try {
      const p = await getPosition();
      const r = await submit("day", { action, ...p }, { user: me.email, label: action === "start" ? "Start day" : "End day" });
      if (!r.queued) await reload();
      say(r.queued ? (action === "start" ? "Day started. No signal, so it is saved on this phone for now." : "Day ended. No signal, so it is saved on this phone for now.") : action === "start" ? "Day started. Location saved." : "Day ended. Good work today.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  async function beginCheckin() {
    setErr("");
    setBusy("locating");
    try {
      const p = await getPosition();
      setPos(p);
      setDraft({});
      setQuery("");
      setSel(null);
      setStep("pick");
      api.day("ping", p).catch(() => {});
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  const near = useMemo(() => {
    if (!pos) return [];
    const q = query.trim().toLowerCase();
    return data.shops
      .filter((s) => (q ? s.name.toLowerCase().includes(q) || (s.area || "").toLowerCase().includes(q) || (phoneKey(q).length >= 4 && phoneKey(s.phone).includes(phoneKey(q))) : s.active !== false))
      .map((s) => ({ s, d: distanceMeters([pos.lat, pos.lng], [s.lat, s.lng]) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, q ? 12 : 6);
  }, [pos, query, data.shops]);

  async function pickShop(shop) {
    setErr("");
    if (shop.active === false) {
      setBusy("restore");
      try {
        await api.shopAct(shop.id, "restore");
        await reload();
        say(`${shop.name} is active again.`);
      } catch (e) {
        setBusy("");
        return setErr(e.message || "Could not restore the shop. Try again.");
      }
      setBusy("");
    }
    set({ shopId: shop.id, isNew: false });
    setStep("log");
  }

  function addShop() {
    if (!(draft.newName || "").trim()) return setErr("Type the shop name first.");
    if (!phoneKey(draft.newPhone)) return setErr("Add the shop's phone number. Ask the owner if it is not on the signboard.");
    if (twin) return setErr(twin.shop.active === false ? `${twin.shop.name} is already saved but archived. Tap "Restore and use this shop".` : `${twin.shop.name} is already saved. Tap "Use this shop".`);
    set({ isNew: true, shopId: null });
    setStep("log");
  }

  async function save() {
    if (!draft.outcome) return setErr("Pick what happened at the shop.");
    const value = Number(String(draft.value || "").replace(/[^0-9]/g, ""));
    const hasList = data.products.length > 0;
    const items = Object.entries(draft.qty || {}).map(([id, qty]) => ({ id, qty: Number(qty) })).filter((i) => i.qty > 0);
    if (draft.outcome === "order" && hasList && !items.length) return setErr("Add at least one product to the order.");
    if (draft.outcome === "order" && !hasList && !(value > 0)) return setErr("Enter the order amount in rupees.");
    if (!draft.isNew && shops[draft.shopId] && !phoneKey(shops[draft.shopId].phone) && !phoneKey(draft.phone)) return setErr("Add the shop's phone number.");
    setErr("");
    setBusy("saving");
    try {
      // The photo is shrunk here and travels with the check-in, so it is not lost without signal.
      let photoData = "";
      if (draft.file && data.features.photos) {
        try {
          photoData = await shrinkPhoto(draft.file);
        } catch {}
      }
      const shopPart = draft.isNew
        ? { shopName: draft.newName, shopType: draft.newType || "Retailer", area: draft.newArea || "", phone: draft.newPhone || "" }
        : { shopId: draft.shopId, phone: draft.phone || "" };
      const shopLabel = draft.isNew ? draft.newName : (shops[draft.shopId] && shops[draft.shopId].name) || "a shop";
      const r = await submit(
        "visit",
        {
          ...shopPart,
          outcome: draft.outcome,
          value,
          items: draft.outcome === "order" ? items : [],
          margin: draft.margin === undefined || draft.margin === "" ? undefined : Number(draft.margin),
          terms: draft.terms || "Cash",
          brands: draft.brands || [],
          note: draft.note || "",
          followUp: draft.followUp || "",
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
        },
        { user: me.email, label: `${OUTCOMES[draft.outcome] || "Check-in"} at ${shopLabel}`, photoData }
      );
      setStep("home");
      if (r.queued) {
        say("No signal. The check-in is saved on this phone and will send by itself.");
      } else {
        await reload();
        setSel(r.out.visit.id);
        say(`Saved. +${visitPoints(r.out.visit, data.settings.points)} points.`);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  const map = <MapView className="map-rep" {...mapData} selected={sel} onSelect={setSel} />;

  if (step === "pick") {
    return (
      <main className="shell">
        {map}
        <section className="panel">
          <div className="card">
            <div>
              <p className="eyebrow">
                <MapPin size={14} /> Location saved, accurate to about {pos.accuracy} m
              </p>
              <h2>Which shop are you at?</h2>
            </div>
            <label className="search">
              <Search size={18} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shops by name, area or phone" aria-label="Search shops" />
            </label>
            <div className="rows">
              {near.map(({ s, d }) => (
                <button key={s.id} className="row" disabled={!!busy} onClick={() => pickShop(s)}>
                  <span className="when">{fmtDist(d)}</span>
                  <span className="what">
                    <b>{s.name}</b>
                    <small>
                      {s.type}
                      {s.area ? ", " + s.area : ""}
                      {s.owner !== me.email && users[s.owner] ? ` · ${firstName(users[s.owner])}'s shop` : ""}
                      {s.active === false ? " · Archived, tap to restore and use" : ""}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
              {!near.length && <p className="muted">{query ? "No shop matches that search." : "No shops saved yet. Add the first one below."}</p>}
            </div>
          </div>
          <div className="card">
            <h2>Shop not on the list?</h2>
            <label className="field">
              Shop name
              <input value={draft.newName || ""} onChange={(e) => set({ newName: e.target.value })} placeholder="Name on the signboard" autoComplete="off" />
            </label>
            <div className="chips" role="group" aria-label="Shop type">
              {["Retailer", "Wholesaler"].map((t) => (
                <button key={t} className="chip" aria-pressed={(draft.newType || "Retailer") === t} onClick={() => set({ newType: t })}>
                  {t}
                </button>
              ))}
            </div>
            <div className="two">
              <label className="field">
                Area
                <input value={draft.newArea || ""} onChange={(e) => set({ newArea: e.target.value })} placeholder="e.g. Kalimati" list="areas" autoComplete="off" />
              </label>
              <label className="field">
                Phone
                <input value={draft.newPhone || ""} onChange={(e) => set({ newPhone: e.target.value })} inputMode="tel" placeholder="98XXXXXXXX" autoComplete="off" required />
              </label>
            </div>
            {twin && (
              <div className="warnbox">
                <span>
                  This looks like a shop that is already saved: <b>{twin.shop.name}</b>
                  {twin.shop.area ? ", " + twin.shop.area : ""} ({twin.why === "phone" ? "same phone number" : "same name, close to here"}).
                </span>
                {twin.shop.active === false && <span>It was archived. You can bring it back and check in.</span>}
                <button className="btn solid" disabled={!!busy} onClick={() => pickShop(twin.shop)}>
                  {twin.shop.active === false ? "Restore and use this shop" : "Use this shop"}
                </button>
              </div>
            )}
            <datalist id="areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
            {err && <p className="error">{err}</p>}
            <button className="btn" onClick={addShop}>Add shop and continue</button>
          </div>
          <button className="link" onClick={() => { setStep("home"); setErr(""); }}>Cancel check-in</button>
        </section>
      </main>
    );
  }

  if (step === "log") {
    const shop = draft.isNew ? { name: draft.newName, type: draft.newType || "Retailer", area: draft.newArea } : shops[draft.shopId];
    const qty = draft.qty || {};
    const picked = data.products.filter((p) => qty[p.id] > 0).map((p) => ({ ...p, qty: Number(qty[p.id]) }));
    const margin = draft.margin === undefined ? shop.margin || 0 : draft.margin;
    const totals = orderTotals(picked, Number(margin) || 0);
    const pq = (draft.prodQ || "").trim().toLowerCase();
    const shown = data.products.filter((p) => !pq || (p.name + " " + p.code).toLowerCase().includes(pq));
    const setQty = (id, n) => set({ qty: { ...qty, [id]: Math.max(0, Math.min(9999, Math.round(Number(n) || 0))) } });
    const owes = draft.isNew ? 0 : shopOwes(shop);
    return (
      <main className="shell">
        {map}
        <section className="panel">
          <div className="card">
            <div>
              <p className="eyebrow">
                {shop.type}
                {shop.area ? ", " + shop.area : ""}
                {draft.isNew ? " · new shop" : ""}
              </p>
              <h2>{shop.name}</h2>
            </div>
            {!draft.isNew && !phoneKey(shop.phone) && (
              <label className="field">
                Shop phone number
                <input value={draft.phone || ""} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" placeholder="98XXXXXXXX" autoComplete="off" />
                <small>This shop has no number saved yet. Ask the owner.</small>
              </label>
            )}
            <div>
              <h3>What happened?</h3>
              <div className="chips" role="group" aria-label="Outcome">
                {Object.keys(OUTCOMES).map((k) => (
                  <button key={k} className={`chip pick-${k}`} aria-pressed={draft.outcome === k} onClick={() => set({ outcome: k })}>
                    {OUTCOMES[k]}
                  </button>
                ))}
              </div>
            </div>
            {draft.outcome === "order" && owes > 0 && <p className="warnbox">This shop still owes {money(owes)}. Ask about it before taking a new order.</p>}
            {draft.outcome === "order" && data.products.length > 0 && (
              <>
                <div>
                  <h3>Products ordered</h3>
                  <label className="search">
                    <Search size={18} />
                    <input value={draft.prodQ || ""} onChange={(e) => set({ prodQ: e.target.value })} placeholder="Search products" aria-label="Search products" />
                  </label>
                </div>
                <div className="prodList">
                  {shown.map((p, i) => (
                    <div key={p.id}>
                      {(i === 0 || shown[i - 1].category !== p.category) && <h3>{p.category}</h3>}
                      <div className={"prod" + (qty[p.id] > 0 ? " on" : "")}>
                        <span>
                          <b>{p.name}</b>
                          <small>{money(p.price)}</small>
                        </span>
                        <span className="step">
                          <button type="button" aria-label={"Less " + p.name} onClick={() => setQty(p.id, (qty[p.id] || 0) - 1)}>−</button>
                          <input inputMode="numeric" aria-label={"Quantity of " + p.name} value={qty[p.id] || ""} placeholder="0" onChange={(e) => setQty(p.id, e.target.value.replace(/[^0-9]/g, ""))} />
                          <button type="button" aria-label={"More " + p.name} onClick={() => setQty(p.id, (qty[p.id] || 0) + 1)}>+</button>
                        </span>
                      </div>
                    </div>
                  ))}
                  {!shown.length && <p className="muted">No product matches.</p>}
                </div>
                <label className="field">
                  This shop's margin, % off our price
                  <input value={margin} inputMode="decimal" onChange={(e) => set({ margin: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0" />
                  <small>Saved for this shop. Maximum {data.settings.maxMargin}%.</small>
                </label>
                <div className="totals">
                  <div><span>{picked.reduce((a, p) => a + p.qty, 0)} items</span><span>{money(totals.subtotal)}</span></div>
                  <div><span>Margin {Number(margin) || 0}%</span><span>− {money(totals.discount)}</span></div>
                  <div className="grand"><span>Shop pays</span><span>{money(totals.total)}</span></div>
                </div>
              </>
            )}
            {draft.outcome === "order" && (
              <>
                {!data.products.length && (
                  <label className="field">
                    Order amount in rupees
                    <input value={draft.value || ""} onChange={(e) => set({ value: e.target.value })} inputMode="numeric" placeholder="e.g. 8400" />
                  </label>
                )}
                <div className="chips" role="group" aria-label="Payment">
                  {["Cash", "Credit (Cheque)"].map((t) => (
                    <button key={t} className="chip" aria-pressed={(draft.terms || "Cash") === t} onClick={() => set({ terms: t })}>
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div>
              <h3>Other diaper brands on the shelf</h3>
              <div className="chips" role="group" aria-label="Brands on the shelf">
                {data.settings.brands.map((b) => {
                  const on = (draft.brands || []).includes(b);
                  return (
                    <button key={b} className="chip" aria-pressed={on} onClick={() => set({ brands: on ? draft.brands.filter((x) => x !== b) : [...(draft.brands || []), b] })}>
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>
            {(draft.outcome === "interested" || draft.outcome === "absent") && (
              <label className="field">
                {draft.outcome === "interested" ? "Follow up on" : "Come back on"} (optional)
                <input type="date" value={draft.followUp || ""} min={data.today} onChange={(e) => set({ followUp: e.target.value })} />
              </label>
            )}
            <label className="field">
              Note
              <textarea value={draft.note || ""} onChange={(e) => set({ note: e.target.value })} placeholder="What did the owner say?" maxLength={500} />
            </label>
            {data.features.photos && (
              <label className="field">
                <span>
                  <Camera size={14} /> Shelf photo{draft.file ? `: ${draft.file.name}` : " (optional)"}
                </span>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => set({ file: e.target.files && e.target.files[0] })} />
              </label>
            )}
            {err && <p className="error">{err}</p>}
            <button className="cta" onClick={save} disabled={busy === "saving"}>
              {busy === "saving" ? "Saving…" : "Save check-in"}
            </button>
          </div>
          <button className="link" onClick={() => { setStep("pick"); setErr(""); }}>Back to shop list</button>
        </section>
      </main>
    );
  }

  const chosen = sel && data.visits.find((v) => v.id === sel);
  const target = data.settings.dailyVisits;
  const urgent = focus.filter((f) => f.level === "overdue" || f.level === "today");
  const pushes = focus.filter((f) => f.level === "push");
  const soon = focus.filter((f) => f.level === "soon");
  const overdueCount = focus.filter((f) => f.level === "overdue").length;
  // One short line that tells the person where they stand.
  const week = data.board.week;
  const myRank = week.findIndex((r) => r.email === me.email);
  let nudge = "";
  if (overdueCount) nudge = `${overdueCount} overdue ${overdueCount === 1 ? "task" : "tasks"}. Clear ${overdueCount === 1 ? "it" : "them"} first.`;
  else if (myRank > 0) nudge = `${week[myRank - 1].points - week[myRank].points + 1} more points this week and you pass ${firstName(week[myRank - 1])}.`;
  else if (myRank === 0 && week.length > 1 && week[0].points > 0) nudge = `You lead this week by ${week[0].points - week[1].points} points. ${firstName(week[1])} is chasing.`;
  const stageRank = { "Repeat Buyer": 0, "First Order": 1, Interested: 2, Prospect: 3 };
  const myShops = data.shops
    .filter((s) => s.active !== false && s.owner === me.email)
    .filter((s) => !shopQ.trim() || (s.name + " " + (s.area || "")).toLowerCase().includes(shopQ.trim().toLowerCase()))
    .sort((a, b) => (stageRank[a.stage] ?? 3) - (stageRank[b.stage] ?? 3) || (a.lastVisit || "").localeCompare(b.lastVisit || ""));
  return (
    <main className="shell">
      {map}
      <section className="panel">
        <div className="card">
          <div>
            <p className="eyebrow">{started ? `Day started at ${day.start}` : day && day.end ? `Day ended at ${day.end}` : "Day not started"}</p>
            <h2>{started ? `${firstName(me)}, you are in the field` : `${firstName(me)}, ready to go?`}</h2>
            {isAndroidApp() && <p className="muted small">{started ? "Live location is on until you tap End day." : "Your location is only shared between Start day and End day."}</p>}
          </div>
          <div className="stats">
            <div className="stat"><b>{mine.visits}</b><span>Visits</span></div>
            <div className="stat"><b>{mine.orders}</b><span>Orders</span></div>
            <div className="stat hot"><b>{mine.points}</b><span>Points</span></div>
          </div>
          <div className="meter">
            <span>{mine.visits >= target ? `Target done: ${mine.visits} of ${target} visits. Keep going.` : `${mine.visits} of ${target} visits today, ${target - mine.visits} to go`}</span>
            <div className="bar"><i style={{ width: Math.min(100, Math.round((mine.visits / target) * 100)) + "%", background: mine.visits >= target ? "var(--ok)" : "var(--brand)" }} /></div>
          </div>
          {nudge && <p className="nudge">{nudge}</p>}
          {err && <p className="error">{err}</p>}
          {started ? (
            <button className="cta" onClick={beginCheckin} disabled={!!busy}>
              <MapPin size={20} /> {busy === "locating" ? "Finding your location…" : "Check in at a shop"}
            </button>
          ) : (
            <button className="cta" onClick={() => dayAction("start")} disabled={!!busy}>
              <Play size={20} /> {busy === "start" ? "Finding your location…" : "Start day"}
            </button>
          )}
        </div>

        {chosen && (
          <div className="card">
            <div className="head">
              <h2>{(shops[chosen.shopId] && shops[chosen.shopId].name) || chosen.shopName}</h2>
              <button className="btn small" onClick={() => setSel(null)}>Close</button>
            </div>
            <VisitFacts v={chosen} shop={shops[chosen.shopId]} user={users[chosen.rep]} points={data.settings.points} />
          </div>
        )}

        {waiting.length > 0 && (
          <div className="card waitcard">
            <div className="head">
              <h2>Waiting to send ({waiting.length})</h2>
              <button className="btn small" disabled={busy === "send"} onClick={async () => { setBusy("send"); const n = await flush(me.email).catch(() => 0); await reload(); setBusy(""); say(n ? `${n} sent.` : "Still no signal. It will send by itself."); }}>
                {busy === "send" ? "Sending…" : "Send now"}
              </button>
            </div>
            <p className="muted small">Saved on this phone. Keep working; these go to the office as soon as there is signal. Points show after they are sent.</p>
            <div className="rows">
              {waiting.map((w) => (
                <div key={w.id} className="row plain">
                  <span className="what">
                    <b>{w.label || "Saved item"}</b>
                    <small className={w.error ? "owes" : ""}>{w.error ? "Not accepted: " + w.error : "Saved at " + new Date(w.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>
                  </span>
                  {w.error && <button className="btn small danger" onClick={() => discard(w.id)}>Remove</button>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="card">
          <div className="head">
            <h2>{view === "focus" ? "Your focus list" : `My shops (${myShops.length})`}</h2>
            <div className="seg" role="group" aria-label="List">
              <button aria-pressed={view === "focus"} onClick={() => setView("focus")}>Focus</button>
              <button aria-pressed={view === "shops"} onClick={() => setView("shops")}>My shops</button>
            </div>
          </div>
          {view === "focus" && (
            <>
              {!focus.length && <p className="muted">Nothing waiting. Every new check-in adds its next step here, so you always know where to go.</p>}
              {urgent.length > 0 && (
                <div className="focusList">
                  <h3>Do these first ({urgent.length})</h3>
                  <FocusList items={urgent} reload={reload} say={say} user={me.email} waiting={waiting} />
                </div>
              )}
              {pushes.length > 0 && (
                <div className="focusList">
                  <h3>Push these shops ({pushes.length})</h3>
                  <FocusList items={pushes.slice(0, 8)} reload={reload} say={say} user={me.email} waiting={waiting} />
                </div>
              )}
              {soon.length > 0 && (
                <div className="focusList">
                  <h3>Coming up ({soon.length})</h3>
                  <FocusList items={soon.slice(0, 8)} reload={reload} say={say} user={me.email} waiting={waiting} />
                </div>
              )}
            </>
          )}
          {view === "shops" && (
            <>
              <label className="search">
                <Search size={18} />
                <input value={shopQ} onChange={(e) => setShopQ(e.target.value)} placeholder="Search my shops" aria-label="Search my shops" />
              </label>
              <div className="rows">
                {myShops.map((s) => (
                  <div key={s.id} className="row plain acts">
                    <span className="what">
                      <b>{s.name}</b>
                      <small>
                        {s.area || "Area not set"} · {s.orders} orders{s.lastVisit ? " · last visit " + s.lastVisit : ""}
                        {s.next ? ` · ${s.next.step} by ${s.next.due}` : ""}
                        {shopOwes(s) > 0 ? ` · owes ${money(shopOwes(s))}` : ""}
                      </small>
                    </span>
                    {s.phone && <a className="btn small" href={"tel:" + s.phone}>Call</a>}
                    <span className="pill stage">{s.stage || "Prospect"}</span>
                  </div>
                ))}
                {!myShops.length && <p className="muted">{shopQ ? "No shop matches." : "No shops yet. Shops you add at check-in become yours."}</p>}
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3>Today</h3>
          <div className="rows">
            {todays.length ? (
              todays.slice().reverse().map((v) => <VisitRow key={v.id} v={v} shop={shops[v.shopId]} selected={sel === v.id} onClick={() => setSel(v.id)} />)
            ) : (
              <p className="muted">No check-ins yet. Tap Check in when you reach a shop.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="head">
            <h3>The race</h3>
            <div className="seg" role="group" aria-label="Leaderboard period">
              {[["today", "Today"], ["week", "Week"], ["month", "Month"]].map(([k, label]) => (
                <button key={k} aria-pressed={period === k} onClick={() => setPeriod(k)}>{label}</button>
              ))}
            </div>
          </div>
          <Board rows={data.board[period]} />
        </div>

        {started && (
          <button className="link" onClick={() => dayAction("end")} disabled={!!busy}>
            <Square size={14} /> {busy === "end" ? "Finding your location…" : "End day"}
          </button>
        )}
      </section>
    </main>
  );
}
