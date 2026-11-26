// Entry screen: decides between sign-in, the field screen, the admin screen and the TV.
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, LogOut, RefreshCw, Smartphone } from "lucide-react";
import { api } from "./api.js";
import { flush, loadOutbox, watchOutbox, withOutbox, saveState, savedState } from "./outbox.js";
import Rep from "./Rep.jsx";
import Admin from "./Admin.jsx";
import TV from "./TV.jsx";
import Chat from "./Chat.jsx";
import { forgetPush } from "./push.js";
import { forgetWebPush } from "./webpush.js";
import { Avatar, Toast, Brand } from "./ui.jsx";
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
  const [installer, setInstaller] = useState(null);
  const [tryField, setTryField] = useState(false); // admin only: see and test the field screen

  // Android and desktop Chrome offer an install prompt; show a button for it.
  // iPhones have no such prompt: people use Share, then Add to Home Screen.
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setInstaller(e);
    };
    const onInstalled = () => setInstaller(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const say = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  }, []);

  const [offline, setOffline] = useState(null); // null, or the time of the saved data being shown
  const [waiting, setWaiting] = useState([]); // work kept on this phone until there is signal
  const who = useRef("");

  const reload = useCallback(async () => {
    try {
      const r = range.current;
      const next = await api.state(r && r.from, r && r.to);
      setData(next);
      setStatus("in");
      setOffline(null);
      who.current = next.me.email;
      if (!r) saveState(next);
    } catch (e) {
      if (e.status === 401) return setStatus("out");
      // No signal: open with what this phone saw last.
      const kept = e.offline ? savedState() : null;
      if (kept) {
        who.current = kept.data.me.email;
        setData((d) => d || kept.data);
        setOffline(kept.at);
        setStatus("in");
        return;
      }
      setProblem(e.message);
      setStatus((s) => (s === "in" ? "in" : "error"));
    }
  }, []);

  // Send whatever is waiting, then refresh. Runs when the app opens, when the
  // signal returns, when the app comes back to the front, and every 30 seconds.
  const sync = useCallback(async () => {
    if (who.current) await flush(who.current).catch(() => {});
    await reload();
  }, [reload]);

  useEffect(() => {
    const stop = watchOutbox(setWaiting);
    loadOutbox();
    // Open at once with what this phone saw last; the fresh data replaces it a moment later.
    const kept = savedState();
    if (kept) {
      who.current = kept.data.me.email;
      setData(kept.data);
      setStatus("in");
    }
    reload().then(() => who.current && flush(who.current).then((n) => n && reload()).catch(() => {}));
    const tick = () => document.visibilityState === "visible" && sync();
    const timer = setInterval(tick, 30000);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stop();
      clearInterval(timer);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [reload, sync]);

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
  const view = withOutbox(data, waiting);
  const mine = waiting.filter((i) => i.user === me.email);
  return (
    <>
      <header className="top">
        <Brand />
        <div className="me">
          {installer && (
            <button className="btn small" onClick={async () => { installer.prompt(); await installer.userChoice.catch(() => {}); setInstaller(null); }}>
              <Download size={15} /> <span className="long">Install app</span>
            </button>
          )}
          {me.role === "admin" && (
            <button className="btn small" aria-label={tryField ? "Back to admin view" : "Try the field screen"} onClick={() => setTryField((v) => !v)}>
              <Smartphone size={15} /> {tryField ? "Admin" : "Field"}<span className="long">{tryField ? " view" : " screen"}</span>
            </button>
          )}
          <button className="icon" aria-label="Refresh" onClick={async () => { setSpinning(true); await sync(); setSpinning(false); }}>
            <RefreshCw size={18} className={spinning ? "spin" : ""} />
          </button>
          <Avatar user={me} size={34} />
          <span className="meText">
            <b>{me.name}</b>
            <small>{ROLES[me.role]}</small>
          </span>
          <a className="icon" href="/api/auth?action=logout" aria-label="Sign out" onClick={async (e) => { e.preventDefault(); await forgetPush(); await forgetWebPush(); window.location.href = "/api/auth?action=logout"; }}><LogOut size={18} /></a>
        </div>
      </header>
      {(offline || mine.length > 0) && (
        <p className="banner offline" role="status">
          {offline ? `No signal. Showing what this phone saved at ${new Date(offline).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. ` : ""}
          {mine.length > 0 ? `${mine.length} ${mine.length === 1 ? "item is" : "items are"} saved on this phone and will send when the signal is back.` : offline ? "You can keep working. Check-ins are saved on this phone." : ""}
        </p>
      )}
      {!data.launch && (me.role === "rep" || tryField) && <p className="banner">Practice mode. Check-ins saved now are for learning and will be cleared before the real first day.</p>}
      {me.role === "rep" || (me.role === "admin" && tryField) ? <Rep data={view} reload={sync} say={say} waiting={mine} /> : <Admin data={data} reload={reload} setRange={setRange} say={say} />}
      <Chat me={me} users={data.users} />
      <Toast text={toast} />
    </>
  );
}

function Login() {
  const code = new URLSearchParams(window.location.search).get("error");
  return (
    <div className="login">
      <div className="card narrow">
        <img className="loginLogo" src="/brand/raymiyo-logo.png" alt="Raymiyo Trading Pvt. Ltd" width="900" height="177" />
        <h1>Raymiyo Field</h1>
        <p>Check in at every shop, take orders, and see the whole day on one live map.</p>
        {code && <p className="error">{SIGN_IN_ERRORS[code] || "Sign-in did not work. Try again."}</p>}
        <a className="cta" href="/api/auth?action=login">Sign in with your Zoho account</a>
        <p className="muted small">Use your @unijoynepal.com email. Only people on the team list can sign in.</p>
      </div>
    </div>
  );
}
