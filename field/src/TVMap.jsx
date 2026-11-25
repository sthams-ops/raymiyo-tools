// The office TV's map. The TV box has an old built-in browser (Chrome 66) that
// cannot run the app's vector map, so the TV uses Leaflet with ready-drawn
// OpenStreetMap street tiles: streets, building outlines, shop and pharmacy names.
//   pins   today's check-ins     [{ id, lat, lng, outcome, color, initial, title }]
//   dots   other Raymiyo shops   [{ id, lat, lng, title }]
//   flags  places to check       [{ key, lat, lng, level, title }]
//   routes paths travelled       [{ key, color, coords: [[lng, lat], ...] }]
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const KATHMANDU = [27.705, 85.318];
const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export default function TVMap({ pins = [], dots = [], flags = [], routes = [] }) {
  const box = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const framed = useRef("");

  useEffect(() => {
    const m = L.map(box.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.25, fadeAnimation: false }).setView(KATHMANDU, 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  const signature = JSON.stringify([pins, dots, flags, routes]);
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const r of routes) {
      const line = r.coords.map((c) => [c[1], c[0]]);
      L.polyline(line, { color: "#ffffff", weight: 8, opacity: 0.9 }).addTo(g);
      L.polyline(line, { color: r.color, weight: 4.5, opacity: 0.9 }).addTo(g);
    }
    for (const d of dots) {
      L.marker([d.lat, d.lng], { icon: L.divIcon({ className: "", html: '<div class="map-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }), title: d.title, interactive: false }).addTo(g);
    }
    for (const p of pins) {
      const html = `<div class="map-pin o-${esc(p.outcome)}" style="--rep:${esc(p.color)}"><span><b>${esc(p.initial)}</b></span></div>`;
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html, iconSize: [38, 46], iconAnchor: [19, 46] }), title: p.title, interactive: false, zIndexOffset: 500 }).addTo(g);
    }
    for (const f of flags) {
      L.marker([f.lat, f.lng], { icon: L.divIcon({ className: "", html: `<div class="map-flag lv-${esc(f.level)}">!</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }), title: f.title, interactive: false, zIndexOffset: 800 }).addTo(g);
    }
    // Frame what happened today; reframe only when something new is added.
    const pts = pins.map((p) => [p.lat, p.lng]).concat(...routes.map((r) => r.coords.map((c) => [c[1], c[0]])));
    const all = pts.length ? pts : dots.map((d) => [d.lat, d.lng]);
    const key = String(all.length);
    if (all.length && framed.current !== key) {
      framed.current = key;
      m.invalidateSize();
      if (all.length === 1) m.setView(all[0], 16);
      else m.fitBounds(L.latLngBounds(all), { padding: [40, 40], maxZoom: 16 });
    }
  }, [signature]);

  return <div ref={box} className="tv2-leaflet" />;
}
