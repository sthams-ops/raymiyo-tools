// Office TV screen: open /tv?key=YOUR_KEY. No sign-in, refreshes by itself.
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import MapView from "./MapView.jsx";
import { Board, VisitRow, fmtDay } from "./ui.jsx";
import { buildMapData, indexBy } from "./mapdata.js";
import { money } from "../shared/rules.js";

export default function TV() {
  const key = new URLSearchParams(window.location.search).get("key") || "";
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .tv(key)
        .then((d) => alive && (setData(d), setErr("")))
        .catch((e) => alive && setErr(e.message));
    load();
    const timer = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [key]);

  const mapData = useMemo(() => (data ? buildMapData({ visits: data.visits, shops: data.shops, users: data.users, days: data.days, showShops: false }) : null), [data]);
  if (!data) return <div className="center tv"><p>{err || "Loading the board…"}</p></div>;

  const users = indexBy(data.users, "email");
  const shops = indexBy(data.shops, "id");
  const orders = data.visits.filter((v) => v.outcome === "order");
  return (
    <div className="tv">
      <header className="tvhead">
        <div className="brand">Raymiyo Field<span>Kathmandu direct sales</span></div>
        <div className="tvnow">
          {fmtDay(data.today)} · updated {data.time}
          {err ? " · connection lost, retrying" : ""}
        </div>
      </header>
      <main className="tvgrid">
        <MapView className="map-tv" {...mapData} />
        <section className="panel">
          <div className="stats">
            <div className="stat"><b>{data.visits.length}</b><span>Check-ins today</span></div>
            <div className="stat"><b>{orders.length}</b><span>Orders</span></div>
            <div className="stat hot"><b>{money(orders.reduce((t, v) => t + v.value, 0))}</b><span>Order value</span></div>
          </div>
          <div className="card">
            <h3>Today's race</h3>
            <Board rows={data.board.today} big />
          </div>
          <div className="card">
            <h3>This month</h3>
            <Board rows={data.board.month} />
          </div>
          <div className="card">
            <h3>Latest check-ins</h3>
            <div className="rows">
              {data.visits.length ? (
                data.visits.slice(-5).reverse().map((v) => <VisitRow key={v.id} v={v} shop={shops[v.shopId]} user={users[v.rep]} showRep />)
              ) : (
                <p className="muted">No check-ins yet today.</p>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
