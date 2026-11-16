// Small pieces used on every screen.
import { useEffect, useState } from "react";
import { Camera, Check, Navigation, Phone, X } from "lucide-react";
import { api } from "./api.js";
import { shrinkPhoto } from "./geo.js";
import { OUTCOMES, money, visitPoints, shopOwes } from "../shared/rules.js";

// A photo that opens full screen inside the app, with a clear way back.
export function Photo({ src, alt }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <button type="button" className="shotBtn" onClick={() => setOpen(true)} aria-label="Open photo">
        <img className="shot" src={src} alt={alt} />
      </button>
      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setOpen(false)}>
          <img src={src} alt={alt} />
          <button type="button" className="lightClose" onClick={() => setOpen(false)}>
            <X size={20} /> Close
          </button>
        </div>
      )}
    </>
  );
}

const LEVEL_LABEL = { overdue: "Overdue", today: "Today", push: "Push", soon: "Coming up" };

// Delivery or collection: how is the shop paying? Cash, a cheque (date and
// photo, the same as CRM asks for) or on a later date.
function PayForm({ item, allowLater, onSave, onCancel, busy, err }) {
  const amountDue = item.due_ ? item.due_.amount : (item.shop.next && item.shop.next.amount) || "";
  const [f, setF] = useState({ type: "", amount: String(amountDue || ""), date: "", file: null });
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const types = [["cash", "Cash"], ["cheque", "Cheque"], ...(allowLater ? [["later", "Will pay later"]] : [])];
  return (
    <div className="payform">
      <h3>{allowLater ? "Delivered. How is the shop paying?" : "Payment received"}</h3>
      <div className="chips" role="group" aria-label="Payment">
        {types.map(([k, label]) => (
          <button key={k} type="button" className="chip" aria-pressed={f.type === k} onClick={() => set({ type: k })}>{label}</button>
        ))}
      </div>
      {f.type && (
        <label className="field">
          Amount in rupees
          <input value={f.amount} inputMode="decimal" onChange={(e) => set({ amount: e.target.value })} />
        </label>
      )}
      {f.type === "cheque" && (
        <>
          <label className="field">
            Date written on the cheque
            <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label className="field">
            <span><Camera size={14} /> Photo of the cheque{f.file ? `: ${f.file.name}` : ""}</span>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => set({ file: e.target.files && e.target.files[0] })} />
          </label>
        </>
      )}
      {f.type === "later" && (
        <label className="field">
          The shop will pay on
          <input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
      )}
      {err && <p className="error">{err}</p>}
      <div className="chips">
        <button type="button" className="btn solid" disabled={busy || !f.type} onClick={() => onSave(f)}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// One line of the to-do list: what to do at which shop, with call and directions.
function FocusRow({ item, owner, canAct, act, open, setOpen, busy, err }) {
  const s = item.shop;
  const paying = open === item.key;
  const owes = shopOwes(s);
  return (
    <div className={"focus lv-" + item.level}>
      <div className="focusTop">
        <span className={"tag lv-" + item.level}>{LEVEL_LABEL[item.level]}</span>
        <small>{item.due ? fmtDay(item.due) + " · " : ""}{item.why}</small>
      </div>
      <b>{s.name}</b>
      <p>
        {item.title}
        {s.area ? " · " + s.area : ""}
        {owner ? " · " + firstName(owner) : ""}
      </p>
      {owes > 0 && item.kind !== "collect" && item.kind !== "cheque" && <p className="owes">Owes {money(owes)}</p>}
      {s.lastNote && !item.due_ && <p className="quote">“{s.lastNote}”</p>}
      {!paying && (
        <div className="focusActs">
          {s.phone && (
            <a className="btn small" href={"tel:" + s.phone}>
              <Phone size={15} /> Call
            </a>
          )}
          <a className="btn small" href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noreferrer">
            <Navigation size={15} /> Directions
          </a>
          {canAct && item.kind === "deliver" && <button className="btn small" onClick={() => setOpen(item.key)}><Check size={15} /> Delivered</button>}
          {canAct && item.kind === "collect" && <button className="btn small" onClick={() => setOpen(item.key)}><Check size={15} /> Collected</button>}
          {canAct && item.kind === "cheque" && item.late >= 0 && <button className="btn small" disabled={busy} onClick={() => act(item, "cleared")}><Check size={15} /> Cleared</button>}
          {canAct && (item.kind === "follow" || item.kind === "revisit") && <button className="btn small" disabled={busy} onClick={() => act(item, "done")}><Check size={15} /> Done</button>}
        </div>
      )}
      {paying && <PayForm item={item} allowLater={item.kind === "deliver"} busy={busy} err={err} onCancel={() => setOpen(null)} onSave={(f) => act(item, item.kind === "deliver" ? "deliver" : "collect", f)} />}
    </div>
  );
}

// The to-do list with its buttons. users is only passed on the admin screen,
// where each line also names the person.
export function FocusList({ items, users, canAct = true, reload, say }) {
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function act(item, action, f) {
    setBusy(true);
    setErr("");
    try {
      const extra = { visitId: item.due_ ? item.due_.visitId : undefined };
      if (f) {
        let photo = "";
        if (f.type === "cheque") {
          if (!f.file) throw new Error("Take a photo of the cheque.");
          photo = (await api.photo(await shrinkPhoto(f.file))).url;
        }
        extra.pay = { type: f.type, amount: Number(String(f.amount).replace(/[^0-9.]/g, "")), date: f.date, photo };
      }
      const out = await api.shopAct(item.shop.id, action, extra);
      await reload();
      setOpen(null);
      const waiting = out.visit && out.visit.payCrm === "waiting";
      say(action === "done" ? "Ticked off. Well done." : action === "cleared" ? "Cheque marked as cleared." : waiting ? "Saved. It goes on the CRM invoice once the order is marked Delivered there." : "Saved.");
    } catch (e) {
      setErr(e.message);
      if (!f) say(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="focusList">
      {items.map((f) => (
        <FocusRow key={f.key || f.shop.id} item={{ ...f, key: f.key || f.shop.id }} owner={users ? users[f.shop.owner] : null} canAct={canAct} act={act} open={open} setOpen={(k) => { setErr(""); setOpen(k); }} busy={busy} err={err} />
      ))}
    </div>
  );
}

export function Pill({ outcome }) {
  return <span className={`pill o-${outcome}`}>{OUTCOMES[outcome] || outcome}</span>;
}

export function Avatar({ user, size = 36 }) {
  const name = (user && user.name) || "?";
  return (
    <span className="avatar" aria-hidden="true" style={{ background: (user && user.color) || "#64748B", width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {name[0].toUpperCase()}
    </span>
  );
}

export function fmtDay(date) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export const firstName = (user) => ((user && user.name) || "").split(" ")[0] || "Someone";

// Leaderboard. rows come from the server already sorted.
export function Board({ rows, big }) {
  if (!rows || !rows.length) return <p className="muted">No field users on the team yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.points));
  return (
    <ol className={"board" + (big ? " big" : "")}>
      {rows.map((r, i) => (
        <li key={r.email}>
          <span className={"rank" + (i === 0 && r.points > 0 ? " lead" : "")}>{i + 1}</span>
          <div className="who">
            <b>
              <Avatar user={r} size={big ? 40 : 26} /> {r.name}
            </b>
            <small>
              {r.visits} visits · {r.orders} orders · {money(r.value)}
            </small>
            <div className="bar">
              <i style={{ width: Math.round((r.points / max) * 100) + "%", background: r.color }} />
            </div>
          </div>
          <div className="pts">
            {r.points}
            <small>points</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function VisitRow({ v, shop, user, showRep, showDate, selected, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className="row" aria-current={selected ? "true" : undefined} onClick={onClick}>
      <span className="when">
        {showDate && <em>{fmtDay(v.date)}</em>}
        {v.time}
      </span>
      <span className="what">
        <b>{(shop && shop.name) || v.shopName}</b>
        <small>
          {showRep && user ? firstName(user) + " · " : ""}
          {(shop && shop.area) || v.area || "Area not set"}
          {v.value ? " · " + money(v.value) : ""}
          {v.far ? " · far from shop" : ""}
        </small>
      </span>
      <Pill outcome={v.outcome} />
    </Tag>
  );
}

// Read-only facts about one check-in. Screens add their own buttons under it.
export function VisitFacts({ v, shop, user, points }) {
  return (
    <dl className="facts">
      <dt>Shop</dt>
      <dd>
        {(shop && shop.type) || "Shop"}
        {(shop && shop.area) || v.area ? ", " + ((shop && shop.area) || v.area) : ""}
        {shop && shop.phone ? " · " + shop.phone : ""}
      </dd>
      <dt>Visited by</dt>
      <dd>
        {(user && user.name) || v.rep} · {fmtDay(v.date)} at {v.time}
      </dd>
      {v.outcome === "order" && (
        <>
          <dt>Order</dt>
          <dd>
            {money(v.value)} · {v.terms} · {v.first ? "first order" : "repeat order"}
          </dd>
        </>
      )}
      {v.items && v.items.length > 0 && (
        <>
          <dt>Products</dt>
          <dd>
            {v.items.map((i) => <span key={i.id} className="line">{i.qty} × {i.name}</span>)}
            <span className="line muted">{money(v.subtotal)} less {v.margin}% margin</span>
          </dd>
        </>
      )}
      {v.deliveredOn && (
        <>
          <dt>Delivered</dt>
          <dd>
            {fmtDay(v.deliveredOn)}
            {v.pay ? " · " + (v.pay.type === "cash" ? `cash ${money(v.pay.amount)}` : v.pay.type === "cheque" ? `cheque ${money(v.pay.amount)} dated ${fmtDay(v.pay.date)}` : `will pay ${money(v.pay.amount)} on ${fmtDay(v.pay.date)}`) : ""}
            {v.pay && v.pay.photo && <Photo src={v.pay.photo} alt="Cheque" />}
          </dd>
        </>
      )}
      {v.nextStep && v.nextStep !== "No action" && (
        <>
          <dt>Next step</dt>
          <dd>
            {v.nextStep}
            {v.followUp ? " by " + fmtDay(v.followUp) : ""}
          </dd>
        </>
      )}
      {v.brands && v.brands.length > 0 && (
        <>
          <dt>On the shelf</dt>
          <dd>{v.brands.join(", ")}</dd>
        </>
      )}
      <dt>Note</dt>
      <dd>{v.note || "No note"}</dd>
      <dt>Location</dt>
      <dd>
        <a href={`https://www.google.com/maps?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer">
          {v.lat.toFixed(5)}, {v.lng.toFixed(5)}
        </a>
        {v.newShop ? " · new shop" : ` · ${v.distance} m from the shop`}
        {v.far ? " (far)" : ""}
      </dd>
      {v.photo && (
        <>
          <dt>Photo</dt>
          <dd>
            <Photo src={v.photo} alt={`Shelf at ${(shop && shop.name) || v.shopName}`} />
          </dd>
        </>
      )}
      <dt>Points</dt>
      <dd>+{visitPoints(v, points)}</dd>
      {v.crm && v.crm !== "off" && (
        <>
          <dt>CRM</dt>
          <dd>
            {v.crm === "ok" ? "Saved to Zoho CRM" : "Not saved to CRM: " + (v.crmError || "unknown error")}
            {v.soId ? " · Sales Order created" : ""}
            {v.crmNote ? <span className="line error">{v.crmNote}</span> : null}
            {v.payCrm === "waiting" && <span className="line">Payment waits for the order to be marked Delivered in CRM.</span>}
            {v.payCrm === "error" && <span className="line error">Payment not on the invoice: {v.payCrmError}</span>}
          </dd>
        </>
      )}
    </dl>
  );
}

export function Toast({ text }) {
  return (
    <div className={"toast" + (text ? " on" : "")} role="status">
      {text}
    </div>
  );
}
