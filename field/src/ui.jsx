// Small pieces used on every screen.
import { OUTCOMES, money, visitPoints } from "../shared/rules.js";

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
            <a href={v.photo} target="_blank" rel="noreferrer">
              <img className="shot" src={v.photo} alt={`Shelf at ${(shop && shop.name) || v.shopName}`} />
            </a>
          </dd>
        </>
      )}
      <dt>Points</dt>
      <dd>+{visitPoints(v, points)}</dd>
      {v.crm && v.crm !== "off" && (
        <>
          <dt>CRM</dt>
          <dd>{v.crm === "ok" ? "Saved to Zoho CRM" : "Not saved to CRM: " + (v.crmError || "unknown error")}</dd>
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
