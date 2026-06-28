import { useState, useEffect } from "react";

const QUOTES = [
  { text: "Be comfortable with being uncomfortable. Growth comes at the end of discomfort.", author: "Kobe Bryant" },
  { text: "Great things in business are never done by one person. They're done by a team.", author: "Steve Jobs" },
  { text: "Talent wins games, but teamwork and intelligence win championships.", author: "Michael Jordan" },
  { text: "You can't build a reputation on what you are going to do.", author: "Henry Ford" },
  { text: "Accountability breeds response-ability.", author: "Stephen Covey" },
  { text: "If everyone is moving forward together, success takes care of itself.", author: "Henry Ford" },
];

export default function QuoteBar() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % QUOTES.length); setVisible(true); }, 400);
    }, 8000);
    return () => clearInterval(t);
  }, []);

  const q = QUOTES[idx];
  return (
    <div style={{
      textAlign: "center", padding: "16px 32px",
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 14, margin: "0 0 24px",
      transition: "opacity 0.4s ease", opacity: visible ? 1 : 0,
    }}>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontStyle: "italic", lineHeight: 1.6 }}>
        "{q.text}"
      </p>
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 6, letterSpacing: 2, textTransform: "uppercase" }}>
        — {q.author}
      </p>
    </div>
  );
}
