// The field user's screen: start the day, check in at shops, see today's race.
import { useMemo, useState } from "react";
import { Camera, ChevronRight, MapPin, Play, Search, Square } from "lucide-react";
import { api } from "./api.js";
import { getPosition, shrinkPhoto } from "./geo.js";
import MapView from "./MapView.jsx";
import { Board, VisitRow, VisitFacts, firstName } from "./ui.jsx";
import { buildMapData, indexBy } from "./mapdata.js";
import { OUTCOMES, distanceMeters, visitPoints } from "../shared/rules.js";

const fmtDist = (m) => (m < 1000 ? m + " m" : (m / 1000).toFixed(1) + " km");

export default function Rep({ data, reload, say }) {
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

  const users = useMemo(() => indexBy(data.users, "email"), [data.users]);
  const shops = useMemo(() => indexBy(data.shops, "id"), [data.shops]);
  const todays = useMemo(() => data.visits.filter((v) => v.date === data.today && v.rep === me.email), [data.visits, data.today, me.email]);
  const mine = data.board.today.find((r) => r.email === me.email) || { visits: 0, orders: 0, points: 0 };
  const mapData = useMemo(
    () => buildMapData({ visits: todays, shops: data.shops.filter((s) => s.owner === me.email), users: data.users, days: data.days }),
    [todays, data.shops, data.users, data.days, me.email]
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
      await api.day(action, p);
      await reload();
      say(action === "start" ? "Day started. Location saved." : "Day ended. Good work today.");
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
      .filter((s) => s.active !== false && (!q || s.name.toLowerCase().includes(q) || (s.area || "").toLowerCase().includes(q)))
      .map((s) => ({ s, d: distanceMeters([pos.lat, pos.lng], [s.lat, s.lng]) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, q ? 12 : 6);
  }, [pos, query, data.shops]);

  function addShop() {
    if (!(draft.newName || "").trim()) return setErr("Type the shop name first.");
    set({ isNew: true, shopId: null });
    setStep("log");
  }

  async function save() {
    if (!draft.outcome) return setErr("Pick what happened at the shop.");
    const value = Number(String(draft.value || "").replace(/[^0-9]/g, ""));
    if (draft.outcome === "order" && !(value > 0)) return setErr("Enter the order amount in rupees.");
    setErr("");
    setBusy("saving");
    try {
      let photo = "";
      let photoNote = "";
      if (draft.file && data.features.photos) {
        try {
          photo = (await api.photo(await shrinkPhoto(draft.file))).url;
        } catch {
          photoNote = " The photo could not be saved.";
        }
      }
      const shopPart = draft.isNew
        ? { shopName: draft.newName, shopType: draft.newType || "Retailer", area: draft.newArea || "", phone: draft.newPhone || "" }
        : { shopId: draft.shopId };
      const out = await api.createVisit({
        ...shopPart,
        outcome: draft.outcome,
        value,
        terms: draft.terms || "Cash",
        brands: draft.brands || [],
        note: draft.note || "",
        photo,
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
      });
      await reload();
      setStep("home");
      setSel(out.visit.id);
      say(`Saved. +${visitPoints(out.visit, data.settings.points)} points.${photoNote}`);
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
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shops by name or area" aria-label="Search shops" />
            </label>
            <div className="rows">
              {near.map(({ s, d }) => (
                <button key={s.id} className="row" onClick={() => { set({ shopId: s.id, isNew: false }); setStep("log"); }}>
                  <span className="when">{fmtDist(d)}</span>
                  <span className="what">
                    <b>{s.name}</b>
                    <small>
                      {s.type}
                      {s.area ? ", " + s.area : ""}
                      {s.owner !== me.email && users[s.owner] ? ` · ${firstName(users[s.owner])}'s shop` : ""}
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
                Phone (optional)
                <input value={draft.newPhone || ""} onChange={(e) => set({ newPhone: e.target.value })} inputMode="tel" placeholder="98XXXXXXXX" autoComplete="off" />
              </label>
            </div>
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
            {draft.outcome === "order" && (
              <>
                <label className="field">
                  Order amount in rupees
                  <input value={draft.value || ""} onChange={(e) => set({ value: e.target.value })} inputMode="numeric" placeholder="e.g. 8400" />
                </label>
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
  return (
    <main className="shell">
      {map}
      <section className="panel">
        <div className="card">
          <div>
            <p className="eyebrow">{started ? `Day started at ${day.start}` : day && day.end ? `Day ended at ${day.end}` : "Day not started"}</p>
            <h2>{started ? `${firstName(me)}, you are in the field` : `${firstName(me)}, ready to go?`}</h2>
          </div>
          <div className="stats">
            <div className="stat"><b>{mine.visits}</b><span>Visits</span></div>
            <div className="stat"><b>{mine.orders}</b><span>Orders</span></div>
            <div className="stat hot"><b>{mine.points}</b><span>Points</span></div>
          </div>
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
