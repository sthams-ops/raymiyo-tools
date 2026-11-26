// The live map. MapLibre (open source) draws it with free OpenFreeMap tiles,
// so there is no map bill and no API key.
//   pins  check-ins        [{ id, lat, lng, outcome, color, initial, title }]
//   dots  unvisited shops  [{ id, lat, lng, title }]
//   live  last known spots [{ key, lat, lng, color, initial, label }]
//   routes paths travelled  [{ key, color, coords: [[lng, lat], ...] }]
//   flags  places to check  [{ key, lat, lng, level: "high" | "mid", title }]
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed } from "lucide-react";

const STYLE = import.meta.env.VITE_MAP_STYLE || "https://tiles.openfreemap.org/styles/liberty";
const KATHMANDU = [85.318, 27.705];

// Places on the map. The free map tiles already hold the names of shops, pharmacies,
// hospitals, schools, temples and so on (from OpenStreetMap); the stock style only
// shows them when zoomed far in. These settings bring them out two zoom levels earlier
// and pick out the places we sell to in their own colours.
const HEALTH = ["pharmacy", "chemist", "hospital", "clinic", "doctors", "dentist", "medical_supply", "nursing_home"];
const SHOPS = ["supermarket", "convenience", "department_store", "general", "wholesale", "baby_goods", "kiosk", "mall", "marketplace", "variety_store", "cosmetics", "grocery", "greengrocer"];
const kind = ["case", ["in", ["get", "subclass"], ["literal", HEALTH]], "health", ["in", ["get", "subclass"], ["literal", SHOPS]], "shop", "other"];
const NAME = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
export const PLACE_LAYERS = [
  {
    id: "biz-dot",
    type: "circle",
    source: "openmaptiles",
    "source-layer": "poi",
    minzoom: 12.5,
    filter: ["in", ["get", "subclass"], ["literal", [...HEALTH, ...SHOPS]]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12.5, 2.5, 15, 5, 18, 7],
      "circle-color": ["match", kind, "health", "#d63a40", "#2563eb"],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1.5,
    },
  },
  {
    id: "biz-label",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "poi",
    minzoom: 14,
    filter: ["all", ["in", ["get", "subclass"], ["literal", [...HEALTH, ...SHOPS]]], ["has", "name"]],
    layout: {
      "text-field": NAME,
      "text-font": ["Noto Sans Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10.5, 17, 13],
      "text-anchor": "top",
      "text-offset": [0, 0.55],
      "text-max-width": 8,
      "symbol-sort-key": ["match", kind, "health", 0, 1],
    },
    paint: {
      "text-color": ["match", kind, "health", "#a31d24", "#1e40af"],
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.6,
    },
  },
];
// Stock place layers and the zoom they now start at.
const EARLIER = { poi_r1: 13, poi_r7: 14, poi_r20: 15 };

// rich: the office TV, seen from across the room. Shops, pharmacies and street
// names appear from further out and in bigger letters, like a printed street map.
function showPlaces(m, rich) {
  const earlier = rich ? { poi_r1: 11.5, poi_r7: 12.5, poi_r20: 13 } : EARLIER;
  for (const [id, zoom] of Object.entries(earlier)) {
    try {
      if (!m.getLayer(id)) continue;
      m.setLayerZoomRange(id, zoom, 24);
      m.setLayoutProperty(id, "text-font", ["Noto Sans Regular"]);
      m.setPaintProperty(id, "text-color", "#3d4f49");
      m.setPaintProperty(id, "text-halo-width", 1.4);
      if (rich) m.setLayoutProperty(id, "text-size", 13);
    } catch {}
  }
  if (rich) {
    for (const id of ["highway-name-minor", "highway-name-major", "highway-name-path"]) {
      try {
        if (m.getLayer(id)) m.setLayoutProperty(id, "text-size", ["interpolate", ["linear"], ["zoom"], 13, 11, 15, 14, 17, 16]);
      } catch {}
    }
  }
  const layers = rich
    ? PLACE_LAYERS.map((l) =>
        l.id === "biz-dot"
          ? { ...l, minzoom: 11.5, paint: { ...l.paint, "circle-radius": ["interpolate", ["linear"], ["zoom"], 11.5, 2.5, 14, 5, 17, 8] } }
          : { ...l, minzoom: 12.8, layout: { ...l.layout, "text-size": ["interpolate", ["linear"], ["zoom"], 12.8, 11, 15, 14, 17, 16] } }
      )
    : PLACE_LAYERS;
  try {
    if (m.getSource("openmaptiles")) for (const layer of layers) if (!m.getLayer(layer.id)) m.addLayer(layer);
  } catch {}
}

// The live marker: a rider badge in the person's colour, with their initial and the company mark.
const RIDER =
  '<svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<circle cx="7.5" cy="22" r="4.2"/><circle cx="24.5" cy="22" r="4.2"/>' +
  '<path d="M7.5 22l4.2-8.5h7.6l5.2 8.5"/><path d="M12 22h7.5l2.6-9.5"/><path d="M18.5 8.5h3.6l1.4 4"/><path d="M9.5 13.5h6"/></svg>';

const heatData = (heat) => ({
  type: "FeatureCollection",
  features: heat.map((h) => ({ type: "Feature", properties: { w: h[2] }, geometry: { type: "Point", coordinates: [h[0], h[1]] } })),
});

const routeData = (routes) => ({
  type: "FeatureCollection",
  features: routes.map((r) => ({ type: "Feature", properties: { color: r.color }, geometry: { type: "LineString", coordinates: r.coords } })),
});

export default function MapView({ pins = [], dots = [], live = [], routes = [], flags = [], heat = [], showHeat = false, focus = "", legend = false, rich = false, selected, onSelect, className = "", children }) {
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
        showPlaces(m, rich);
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

  const signature = JSON.stringify([pins, dots, live, flags, selected]);
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
      if (/day ended/.test(l.label)) el.className += " off";
      el.innerHTML = `<span class='pulse'></span><span class='face'>${RIDER}</span><b class='ini'></b><img class='logo' src='/brand/raymiyo-mark.png' alt='' /><span class='tag'></span>`;
      el.querySelector(".ini").textContent = l.initial;
      el.querySelector(".tag").textContent = l.label;
      el.title = l.label;
      // Sits up and to the right so it never hides the pin of the last check-in.
      add(el, l, { offset: [28, -36] });
    });

    flags.forEach((k) => {
      const el = document.createElement("div");
      el.className = "map-flag lv-" + k.level;
      el.title = k.title;
      el.textContent = "!";
      add(el, k);
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
      {legend && (
        <p className="map-legend">
          <i style={{ background: "#d63a40" }} /> Pharmacy, clinic
          <i style={{ background: "#2563eb" }} /> Shop
        </p>
      )}
      {children}
      {problem && <p className="map-problem">{problem}</p>}
    </div>
  );
}
