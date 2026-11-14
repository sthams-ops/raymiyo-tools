// Entry screen: decides between sign-in, the field screen, the admin screen and the TV.
import { useCallback, useEffect, useRef, useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { api } from "./api.js";
import Rep from "./Rep.jsx";
import Admin from "./Admin.jsx";
import TV from "./TV.jsx";
import { Avatar, Toast } from "./ui.jsx";
import { ROLES } from "../shared/rules.js";

const SIGN_IN_ERRORS = {
  not_allowed: "That Zoho account is not on the team list. Ask the admin to add your company email.",
  not_configured: "Sign-in is not set up yet. The Zoho keys are missing in Vercel.",
  expired: "That sign-in took too long. Try again.",
  oauth_failed: "Zoho could not sign you in. Try again.",
};

export default function App() {
  if (window.location.pathname.replace(/\/$/, "") === "/tv") return <TV />;
  return <Signed />;
}

function Signed() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | in | out | error
  const [problem, setProblem] = useState("");
  const [toast, setToast] = useState("");
  const [spinning, setSpinning] = useState(false);
  const range = useRef(null);
  const toastTimer = useRef(null);

  const say = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }, []);

  const reload = useCallback(async () => {
    try {
      const r = range.current;
      const next = await api.state(r && r.from, r && r.to);
      setData(next);
      setStatus("in");
    } catch (e) {
      if (e.status === 401) setStatus("out");
      else {
        setProblem(e.message);
        setStatus((s) => (s === "in" ? "in" : "error"));
      }
    }
  }, []);

  useEffect(() => {
    reload();
    // Keep the admin map fresh while the tab is open.
    const timer = setInterval(() => document.visibilityState === "visible" && reload(), 30000);
    return () => clearInterval(timer);
  }, [reload]);

  const setRange = useCallback(
    (r) => {
      range.current = r;
      reload();
    },
    [reload]
  );

  if (status === "loading") return <div className="center"><p>Loading…</p></div>;
  if (status === "error") {
    return (
      <div className="center">
        <div className="card narrow">
          <h2>The app could not load</h2>
          <p className="error">{problem}</p>
          <button className="cta" onClick={() => { setStatus("loading"); reload(); }}>Try again</button>
        </div>
      </div>
    );
  }
  if (status === "out") return <Login />;

  const me = data.me;
  return (
    <>
      <header className="top">
        <div className="brand">Raymiyo Field<span>Kathmandu direct sales</span></div>
        <div className="me">
          <button className="icon" aria-label="Refresh" onClick={async () => { setSpinning(true); await reload(); setSpinning(false); }}>
            <RefreshCw size={18} className={spinning ? "spin" : ""} />
          </button>
          <Avatar user={me} size={34} />
          <span className="meText">
            <b>{me.name}</b>
            <small>{ROLES[me.role]}</small>
          </span>
          <a className="icon" href="/api/auth?action=logout" aria-label="Sign out"><LogOut size={18} /></a>
        </div>
      </header>
      {me.role === "rep" ? <Rep data={data} reload={reload} say={say} /> : <Admin data={data} reload={reload} setRange={setRange} say={say} />}
      <Toast text={toast} />
    </>
  );
}

function Login() {
  const code = new URLSearchParams(window.location.search).get("error");
  return (
    <div className="login">
      <div className="loginArt" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
      <div className="card narrow">
        <div className="brand big">Raymiyo Field<span>Kathmandu direct sales</span></div>
        <p>Check in at every shop, see the day on a live map and race for the top of the board.</p>
        {code && <p className="error">{SIGN_IN_ERRORS[code] || "Sign-in did not work. Try again."}</p>}
        <a className="cta" href="/api/auth?action=login">Sign in with your Zoho account</a>
        <p className="muted small">Use your @unijoynepal.com email. Only people on the team list can sign in.</p>
      </div>
    </div>
  );
}
