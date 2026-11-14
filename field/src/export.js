// PDF and CSV reports. Both are made on the device from the check-ins on
// screen, so the report always matches the filters the person picked.
import { OUTCOMES, money, visitPoints } from "../shared/rules.js";

export function toRows(visits, shops, users, points) {
  return visits.map((v) => {
    const s = shops[v.shopId];
    const u = users[v.rep];
    return {
      date: v.date,
      time: v.time,
      person: u ? u.name : v.rep,
      shop: s ? s.name : v.shopName,
      area: (s && s.area) || v.area || "",
      type: s ? s.type : "",
      outcome: OUTCOMES[v.outcome] || v.outcome,
      value: v.value || 0,
      terms: v.terms || "",
      brands: (v.brands || []).join(", "),
      note: v.note || "",
      points: visitPoints(v, points),
      gps: `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`,
      far: v.far ? "Yes" : "",
    };
  });
}

function save(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function downloadCsv(rows, name) {
  const cols = ["date", "time", "person", "shop", "area", "type", "outcome", "value", "terms", "brands", "note", "points", "gps", "far"];
  const head = ["Date", "Time", "Person", "Shop", "Area", "Shop type", "Outcome", "Order (Rs)", "Payment", "Brands on shelf", "Note", "Points", "GPS", "Far from shop"];
  const cell = (x) => `"${String(x == null ? "" : x).replace(/"/g, '""')}"`;
  const text = [head.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
  save(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }), name);
}

export async function downloadPdf({ rows, summary, filterLine, name }) {
  // Loaded only when someone asks for a PDF, to keep the app quick to open.
  const [pdfLib, tableLib] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const jsPDF = pdfLib.jsPDF || (pdfLib.default && pdfLib.default.jsPDF) || pdfLib.default;
  const autoTable = typeof tableLib.default === "function" ? tableLib.default : tableLib.default.default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const orange = [255, 106, 61];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Raymiyo Field Sales: visit report", 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(filterLine, 40, 62);
  doc.text(`${rows.length} check-ins · ${money(rows.reduce((t, r) => t + r.value, 0))} in orders`, 40, 76);

  autoTable(doc, {
    startY: 92,
    head: [["Person", "Visits", "Orders", "Order value", "New shops", "Points"]],
    body: summary.map((s) => [s.name, s.visits, s.orders, money(s.value), s.newShops, s.points]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [17, 27, 46] },
    tableWidth: 460,
    margin: { left: 40 },
  });

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    head: [["Date", "Time", "Person", "Shop", "Area", "Outcome", "Order (Rs)", "Payment", "Brands", "Note", "Pts"]],
    body: rows.map((r) => [r.date, r.time, r.person, r.shop, r.area, r.outcome, r.value ? r.value.toLocaleString("en-IN") : "", r.terms, r.brands, r.note, r.points]),
    theme: "striped",
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: orange },
    columnStyles: { 0: { cellWidth: 54 }, 1: { cellWidth: 34 }, 6: { halign: "right", cellWidth: 56 }, 9: { cellWidth: 190 }, 10: { halign: "right", cellWidth: 26 } },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Page ${doc.getNumberOfPages()}`, doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 20);
    },
  });
  doc.save(name);
}
