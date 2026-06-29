import { useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";

const QUOTES = [
  { text: "Be comfortable with being uncomfortable. Growth comes at the end of discomfort.", author: "Kobe Bryant" },
  { text: "Great things in business are never done by one person. They're done by a team.", author: "Steve Jobs" },
  { text: "Talent wins games, but teamwork and intelligence win championships.", author: "Michael Jordan" },
];

export default function Login() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  const [isLoading, setIsLoading] = useState(false);
  const q = QUOTES[Math.floor(Date.now() / 8000) % QUOTES.length];

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [10, -10]);
  const rotateY = useTransform(mouseX, [-300, 300], [-10, 10]);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };
  const handleMouseLeave = () => { mouseX.set(0); mouseY.set(0); };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @keyframes beam-top { 0%{left:-50%;opacity:0.3} 50%{opacity:0.7} 100%{left:100%;opacity:0.3} }
    @keyframes beam-right { 0%{top:-50%;opacity:0.3} 50%{opacity:0.7} 100%{top:100%;opacity:0.3} }
    @keyframes beam-bottom { 0%{right:-50%;opacity:0.3} 50%{opacity:0.7} 100%{right:100%;opacity:0.3} }
    @keyframes beam-left { 0%{bottom:-50%;opacity:0.3} 50%{opacity:0.7} 100%{bottom:100%;opacity:0.3} }
    @keyframes corner-pulse { 0%,100%{opacity:0.2} 50%{opacity:0.5} }
    @keyframes spin { to{transform:rotate(360deg)} }
    @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
    .beam-top {
      position:absolute; top:0; left:-50%;
      height:3px; width:50%;
      background:linear-gradient(to right,transparent,white,transparent);
      filter:blur(2px);
      animation:beam-top 2.5s ease-in-out infinite;
    }
    .beam-right {
      position:absolute; right:0; top:-50%;
      width:3px; height:50%;
      background:linear-gradient(to bottom,transparent,white,transparent);
      filter:blur(2px);
      animation:beam-right 2.5s ease-in-out infinite 0.6s;
    }
    .beam-bottom {
      position:absolute; bottom:0; right:-50%;
      height:3px; width:50%;
      background:linear-gradient(to right,transparent,white,transparent);
      filter:blur(2px);
      animation:beam-bottom 2.5s ease-in-out infinite 1.2s;
    }
    .beam-left {
      position:absolute; left:0; bottom:-50%;
      width:3px; height:50%;
      background:linear-gradient(to bottom,transparent,white,transparent);
      filter:blur(2px);
      animation:beam-left 2.5s ease-in-out infinite 1.8s;
    }
    .corner { position:absolute; border-radius:50%; animation:corner-pulse 2s infinite; }
    .corner-tl { top:0;left:0;width:5px;height:5px;background:rgba(255,255,255,0.4);filter:blur(1px); }
    .corner-tr { top:0;right:0;width:8px;height:8px;background:rgba(255,255,255,0.6);filter:blur(2px);animation-delay:0.5s; }
    .corner-br { bottom:0;right:0;width:8px;height:8px;background:rgba(255,255,255,0.6);filter:blur(2px);animation-delay:1s; }
    .corner-bl { bottom:0;left:0;width:5px;height:5px;background:rgba(255,255,255,0.4);filter:blur(1px);animation-delay:1.5s; }
    .zoho-btn { transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .zoho-btn:hover { transform: scale(1.02); box-shadow: 0 0 30px rgba(255,255,255,0.25); }
    .zoho-btn:hover .btn-shimmer { animation: shimmer 1.5s ease-in-out infinite; }
    .zoho-btn:active { transform: scale(0.98); }
    .noise-overlay {
      position:absolute; inset:0; opacity:0.03; mix-blend-mode:soft-light;
      background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      background-size:200px 200px;
      pointer-events:none;
    }
    .grid-pattern {
      position:absolute; inset:0; opacity:0.03;
      background-image:linear-gradient(135deg,white 0.5px,transparent 0.5px),linear-gradient(45deg,white 0.5px,transparent 0.5px);
      background-size:30px 30px;
      pointer-events:none;
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={{
        minHeight:"100vh", width:"100vw", background:"#000",
        position:"relative", overflow:"hidden",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontFamily:"'Plus Jakarta Sans',sans-serif",
      }}>
        {/* Noise */}
        <div className="noise-overlay" />

        {/* Background gradient */}
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,rgba(124,58,237,0.4),rgba(109,40,217,0.5),#000)", pointerEvents:"none" }} />

        {/* Top glow */}
        <div style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"120vh", height:"60vh", borderRadius:"0 0 50% 50%", background:"rgba(167,139,250,0.2)", filter:"blur(80px)", pointerEvents:"none" }} />
        <motion.div
          animate={{ opacity:[0.15,0.3,0.15], scale:[0.98,1.02,0.98] }}
          transition={{ duration:8, repeat:Infinity, repeatType:"mirror" }}
          style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"100vh", height:"60vh", borderRadius:"0 0 50% 50%", background:"rgba(196,181,253,0.15)", filter:"blur(60px)", pointerEvents:"none" }}
        />
        <motion.div
          animate={{ opacity:[0.3,0.5,0.3], scale:[1,1.1,1] }}
          transition={{ duration:6, repeat:Infinity, repeatType:"mirror", delay:1 }}
          style={{ position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)", width:"90vh", height:"90vh", borderRadius:"50% 50% 0 0", background:"rgba(124,58,237,0.15)", filter:"blur(60px)", pointerEvents:"none" }}
        />

        {/* Ambient spots */}
        <motion.div animate={{ opacity:[0.03,0.06,0.03] }} transition={{ duration:3, repeat:Infinity }}
          style={{ position:"absolute", left:"25%", top:"25%", width:384, height:384, background:"rgba(255,255,255,0.05)", borderRadius:"50%", filter:"blur(100px)", pointerEvents:"none" }} />
        <motion.div animate={{ opacity:[0.03,0.06,0.03] }} transition={{ duration:3, repeat:Infinity, delay:1 }}
          style={{ position:"absolute", right:"25%", bottom:"25%", width:384, height:384, background:"rgba(255,255,255,0.05)", borderRadius:"50%", filter:"blur(100px)", pointerEvents:"none" }} />

        {/* Card */}
        <motion.div
          initial={{ opacity:0, y:20 }}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.8 }}
          style={{ width:"100%", maxWidth:400, padding:"0 20px", position:"relative", zIndex:10, perspective:1500 }}
        >
          <motion.div
            style={{ rotateX, rotateY, position:"relative" }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            whileHover={{ z:10 }}
          >
            <div style={{ position:"relative" }}>
              {/* Card glow pulse */}
              <motion.div
                animate={{ boxShadow:["0 0 10px 2px rgba(255,255,255,0.03)","0 0 20px 6px rgba(255,255,255,0.06)","0 0 10px 2px rgba(255,255,255,0.03)"], opacity:[0.2,0.5,0.2] }}
                transition={{ duration:4, repeat:Infinity, ease:"easeInOut", repeatType:"mirror" }}
                style={{ position:"absolute", inset:-1, borderRadius:16, pointerEvents:"none" }}
              />

              {/* Traveling beams */}
              <div style={{ position:"absolute", inset:-1, borderRadius:16, overflow:"hidden", pointerEvents:"none" }}>
                <div className="beam-top" />
                <div className="beam-right" />
                <div className="beam-bottom" />
                <div className="beam-left" />
                <div className="corner corner-tl" />
                <div className="corner corner-tr" />
                <div className="corner corner-br" />
                <div className="corner corner-bl" />
              </div>

              {/* Border gradient */}
              <div style={{ position:"absolute", inset:-0.5, borderRadius:16, background:"linear-gradient(to right,rgba(255,255,255,0.03),rgba(255,255,255,0.08),rgba(255,255,255,0.03))", pointerEvents:"none" }} />

              {/* Glass card */}
              <div style={{
                position:"relative",
                background:"rgba(0,0,0,0.4)",
                backdropFilter:"blur(24px)", WebkitBackdropFilter:"blur(24px)",
                borderRadius:16, padding:"28px 24px",
                border:"1px solid rgba(255,255,255,0.05)",
                boxShadow:"0 25px 50px rgba(0,0,0,0.5)",
                overflow:"hidden",
              }}>
                <div className="grid-pattern" />

                {/* Logo */}
                <div style={{ textAlign:"center", marginBottom:22, position:"relative", zIndex:1 }}>
                  <motion.div
                    initial={{ scale:0.5, opacity:0 }}
                    animate={{ scale:1, opacity:1 }}
                    transition={{ type:"spring", duration:0.8 }}
                    style={{
                      width:48, height:48, borderRadius:"50%",
                      border:"1px solid rgba(255,255,255,0.1)",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      margin:"0 auto 14px", position:"relative", overflow:"hidden",
                      background:"linear-gradient(135deg,#7C3AED,#0EA5E9)",
                      boxShadow:"0 0 30px rgba(124,58,237,0.5)",
                    }}
                  >
                    <span style={{ fontSize:22, fontWeight:800, color:"#fff", fontFamily:"'Space Grotesk',sans-serif", position:"relative", zIndex:1 }}>H</span>
                    <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg,rgba(255,255,255,0.15),transparent)", opacity:0.5 }} />
                  </motion.div>

                  <motion.h1
                    initial={{ opacity:0, y:10 }}
                    animate={{ opacity:1, y:0 }}
                    transition={{ delay:0.2 }}
                    style={{
                      fontSize:22, fontWeight:800, margin:"0 0 4px",
                      fontFamily:"'Space Grotesk',sans-serif",
                      background:"linear-gradient(to bottom,#fff,rgba(255,255,255,0.8))",
                      WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                      letterSpacing:-0.5,
                    }}
                  >Sunday Huddle</motion.h1>

                  <motion.p
                    initial={{ opacity:0 }}
                    animate={{ opacity:1 }}
                    transition={{ delay:0.3 }}
                    style={{ fontSize:10, color:"rgba(255,255,255,0.4)", margin:0, letterSpacing:2, textTransform:"uppercase" }}
                  >Raymiyo Trading Pvt. Ltd.</motion.p>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity:0, y:-10 }}
                      animate={{ opacity:1, y:0 }}
                      exit={{ opacity:0, y:-10 }}
                      style={{
                        background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)",
                        borderRadius:10, padding:"10px 14px", marginBottom:16,
                        fontSize:13, color:"#FCA5A5", position:"relative", zIndex:1,
                      }}
                    >
                      {error === "not_allowed" ? "Your email isn't authorized. Use your unijoynepal.com account." :
                       error === "oauth_failed" ? "Login failed. Please try again." :
                       "Something went wrong. Please try again."}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Description */}
                <motion.p
                  initial={{ opacity:0 }}
                  animate={{ opacity:1 }}
                  transition={{ delay:0.4 }}
                  style={{ fontSize:13, color:"rgba(255,255,255,0.45)", marginBottom:20, lineHeight:1.6, textAlign:"center", position:"relative", zIndex:1 }}
                >
                  Sign in with your Zoho work account to access the team board.
                </motion.p>

                {/* Zoho button */}
                <motion.div
                  initial={{ opacity:0, y:10 }}
                  animate={{ opacity:1, y:0 }}
                  transition={{ delay:0.5 }}
                  style={{ position:"relative", zIndex:1, marginBottom:20 }}
                >
                  <a
                    href="/api/auth?action=login"
                    className="zoho-btn"
                    onClick={() => setIsLoading(true)}
                    style={{
                      display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                      width:"100%", height:44, borderRadius:10,
                      background:"#fff", color:"#000",
                      textDecoration:"none", fontSize:14, fontWeight:700,
                      fontFamily:"'Space Grotesk',sans-serif",
                      position:"relative", overflow:"hidden",
                    }}
                  >
                    {/* Shimmer */}
                    <div className="btn-shimmer" style={{
                      position:"absolute", inset:0,
                      background:"linear-gradient(to right,transparent,rgba(255,255,255,0.4),transparent)",
                      transform:"translateX(-100%)",
                    }} />

                    <AnimatePresence mode="wait">
                      {isLoading ? (
                        <motion.div key="loading" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
                          <div style={{ width:16, height:16, border:"2px solid rgba(0,0,0,0.3)", borderTopColor:"#000", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
                        </motion.div>
                      ) : (
                        <motion.div key="content" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                          style={{ display:"flex", alignItems:"center", gap:10 }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                            <rect x="2" y="2" width="9" height="9" rx="2" fill="#E8442A"/>
                            <rect x="13" y="2" width="9" height="9" rx="2" fill="#269A44"/>
                            <rect x="2" y="13" width="9" height="9" rx="2" fill="#1E88E5"/>
                            <rect x="13" y="13" width="9" height="9" rx="2" fill="#FBC02D"/>
                          </svg>
                          Sign in with Zoho
                          <motion.svg
                            width="14" height="14" viewBox="0 0 24 24" fill="none"
                            whileHover={{ x:3 }}
                            transition={{ type:"spring", stiffness:400 }}
                          >
                            <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </motion.svg>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </a>
                </motion.div>

                {/* Divider */}
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18, position:"relative", zIndex:1 }}>
                  <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.05)" }} />
                  <motion.span
                    animate={{ opacity:[0.4,0.6,0.4] }}
                    transition={{ duration:3, repeat:Infinity, ease:"easeInOut" }}
                    style={{ fontSize:11, color:"rgba(255,255,255,0.3)", whiteSpace:"nowrap" }}
                  >unijoynepal.com accounts only</motion.span>
                  <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.05)" }} />
                </div>

                {/* Quote */}
                <motion.div
                  initial={{ opacity:0 }}
                  animate={{ opacity:1 }}
                  transition={{ delay:0.7 }}
                  style={{ textAlign:"center", position:"relative", zIndex:1 }}
                >
                  <p style={{ fontSize:12, color:"rgba(255,255,255,0.2)", fontStyle:"italic", lineHeight:1.6, margin:"0 0 4px" }}>
                    "{q.text}"
                  </p>
                  <p style={{ fontSize:10, color:"rgba(255,255,255,0.12)", margin:0, letterSpacing:1.5, textTransform:"uppercase" }}>
                    — {q.author}
                  </p>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </>
  );
}
