// The live map. MapLibre (open source) draws it with free OpenFreeMap tiles,
// so there is no map bill and no API key.
//   pins  check-ins        [{ id, lat, lng, outcome, color, initial, title }]
//   dots  unvisited shops  [{ id, lat, lng, title }]
//   live  last known spots [{ key, lat, lng, color, initial, label }]
//   routes paths travelled  [{ key, color, coords: [[lng, lat], ...] }]
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed } from "lucide-react";

const STYLE = import.meta.env.VITE_MAP_STYLE || "https://tiles.openfreemap.org/styles/liberty";
const KATHMANDU = [85.318, 27.705];

const heatData = (heat) => ({
  type: "FeatureCollection",
  features: heat.map((h) => ({ type: "Feature", properties: { w: h[2] }, geometry: { type: "Point", coordinates: [h[0], h[1]] } })),
});

const routeData = (routes) => ({
  type: "FeatureCollection",
  features: routes.map((r) => ({ type: "Feature", properties: { color: r.color }, geometry: { type: "LineString", coordinates: r.coords } })),
});

export default function MapView({ pins = [], dots = [], live = [], routes = [], heat = [], showHeat = false, focus = "", selected, onSelect, className = "", children }) {
  const box = useRef(null);
  const map = useRef(null);
  const marks = useRef([]);
  const fitted = useRef(false);
  const latestRoutes = useRef(routes);
  latestRoutes.current = routes;
  const latestHeat = useRef([]);
  latestHeat.current = showHeat ? heat : [];
  const lastFocus = useRef(focus);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let m;
    let ready = false;
    try {
      m = new maplibregl.Map({ container: box.current, style: STYLE, center: KATHMANDU, zoom: 11.6, attributionControl: { compact: true } });
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      m.once("load", () => {
        ready = true;
        // Routes sit under the pins: a white edge with the person's colour on top.
        // Heat: where time was spent. Green is light, gold is busy, red is where they stayed longest.
        m.addSource("heat", { type: "geojson", data: heatData(latestHeat.current) });
        m.addLayer({
          id: "heat",
          type: "heatmap",
          source: "heat",
          paint: {
            "heatmap-weight": ["get", "w"],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 0.35, 16, 0.9],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 22, 17, 38],
            "heatmap-opacity": 0.72,
            "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(56,100,91,0)", 0.15, "rgba(56,100,91,0.45)", 0.45, "#7fb069", 0.7, "#f2ab2f", 1, "#d63a40"],
          },
        });
        m.addSource("routes", { type: "geojson", data: routeData(latestRoutes.current) });
        const line = { "line-cap": "round", "line-join": "round" };
        m.addLayer({ id: "routes-edge", type: "line", source: "routes", layout: line, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 } });
        m.addLayer({ id: "routes-line", type: "line", source: "routes", layout: line, paint: { "line-color": ["get", "color"], "line-width": 4, "line-opacity": 0.85 } });
      });
      map.current = m;
    } catch {
      setProblem("The map cannot be shown on this device. Check-ins still work.");
    }
    const timer = setTimeout(() => {
      if (!ready) setProblem("The map is slow to load on this connection. Check-ins still work.");
    }, 12000);
    return () => {
      clearTimeout(timer);
      if (m) m.remove();
      map.current = null;
    };
  }, []);

  function fit(animate) {
    const m = map.current;
    // Shops not visited are left out when there is something that actually happened to frame.
    const happened = [...pins, ...live].map((p) => [p.lng, p.lat]).concat(...routes.map((r) => r.coords));
    const pts = happened.length ? happened : dots.map((p) => [p.lng, p.lat]);
    if (!m || !pts.length) return;
    if (pts.length === 1) {
      m.easeTo({ center: pts[0], zoom: 15, duration: animate ? 600 : 0 });
      return;
    }
    const b = new maplibregl.LngLatBounds();
    pts.forEach((p) => b.extend(p));
    m.resize();
    m.fitBounds(b, { padding: { top: 84, right: 110, bottom: 60, left: 48 }, maxZoom: 15.5, duration: animate ? 600 : 0 });
  }

  const routeSignature = JSON.stringify(routes);
  useEffect(() => {
    const src = map.current && map.current.getSource && map.current.getSource("routes");
    if (src) src.setData(routeData(routes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSignature]);

  const heatSignature = showHeat ? heat.length + ":" + JSON.stringify(heat.slice(-3)) : "off";
  useEffect(() => {
    const src = map.current && map.current.getSource && map.current.getSource("heat");
    if (src) src.setData(heatData(showHeat ? heat : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatSignature]);

  const signature = JSON.stringify([pins, dots, live, selected]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    marks.current.forEach((x) => x.remove());
    marks.current = [];
    const add = (el, p, options = {}) => marks.current.push(new maplibregl.Marker({ element: el, ...options }).setLngLat([p.lng, p.lat]).addTo(m));

    dots.forEach((d) => {
      const el = document.createElement("div");
      el.className = "map-dot";
      el.title = d.title;
      add(el, d);
    });
    pins.forEach((p) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `map-pin o-${p.outcome}` + (selected === p.id ? " on" : "");
      el.style.setProperty("--rep", p.color);
      el.title = p.title;
      el.setAttribute("aria-label", p.title);
      // MapLibre moves the button itself, so the teardrop shape lives on an inner span.
      const drop = document.createElement("span");
      const letter = document.createElement("b");
      letter.textContent = p.initial;
      drop.appendChild(letter);
      el.appendChild(drop);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (onSelect) onSelect(p.id);
      });
      add(el, p, { anchor: "bottom" });
    });
    live.forEach((l) => {
      const el = document.createElement("div");
      el.className = "map-live";
      el.style.setProperty("--rep", l.color);
      el.innerHTML = "<span class='pulse'></span><span class='face'></span><span class='tag'></span>";
      el.querySelector(".face").textContent = l.initial;
      el.querySelector(".tag").textContent = l.label;
      // Sits up and to the right so it never hides the pin of the last check-in.
      add(el, l, { offset: [26, -34] });
    });

    if (!fitted.current && (pins.length || live.length || dots.length)) {
      fitted.current = true;
      fit(false);
    }
    // Choosing one person, or going back to everyone, reframes the map around them.
    if (lastFocus.current !== focus) {
      lastFocus.current = focus;
      fit(true);
    }
    const chosen = pins.find((p) => p.id === selected);
    if (chosen) m.easeTo({ center: [chosen.lng, chosen.lat], zoom: Math.max(m.getZoom(), 14.5), duration: 500 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, focus]);

  return (
    <div className={"map " + className}>
      <div ref={box} className="map-canvas" />
      <button type="button" className="map-fit" onClick={() => fit(true)} aria-label="Show everything on the map">
        <LocateFixed size={18} />
      </button>
      {children}
      {problem && <p className="map-problem">{problem}</p>}
    </div>
  );
}
