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
      next: v.nextStep || "",
      followUp: v.followUp || "",
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
  const cols = ["date", "time", "person", "shop", "area", "type", "outcome", "value", "terms", "brands", "note", "next", "followUp", "points", "gps", "far"];
  const head = ["Date", "Time", "Person", "Shop", "Area", "Shop type", "Outcome", "Order (Rs)", "Payment", "Brands on shelf", "Note", "Next step", "Follow up on", "Points", "GPS", "Far from shop"];
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
  const orange = [56, 100, 91];

  // Company logo, top right. The report still downloads if the logo cannot be read.
  try {
    const blob = await (await fetch("/brand/raymiyo-logo.png")).blob();
    const logo = await new Promise((done, fail) => { const r = new FileReader(); r.onload = () => done(r.result); r.onerror = fail; r.readAsDataURL(blob); });
    doc.addImage(logo, "PNG", doc.internal.pageSize.getWidth() - 40 - 168, 26, 168, 33);
  } catch (e) { /* no logo */ }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(21, 48, 42);
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
    headStyles: { fillColor: [31, 66, 59] },
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
