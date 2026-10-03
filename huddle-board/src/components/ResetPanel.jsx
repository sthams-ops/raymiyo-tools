import { useEffect, useState } from "react";
import { ShieldAlert, ChevronDown, ArchiveRestore } from "lucide-react";

// "20261021T040000Z" -> "21 Oct 2026, 04:00 UTC"
function fmtStamp(s) {
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

// Admin only. Start a fresh season WITHOUT losing anything: everything is moved to an archive and can be restored.
export default function ResetPanel() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    try {
      const r = await fetch("/api/reset");
      if (r.ok) setInfo(await r.json());
    } catch (e) { /* panel simply shows no counts */ }
  };
  useEffect(() => { if (open) load(); }, [open]);

  const post = async (body) => {
    const r = await fetch("/api/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, d };
  };

  const archive = async () => {
    setBusy(true); setMsg(null);
    const { ok, d } = await post({ action: "archive", confirm: typed });
    setBusy(false);
    if (ok) {
      setMsg({ ok: true, text: `Done - ${d.archived} items archived. Reloading the board...` });
      setTimeout(() => window.location.reload(), 1500);
    } else {
      setMsg({ ok: false, text: d.error || "Something went wrong - nothing was changed." });
    }
  };

  const restore = async (stamp) => {
    if (!window.confirm("Bring this archive back? Anything you entered since is kept - only missing items are restored.")) return;
    setBusy(true); setMsg(null);
    const { ok, d } = await post({ action: "restore", stamp, confirm: "RESTORE" });
    setBusy(false);
    if (ok) {
      setMsg({ ok: true, text: `Restored ${d.restored} items (kept ${d.skipped} newer ones). Reloading...` });
      setTimeout(() => window.location.reload(), 1500);
    } else {
      setMsg({ ok: false, text: d.error || "Could not restore." });
    }
  };

  const ready = typed === "START FRESH" && !busy;
  return (
    <div style={{ marginTop: 8, marginBottom: 40, borderRadius: 14, border: "1px solid rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.04)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 13 }}
      >
        <ShieldAlert size={16} color="#F87171" />
        <span style={{ fontWeight: 700 }}>Admin tools</span>
        <span style={{ color: "rgba(255,255,255,0.35)" }}>&middot; start a fresh season</span>
        <ChevronDown size={16} style={{ marginLeft: "auto", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      {open && (
        <div style={{ padding: "4px 16px 16px", fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
          <p style={{ marginBottom: 10 }}>
            This moves <b style={{ color: "#fff" }}>all weekly tasks and monthly results</b> into a safe archive and gives you an empty board.
            Nothing is deleted - you can bring it back below. Logins are not affected.
          </p>
          {info && (
            <p style={{ marginBottom: 12, color: "rgba(255,255,255,0.45)" }}>
              Right now: {info.live.weeks} weeks of tasks and {info.live.champions} decided months.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type START FRESH"
              aria-label="Type START FRESH to confirm"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", minWidth: 200 }}
            />
            <button
              onClick={archive}
              disabled={!ready}
              style={{
                padding: "9px 16px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 13, cursor: ready ? "pointer" : "not-allowed",
                background: ready ? "#DC2626" : "rgba(255,255,255,0.08)", color: ready ? "#fff" : "rgba(255,255,255,0.3)",
              }}
            >
              {busy ? "Working..." : "Archive everything & start fresh"}
            </button>
          </div>

          {msg && <p style={{ marginTop: 10, color: msg.ok ? "#34D399" : "#F87171", fontWeight: 600 }}>{msg.text}</p>}

          {info && info.archives.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontWeight: 700, marginBottom: 8 }}>Archives</div>
              {info.archives.map((a) => (
                <div key={a.stamp} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <ArchiveRestore size={14} color="rgba(255,255,255,0.4)" />
                  <span style={{ flex: 1 }}>{fmtStamp(a.stamp)} &middot; {a.items} items</span>
                  <button
                    onClick={() => restore(a.stamp)}
                    disabled={busy}
                    style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.18)", background: "none", color: "#fff", fontSize: 12, cursor: "pointer" }}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
