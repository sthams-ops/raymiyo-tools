import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const QUOTES = [
  { text: "Be comfortable with being uncomfortable. Growth comes at the end of discomfort.", author: "Kobe Bryant" },
  { text: "Great things in business are never done by one person. They're done by a team.", author: "Steve Jobs" },
  { text: "Talent wins games, but teamwork and intelligence win championships.", author: "Michael Jordan" },
];

export default function Login() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  const q = QUOTES[Math.floor(Date.now() / 8000) % QUOTES.length];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at 20% 50%, #1e0a3c 0%, #020617 50%, #000d1a 100%)",
      padding: 24, fontFamily: "var(--font-body)",
    }}>
      {/* Ambient orbs */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {[
          { c: "#7C3AED", x: "10%", y: "20%", s: 400 },
          { c: "#0EA5E9", x: "80%", y: "70%", s: 300 },
          { c: "#059669", x: "60%", y: "10%", s: 250 },
        ].map((o, i) => (
          <div key={i} style={{
            position: "absolute", left: o.x, top: o.y,
            width: o.s, height: o.s, borderRadius: "50%",
            background: o.c, opacity: 0.08, filter: "blur(80px)",
            transform: "translate(-50%,-50%)",
          }} />
        ))}
      </div>

      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: 420,
        animation: "fadeUp 0.6s ease forwards",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, margin: "0 auto 16px",
            background: "linear-gradient(135deg,#7C3AED,#0EA5E9)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 28, fontWeight: 800, color: "#fff",
            fontFamily: "var(--font-head)",
            boxShadow: "0 0 40px #7C3AED50",
          }}>H</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-head)", letterSpacing: -0.5 }}>
            Sunday Huddle
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6, letterSpacing: 2, textTransform: "uppercase" }}>
            Raymiyo Trading Pvt. Ltd.
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(15,15,35,0.8)", backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20,
          padding: 32,
        }}>
          {error && (
            <div style={{
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 20,
              fontSize: 13, color: "#FCA5A5",
            }}>
              {error === "not_allowed" ? "Your email isn't authorized. Use your unijoynepal.com account." :
               error === "oauth_failed" ? "Login failed. Please try again." :
               "Something went wrong. Please try again."}
            </div>
          )}

          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
            Sign in with your Zoho work account to access the team board.
          </p>

          <a
            href="/api/auth?action=login"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              width: "100%", padding: "14px 20px", borderRadius: 12,
              background: "linear-gradient(135deg,#7C3AED,#0EA5E9)",
              color: "#fff", textDecoration: "none", fontSize: 15, fontWeight: 700,
              fontFamily: "var(--font-head)", letterSpacing: -0.2,
              boxShadow: "0 0 30px #7C3AED40",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 40px #7C3AED60"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 0 30px #7C3AED40"; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="2" width="9" height="9" rx="2" fill="#E8442A"/>
              <rect x="13" y="2" width="9" height="9" rx="2" fill="#269A44"/>
              <rect x="2" y="13" width="9" height="9" rx="2" fill="#1E88E5"/>
              <rect x="13" y="13" width="9" height="9" rx="2" fill="#FBC02D"/>
            </svg>
            Sign in with Zoho
          </a>
        </div>

        {/* Quote */}
        <div style={{ textAlign: "center", marginTop: 32, padding: "0 20px" }}>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", fontStyle: "italic", lineHeight: 1.6 }}>
            "{q.text}"
          </p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", marginTop: 6, letterSpacing: 1.5, textTransform: "uppercase" }}>
            — {q.author}
          </p>
        </div>
      </div>
    </div>
  );
}
