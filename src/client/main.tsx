import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowUp,
  ArrowRight,
  Compass,
  MapPin,
  Plus,
  Search,
  CalendarDays,
  Users,
  Wallet,
  Sparkles,
  Mountain,
  Heart,
  Utensils,
  Leaf,
  Globe2,
  ChevronLeft,
  ChevronRight,
  X,
  Menu,
  LogOut,
  Settings,
  Map as MapIcon,
  List,
  Check,
  Trash2,
  Clock,
  MoveUp,
  MoveDown,
  Pencil,
  LoaderCircle,
  Bookmark,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { api, money, date } from "./api";
import type { Day, Activity } from "../worker/schema";
import "./style.css";
const Admin = lazy(() => import("./Admin"));
const MapView = lazy(() => import("./MapView"));
type Trip = {
  id: string;
  title: string;
  destination: string;
  preferences: any;
  itinerary: Day[];
  version: number;
  created_at: string;
  updated_at: string;
};
const destinations = [
  {
    name: "Kyoto",
    country: "Japan",
    tag: "Culture & quiet moments",
    image: "photo-1493976040374-85c8e12f0c0e",
    position: "center",
  },
  {
    name: "Santorini",
    country: "Greece",
    tag: "A slower kind of summer",
    image: "photo-1533105079780-92b9be482077",
    position: "center",
  },
  {
    name: "Bali",
    country: "Indonesia",
    tag: "A little closer to nature",
    image: "photo-1537996194471-e657df975ab4",
    position: "center",
  },
  {
    name: "Paris",
    country: "France",
    tag: "Follow your curiosity",
    image: "photo-1502602898657-3e91760cbb34",
    position: "center",
  },
];
const photo = (image: string, _w = 800) =>
  ({
    "photo-1476514525535-07fb3b4ae5f1": "/lake-como.jpg",
    "photo-1493976040374-85c8e12f0c0e": "/kyoto.jpg",
    "photo-1533105079780-92b9be482077": "/amalfi.jpg",
    "photo-1537996194471-e657df975ab4": "/bali.jpg",
    "photo-1502602898657-3e91760cbb34": "/paris.jpg",
  })[image] || "/lake-como.jpg";
const emptyPrefs = {
  startDate: "",
  days: 5,
  travelers: 2,
  children: [],
  budget: null,
  currency: "USD",
  pace: "balanced",
  interests: "",
  requirements: "",
};
function Spinner() {
  return <LoaderCircle className="spin" size={20} />;
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>("input,button,textarea")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const list = ref.current?.querySelectorAll<HTMLElement>(
          "input,button,textarea,select,a[href]",
        );
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <button className="icon close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
        <div className="brand-symbol">
          <Compass size={25} />
        </div>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
function App() {
  const [user, setUser] = useState<any>(null),
    [ready, setReady] = useState(false),
    [trips, setTrips] = useState<Trip[]>([]),
    [view, setView] = useState("discover"),
    [trip, setTrip] = useState<Trip | null>(null),
    [messages, setMessages] = useState<any[]>([]),
    [auth, setAuth] = useState(""),
    [newTrip, setNewTrip] = useState(false),
    [seed, setSeed] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(""),
    [account, setAccount] = useState(false);
  const notify = (s: string) => {
    setNotice(s);
    setTimeout(() => setNotice(""), 6000);
  };
  const refresh = async () => {
    const r = await api("/trips");
    setTrips(r.trips);
  };
  useEffect(() => {
    (async () => {
      try {
        const s = await api("/session");
        setUser(s.user);
        await refresh();
        const tripId = new URL(location.href).searchParams.get("trip");
        if (tripId) await openTrip(tripId);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setReady(true);
      }
    })();
  }, []);
  async function openTrip(id: string) {
    setBusy(true);
    try {
      const r = await api("/trips/" + id);
      setTrip(r.trip);
      setMessages(r.messages);
      setView("trip");
      history.replaceState(null, "", "/?trip=" + id);
      setMobile(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function navigate(v: string) {
    setView(v);
    setTrip(null);
    setMobile(false);
    history.replaceState(null, "", "/");
  }
  async function create(values: any, prompt: string) {
    setBusy(true);
    try {
      const { trip: t } = await api("/trips", "POST", values);
      setTrip(t);
      setMessages([]);
      setView("trip");
      setNewTrip(false);
      history.replaceState(null, "", "/?trip=" + t.id);
      await refresh();
      if (prompt) await send(prompt, t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function send(content: string, current = trip) {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const r = await api(`/trips/${current.id}/chat`, "POST", {
        content,
        version: current.version,
      });
      setTrip(r.trip);
      setMessages(r.messages);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function update(patch: any) {
    if (!trip) return "No trip selected";
    setBusy(true);
    try {
      const r = await api("/trips/" + trip.id, "PATCH", {
        ...patch,
        version: trip.version,
      });
      setTrip(r.trip);
      await refresh();
      notify("Changes saved");
      return null;
    } catch (e) {
      setError((e as Error).message);
      return (e as Error).message;
    } finally {
      setBusy(false);
    }
  }
  async function remove(t: Trip) {
    if (
      !window.confirm(
        `Delete “${t.title}” and its conversation? This cannot be undone.`,
      )
    )
      return;
    try {
      await api("/trips/" + t.id, "DELETE", { confirm: true });
      if (trip?.id === t.id) navigate("trips");
      await refresh();
      notify("Trip deleted");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function start(s = "") {
    setSeed(s);
    setNewTrip(true);
  }
  const initialToken = new URL(location.href).searchParams.get("token");
  const flow =
    location.pathname === "/reset-password"
      ? "reset"
      : location.pathname === "/verify-email"
        ? "verify"
        : "";
  return (
    <div className="app">
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("discover");
          }}
        >
          <span className="brand-symbol">
            <Compass size={25} />
          </span>
          elsewhere<span className="brand-dot">.</span>
        </a>
        <span className="brand-caption">A WORLD OF POSSIBILITIES</span>
        <button className="primary new-trip" onClick={() => start()}>
          <Plus size={18} /> Create a trip
        </button>
        <div className="nav-label">YOUR SPACE</div>
        <nav>
          <button
            className={view === "discover" ? "active" : ""}
            onClick={() => navigate("discover")}
          >
            <Compass size={19} />
            Discover
            <span className="nav-dot" />
          </button>
          <button
            className={view === "trips" || view === "trip" ? "active" : ""}
            onClick={() => navigate("trips")}
          >
            <Bookmark size={19} />
            My trips<span className="count">{trips.length}</span>
          </button>
        </nav>
        <div className="sidebar-recent">
          <div className="nav-label">RECENT JOURNEYS</div>
          {trips.slice(0, 4).map((t) => (
            <button
              key={t.id}
              onClick={() => openTrip(t.id)}
              className="recent-trip"
            >
              <span className="tiny-place">
                <MapPin size={14} />
              </span>
              <span>
                {t.title}
                <small>
                  {t.itinerary.length
                    ? `${t.itinerary.length} days · Saved`
                    : "Your next adventure"}
                </small>
              </span>
            </button>
          ))}
          {trips.length === 0 && (
            <p className="muted small">
              Your next chapter starts
              <br />
              with a little curiosity.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sparkles size={21} />
            <strong>
              Less planning.
              <br />
              More living.
            </strong>
            <p>
              Your personal travel companion, from the first idea to the last
              day.
            </p>
          </div>
          {user ? (
            <button className="profile" onClick={() => setAccount(true)}>
              <span className="avatar">{user.name?.[0] || "Y"}</span>
              <span>
                {user.name}
                <small>Personal account</small>
              </span>
              <Settings size={17} />
            </button>
          ) : (
            <div className="guest-profile">
              <span className="avatar">
                <Globe2 size={19} />
              </span>
              <div>
                <strong>Exploring as a guest</strong>
                <button onClick={() => setAuth("register")}>
                  Save across devices <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon mobile-toggle"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <Globe2 size={16} />
            <span>
              {view === "trip"
                ? trip?.destination || "Your journey"
                : view === "trips"
                  ? "Your collection"
                  : "Your next adventure"}
            </span>
          </div>
          <div className="header-right">
            <span className="status-dot" />
            <span className="small muted">Made for the way you travel</span>
            {user ? (
              <button className="outline" onClick={() => setAccount(true)}>
                {user.name}
              </button>
            ) : (
              <button className="outline" onClick={() => setAuth("login")}>
                Log in <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button
              onClick={() => setError("")}
              className="icon"
              aria-label="Dismiss error"
            >
              <X size={18} />
            </button>
          </div>
        )}
        {!ready ? (
          <div className="loading-page">
            <Spinner /> Getting your journeys ready…
          </div>
        ) : view === "trip" && trip ? (
          <TripWorkspace
            trip={trip}
            messages={messages}
            busy={busy}
            onSend={send}
            onUpdate={update}
            onDelete={() => remove(trip)}
            onBack={() => navigate("trips")}
          />
        ) : view === "trips" ? (
          <div className="content">
            <div className="section-heading">
              <div>
                <div className="eyebrow">THE PLACES YOU’LL GO</div>
                <h1>Your journeys, all together.</h1>
                <p className="muted">
                  Big adventures. Little escapes. Make room for both.
                </p>
              </div>
              <button className="primary" onClick={() => start()}>
                <Plus size={17} />
                New trip
              </button>
            </div>
            <div className="search-field">
              <Search size={18} />
              <input
                placeholder="Find a trip or destination"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {trips.length ? (
              <div className="saved-grid">
                {trips
                  .filter((t) =>
                    (t.title + " " + t.destination)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((t, i) => (
                    <article className="saved-card" key={t.id}>
                      <button
                        className="saved-image"
                        onClick={() => openTrip(t.id)}
                        style={{
                          backgroundImage: `url(${photo(destinations[i % 4].image)})`,
                        }}
                      >
                        <span>
                          {t.itinerary.length
                            ? "Itinerary ready"
                            : "A work in progress"}
                        </span>
                      </button>
                      <div className="saved-body">
                        <button
                          className="text-button"
                          onClick={() => openTrip(t.id)}
                        >
                          <h3>{t.title}</h3>
                        </button>
                        <p>
                          <MapPin size={14} />
                          {t.destination || "Destination to discover"}
                        </p>
                        <div className="saved-footer">
                          <span>
                            {t.itinerary.length || t.preferences.days} days ·{" "}
                            {date(t.updated_at)}
                          </span>
                          <button
                            className="icon"
                            onClick={() => remove(t)}
                            aria-label={"Delete " + t.title}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
              </div>
            ) : (
              <div className="empty-state">
                <Compass size={48} />
                <h2>Every great trip starts somewhere.</h2>
                <p>You haven’t saved a journey yet. Let’s change that.</p>
                <button className="primary" onClick={() => start()}>
                  Plan your first trip <ArrowRight size={17} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="content discover">
            <section className="hero">
              <img
                src={photo("photo-1476514525535-07fb3b4ae5f1", 1800)}
                alt="A wooden boat on a quiet alpine lake, surrounded by mountains and forest"
              />
              <div className="hero-shade" />
              <div className="hero-content">
                <div className="hero-pill">
                  <span /> YOUR NEXT CHAPTER STARTS HERE
                </div>
                <h1>
                  A little wonder.
                  <br />A whole new <em>world.</em>
                </h1>
                <p>
                  Go somewhere that stays with you.
                  <br />
                  We’ll help with everything in between.
                </p>
                <span className="hero-location">
                  <MapPin size={13} /> A little alpine inspiration
                </span>
              </div>
              <div className="hero-stamp">
                <Globe2 size={31} />
                <span>
                  GO FAR.
                  <br />
                  FEEL MORE.
                </span>
              </div>
            </section>
            <section className="planner-card">
              <div className="planner-heading">
                <span className="sparkle-box">
                  <Sparkles size={22} />
                </span>
                <div>
                  <h2>Where is your curiosity taking you?</h2>
                  <p>
                    Tell us what you’re dreaming of. We’ll take it from here.
                  </p>
                </div>
                <span className="ai-badge">YOUR AI TRAVEL COMPANION</span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  start(seed);
                }}
              >
                <textarea
                  aria-label="Describe your dream trip"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="A week in Japan, hidden food spots, a little adventure…"
                  maxLength={6000}
                />
                <div className="planner-bottom">
                  <div className="prompt-details">
                    <span>
                      <MapPin size={15} />
                      Anywhere
                    </span>
                    <span>
                      <CalendarDays size={15} />
                      Anytime
                    </span>
                    <span>
                      <Users size={15} />
                      Your people
                    </span>
                  </div>
                  <button className="primary" type="submit">
                    Let’s plan a trip <ArrowUpRight size={18} />
                  </button>
                </div>
              </form>
            </section>
            <div className="inspiration-prompts">
              <span>A LITTLE INSPIRATION</span>
              {[
                { icon: Heart, text: "A romantic escape" },
                { icon: Mountain, text: "An outdoor adventure" },
                { icon: Utensils, text: "A trip for food lovers" },
              ].map(({ icon: Icon, text }) => (
                <button key={text} onClick={() => start(text)}>
                  <Icon size={14} />
                  {text}
                  <ArrowUpRight size={12} />
                </button>
              ))}
            </div>
            <section className="destinations">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">FOLLOW THE FEELING</div>
                  <h2>Somewhere worth getting lost.</h2>
                  <p className="muted">
                    A few places to spark your next “what if?”
                  </p>
                </div>
                <span className="editorial-note">
                  A world of possibility <ArrowDownRight />
                </span>
              </div>
              <div className="destination-grid">
                {destinations.map((d, i) => (
                  <button
                    className="destination-card"
                    key={d.name}
                    onClick={() =>
                      start(`Plan a trip to ${d.name}, ${d.country}.`)
                    }
                  >
                    <div className="destination-photo">
                      <img
                        src={photo(d.image, 650)}
                        alt={d.name + ", " + d.country}
                        loading="lazy"
                      />
                      <span className="destination-number">0{i + 1}</span>
                      <span className="destination-arrow">
                        <ArrowUpRight size={19} />
                      </span>
                      <div className="destination-caption">
                        <span>{d.country.toUpperCase()}</span>
                        <h3>{d.name}</h3>
                      </div>
                    </div>
                    <p>
                      {d.tag}
                      <span>
                        Explore <ArrowRight size={13} />
                      </span>
                    </p>
                  </button>
                ))}
              </div>
            </section>
            <section className="how-it-works">
              <div>
                <span className="eyebrow">A GOOD TRIP FEELS EFFORTLESS</span>
                <h2>
                  You bring the dream.
                  <br />
                  We connect the dots.
                </h2>
              </div>
              <div>
                <span className="step-number">01</span>
                <h3>Dream it up</h3>
                <p>A destination, a feeling, or a wild idea. Start anywhere.</p>
              </div>
              <div>
                <span className="step-number">02</span>
                <h3>Make it yours</h3>
                <p>
                  A thoughtful itinerary, shaped around the things you love.
                </p>
              </div>
              <div>
                <span className="step-number">03</span>
                <h3>Go live the story</h3>
                <p>Fine-tune together, save your plans, and get out there.</p>
              </div>
            </section>
            <footer>
              <a className="brand mini" href="/">
                elsewhere.
              </a>
              <span>Thoughtfully planned. Freely explored.</span>
              <small>
                AI suggestions · Always check local details before you go.
              </small>
            </footer>
          </div>
        )}
      </main>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {newTrip && (
        <NewTripModal
          seed={seed}
          busy={busy}
          onClose={() => setNewTrip(false)}
          onCreate={create}
        />
      )}
      {auth && (
        <AuthModal
          mode={auth}
          onMode={setAuth}
          onClose={() => setAuth("")}
          onSuccess={async (u, status) => {
            setUser(u);
            setAuth("");
            await refresh();
            notify(
              status && status !== "sent"
                ? status
                : "You’re signed in. Your guest trips are now in your account.",
            );
          }}
        />
      )}
      {account && (
        <AccountModal
          user={user}
          onClose={() => setAccount(false)}
          onError={setError}
          onNotice={notify}
          onUpdate={async () => setUser((await api("/session")).user)}
          onLogout={async () => {
            await api("/auth/logout", "POST", {});
            setUser(null);
            setAccount(false);
            await api("/session");
            await refresh();
            navigate("discover");
          }}
        />
      )}
      {flow && (
        <TokenModal
          flow={flow}
          token={initialToken || ""}
          onClose={() => {
            history.replaceState(null, "", "/");
            location.reload();
          }}
        />
      )}
    </div>
  );
}
function ArrowDownRight() {
  return <ArrowUpRight size={18} style={{ transform: "rotate(90deg)" }} />;
}
function NewTripModal({
  seed,
  busy,
  onClose,
  onCreate,
}: {
  seed: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (v: any, p: string) => void;
}) {
  const [destination, setDestination] = useState(""),
    [prompt, setPrompt] = useState(seed),
    [prefs, setPrefs] = useState<any>({ ...emptyPrefs }),
    [ages, setAges] = useState("");
  const [error, setError] = useState("");
  const change = (key: string, value: any) =>
    setPrefs({ ...prefs, [key]: value });
  return (
    <Modal title="Let’s make a little escape." onClose={onClose}>
      <p className="muted">
        A few details make the journey feel more like you.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const children = ages.trim()
            ? ages.split(",").map((s) => Number(s.trim()))
            : [];
          if (children.some((n) => !Number.isInteger(n) || n < 0 || n > 17)) {
            setError("Children’s ages must be between 0 and 17");
            return;
          }
          onCreate(
            {
              title: destination
                ? `A journey to ${destination}`
                : "My next adventure",
              destination,
              preferences: { ...prefs, children },
            },
            prompt,
          );
        }}
      >
        <label>
          Where to?
          <input
            placeholder="A city, a country, or leave it open"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            maxLength={200}
          />
        </label>
        <div className="form-grid">
          <label>
            Start date
            <input
              type="date"
              value={prefs.startDate}
              onChange={(e) => change("startDate", e.target.value)}
            />
          </label>
          <label>
            Days
            <input
              type="number"
              min={1}
              max={30}
              required
              value={prefs.days}
              onChange={(e) => change("days", +e.target.value)}
            />
          </label>
          <label>
            Travelers
            <input
              type="number"
              min={1}
              max={30}
              required
              value={prefs.travelers}
              onChange={(e) => change("travelers", +e.target.value)}
            />
          </label>
          <label>
            Children’s ages
            <input
              placeholder="e.g. 10, 14"
              value={ages}
              onChange={(e) => setAges(e.target.value)}
            />
          </label>
          <label>
            Budget, excluding flights
            <input
              type="number"
              min={0}
              placeholder="Optional"
              value={prefs.budget ?? ""}
              onChange={(e) =>
                change("budget", e.target.value ? +e.target.value : null)
              }
            />
          </label>
          <label>
            Currency
            <select
              value={prefs.currency}
              onChange={(e) => change("currency", e.target.value)}
            >
              {["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "INR"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Your pace
          <select
            value={prefs.pace}
            onChange={(e) => change("pace", e.target.value)}
          >
            <option value="relaxed">Slow mornings & room to wander</option>
            <option value="balanced">A little of everything</option>
            <option value="packed">See as much as possible</option>
          </select>
        </label>
        <label>
          What do you have in mind?
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Interests, must-sees, accessibility needs, food preferences…"
            maxLength={6000}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <p className="fine-print">
          Your trip saves automatically in this browser. Prices and AI
          recommendations are estimates.
        </p>
        <button className="primary full" disabled={busy}>
          {busy ? <Spinner /> : <Sparkles size={17} />}{" "}
          {prompt ? "Create & plan my trip" : "Create my trip"}
        </button>
      </form>
    </Modal>
  );
}
function AuthModal({
  mode,
  onMode,
  onClose,
  onSuccess,
}: {
  mode: string;
  onMode: (s: string) => void;
  onClose: () => void;
  onSuccess: (u: any, s?: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <Modal
      title={
        mode === "login"
          ? "Welcome back, wanderer."
          : mode === "forgot"
            ? "Let’s get you back in."
            : "Your next chapter awaits."
      }
      onClose={onClose}
    >
      <p className="muted">
        {mode === "register"
          ? "Keep your journeys together, wherever life takes you."
          : "A world of possibility is waiting for you."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const f = Object.fromEntries(new FormData(e.currentTarget));
            const r = await api("/auth/" + mode, "POST", f);
            if (mode === "forgot") setMessage(r.message);
            else onSuccess(r.user, r.emailStatus);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "register" && (
          <label>
            Your name
            <input name="name" autoComplete="name" required maxLength={80} />
          </label>
        )}
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        {mode !== "forgot" && (
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "register" ? 12 : 1}
              maxLength={128}
              required
            />
            {mode === "register" && <small>At least 12 characters</small>}
          </label>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="success-message">
            {message}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          {busy ? (
            <Spinner />
          ) : mode === "login" ? (
            "Log in"
          ) : mode === "forgot" ? (
            "Request reset link"
          ) : (
            "Create account"
          )}
          <ArrowRight size={17} />
        </button>
      </form>
      <div className="auth-links">
        {mode === "login" ? (
          <>
            <button
              onClick={() => {
                onMode("forgot");
                setError("");
              }}
            >
              Forgot password?
            </button>
            <span>
              New here?{" "}
              <button
                onClick={() => {
                  onMode("register");
                  setError("");
                }}
              >
                Create an account
              </button>
            </span>
          </>
        ) : (
          <button
            onClick={() => {
              onMode("login");
              setError("");
            }}
          >
            Back to log in
          </button>
        )}
      </div>
      <p className="fine-print">
        Trips created as a guest will move securely into your account when you
        sign in.
      </p>
    </Modal>
  );
}
function AccountModal({
  user,
  onClose,
  onUpdate,
  onLogout,
  onError,
  onNotice,
}: any) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="A space of your own." onClose={onClose}>
      <p className="muted">{user.email}</p>
      {!user.verified && (
        <div className="verification">
          <Mail size={17} /> Email not verified{" "}
          <button
            disabled={busy}
            onClick={() =>
              perform(async () => {
                const r = await api("/auth/resend", "POST", {});
                onNotice(r.message);
              })
            }
          >
            Resend link
          </button>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          perform(async () => {
            await api("/account", "PATCH", f);
            await onUpdate();
            onNotice("Profile updated");
          });
        }}
      >
        <label>
          Name
          <input name="name" defaultValue={user.name} required maxLength={80} />
        </label>
        <button className="outline full" disabled={busy}>
          Save profile
        </button>
      </form>
      <hr />
      <h3>Change password</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = Object.fromEntries(new FormData(form));
          perform(async () => {
            await api("/auth/password", "POST", f);
            form.reset();
            onNotice("Password changed. Other sessions have been signed out.");
          });
        }}
      >
        <label>
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <button className="primary full" disabled={busy}>
          Update password
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="danger-link"
        disabled={busy}
        onClick={() => perform(onLogout)}
      >
        <LogOut size={16} /> Log out
      </button>
    </Modal>
  );
}
function TokenModal({
  flow,
  token,
  onClose,
}: {
  flow: string;
  token: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  return (
    <Modal
      title={
        done
          ? "You’re all set."
          : flow === "reset"
            ? "A fresh start."
            : "Make it official."
      }
      onClose={onClose}
    >
      {done ? (
        <>
          <p>
            {flow === "reset"
              ? "Your password has been reset. Sign in with your new password."
              : "Your email address is now verified."}
          </p>
          <button className="primary full" onClick={onClose}>
            Back to your journey
          </button>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const f = Object.fromEntries(new FormData(e.currentTarget));
              await api("/auth/" + flow, "POST", { ...f, token });
              setDone(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {flow === "reset" ? (
            <label>
              New password
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
          ) : (
            <p>Confirm your email address to finish setting up your account.</p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy || !token}>
            {busy ? (
              <Spinner />
            ) : flow === "reset" ? (
              "Set new password"
            ) : (
              "Verify email"
            )}
          </button>
        </form>
      )}
    </Modal>
  );
}
function TripWorkspace({
  trip,
  messages,
  busy,
  onSend,
  onUpdate,
  onDelete,
  onBack,
}: {
  trip: Trip;
  messages: any[];
  busy: boolean;
  onSend: (s: string) => void;
  onUpdate: (p: any) => Promise<string | null>;
  onDelete: () => void;
  onBack: () => void;
}) {
  const [text, setText] = useState(""),
    [tab, setTab] = useState("itinerary"),
    [selected, setSelected] = useState("all"),
    [editing, setEditing] = useState<{
      dayId: string;
      activity?: Activity;
    } | null>(null),
    [prefs, setPrefs] = useState(false),
    [places, setPlaces] = useState<any[]>([]),
    [research, setResearch] = useState(""),
    [researchBusy, setResearchBusy] = useState(false),
    [researchError, setResearchError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, busy]);
  useEffect(() => {
    setSelected("all");
    setPlaces([]);
  }, [trip.id]);
  const total = trip.itinerary
      .flatMap((d) => d.activities)
      .reduce((s, a) => s + (a.cost || 0), 0),
    unknown = trip.itinerary
      .flatMap((d) => d.activities)
      .filter((a) => a.cost === null).length;
  const shown =
    selected === "all"
      ? trip.itinerary
      : trip.itinerary.filter((d) => d.id === selected);
  async function editActivity(dayId: string, a: Activity, remove = false) {
    const error = await onUpdate({
      itinerary: trip.itinerary.map((d) =>
        d.id !== dayId
          ? d
          : {
              ...d,
              activities: remove
                ? d.activities.filter((v) => v.id !== a.id)
                : [...d.activities.filter((v) => v.id !== a.id), a].sort(
                    (a, b) => a.time.localeCompare(b.time),
                  ),
            },
      ),
    });
    if (!error) setEditing(null);
    return error;
  }
  function moveActivity(day: Day, a: Activity, direction: number) {
    const idx = day.activities.findIndex((v) => v.id === a.id),
      other = day.activities[idx + direction];
    if (!other) return;
    const start = day.activities[Math.min(idx, idx + direction)].time;
    const items = [...day.activities];
    [items[idx], items[idx + direction]] = [items[idx + direction], items[idx]];
    let minutes = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
    const arranged = items.map((v, i) => {
      if (i < Math.min(idx, idx + direction)) return v;
      const copy = {
        ...v,
        time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
      };
      minutes += v.duration + 30;
      return copy;
    });
    onUpdate({
      itinerary: trip.itinerary.map((d) =>
        d.id === day.id ? { ...d, activities: arranged } : d,
      ),
    });
  }
  return (
    <div className="workspace">
      <div className="trip-heading">
        <button className="back-link" onClick={onBack}>
          <ChevronLeft size={16} />
          All journeys
        </button>
        <div className="trip-title-line">
          <div>
            <div className="eyebrow">YOUR PERSONAL GETAWAY</div>
            <h1>{trip.title}</h1>
            <p className="trip-meta">
              <span>
                <MapPin size={15} />
                {trip.destination || "Somewhere wonderful"}
              </span>
              <span>
                <CalendarDays size={15} />
                {trip.preferences.startDate || "Dates flexible"} ·{" "}
                {trip.itinerary.length || trip.preferences.days} days
              </span>
              <span>
                <Users size={15} />
                {trip.preferences.travelers} travelers
              </span>
            </p>
          </div>
          <div className="trip-actions">
            <span className="saved-label">
              <Check size={14} />
              Saved automatically
            </span>
            <button
              className="outline"
              onClick={() => setPrefs(true)}
              disabled={busy}
            >
              <Settings size={16} />
              Trip details
            </button>
            <button
              className="icon"
              onClick={onDelete}
              aria-label="Delete trip"
              disabled={busy}
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>
      </div>
      <div className="workspace-grid">
        <section className="itinerary-panel">
          <div className="workspace-tabs">
            <button
              className={tab === "itinerary" ? "selected" : ""}
              onClick={() => setTab("itinerary")}
            >
              <List size={17} />
              Itinerary
            </button>
            <button
              className={tab === "map" ? "selected" : ""}
              onClick={() => setTab("map")}
            >
              <MapIcon size={17} />
              Map
            </button>
            <button
              className={tab === "research" ? "selected" : ""}
              onClick={() => setTab("research")}
            >
              <Search size={17} />
              Explore places
            </button>
          </div>
          {trip.itinerary.length > 0 && (
            <div className="day-filters">
              <button
                className={selected === "all" ? "selected" : ""}
                onClick={() => setSelected("all")}
              >
                All days
              </button>
              {trip.itinerary.map((d, i) => (
                <button
                  key={d.id}
                  className={selected === d.id ? "selected" : ""}
                  onClick={() => setSelected(d.id)}
                >
                  Day {i + 1}
                </button>
              ))}
            </div>
          )}
          {tab === "map" ? (
            <>
              <Suspense
                fallback={
                  <div className="empty-state">
                    <Spinner />
                    Loading map…
                  </div>
                }
              >
                <MapView days={shown} />
              </Suspense>
              <p className="fine-print map-note">
                AI coordinates are approximate. Confirm locations before
                traveling. Map data © OpenStreetMap contributors.
              </p>
            </>
          ) : tab === "research" ? (
            <div className="research-panel">
              <h2>A little local knowledge.</h2>
              <p className="muted">
                Look up real places with Google Places. Verify current hours,
                prices, and availability directly.
              </p>
              <form
                className="research-search"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setResearchBusy(true);
                  setResearchError("");
                  try {
                    const r = await api(
                      "/trips/" + trip.id + "/places",
                      "POST",
                      { query: research + " " + trip.destination },
                    );
                    setPlaces(r.places || []);
                    if (!r.places?.length)
                      setResearchError(
                        "No places found. Try a different search.",
                      );
                  } catch (e) {
                    setResearchError((e as Error).message);
                  } finally {
                    setResearchBusy(false);
                  }
                }}
              >
                <input
                  value={research}
                  onChange={(e) => setResearch(e.target.value)}
                  required
                  maxLength={150}
                  placeholder="Museums, a cozy café, a neighborhood…"
                />
                <button className="primary" disabled={researchBusy}>
                  {researchBusy ? <Spinner /> : <Search size={18} />}
                </button>
              </form>
              {researchError && (
                <p className="form-error" role="alert">
                  {researchError}
                </p>
              )}
              {places.map((p) => (
                <article className="place-result" key={p.id}>
                  <span className="tiny-place">
                    <MapPin size={18} />
                  </span>
                  <div>
                    <h3>{p.displayName?.text}</h3>
                    <p>{p.formattedAddress}</p>
                    <small>
                      Google Places · Retrieved{" "}
                      {new Date().toLocaleDateString()}
                    </small>
                  </div>
                  <a
                    href={p.googleMapsUri}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={
                      "View " + p.displayName?.text + " on Google Maps"
                    }
                  >
                    <ArrowUpRight size={19} />
                  </a>
                </article>
              ))}
            </div>
          ) : trip.itinerary.length === 0 ? (
            <div className="empty-state itinerary-empty">
              <span className="empty-illustration">
                <Compass size={55} />
              </span>
              <div className="eyebrow">THE BEST PART IS STILL AHEAD</div>
              <h2>Your adventure is a blank page.</h2>
              <p>
                Tell your travel companion what you have in mind.
                <br />
                We’ll turn your ideas into days you’ll remember.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  onSend(
                    `Plan a ${trip.preferences.days}-day trip ${trip.destination ? "to " + trip.destination : ""} using my trip preferences. If you need a destination, help me choose one.`,
                  )
                }
              >
                {busy ? <Spinner /> : <Sparkles size={17} />}Plan my itinerary
              </button>
              <button
                className="text-link"
                disabled={busy}
                onClick={() =>
                  onUpdate({
                    itinerary: [
                      {
                        id: crypto.randomUUID(),
                        title: "A day to explore",
                        summary: "Make it your own.",
                        activities: [],
                      },
                    ],
                  })
                }
              >
                Or start planning by hand
              </button>
            </div>
          ) : (
            <div className="day-list">
              {shown.map((d) => {
                const idx = trip.itinerary.findIndex((day) => day.id === d.id);
                return (
                  <article className="itinerary-day" key={d.id}>
                    <div className="day-heading">
                      <span className="day-number">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <span className="eyebrow">
                          DAY {idx + 1}
                          {trip.preferences.startDate
                            ? " · " +
                              new Date(
                                new Date(
                                  trip.preferences.startDate + "T12:00:00",
                                ).getTime() +
                                  idx * 86400000,
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })
                            : ""}
                        </span>
                        <h2>{d.title}</h2>
                      </div>
                      <button
                        className="icon"
                        disabled={busy}
                        title="Regenerate this day"
                        aria-label={"Regenerate day " + (idx + 1)}
                        onClick={() =>
                          onSend(
                            `Regenerate only day ${idx + 1}. Keep every other day and its activity IDs and content unchanged.`,
                          )
                        }
                      >
                        <Sparkles size={17} />
                      </button>
                    </div>
                    <p className="day-summary">{d.summary}</p>
                    <div className="activities">
                      {d.activities.map((a, i) => (
                        <div className="activity" key={a.id}>
                          <div className="activity-time">
                            {a.time}
                            <span className={"activity-dot " + a.category} />
                          </div>
                          <div className="activity-card">
                            <div className="activity-top">
                              <span className={"category " + a.category}>
                                {a.category}
                              </span>
                              <span className="small muted">
                                <Clock size={12} />
                                {a.duration} min
                              </span>
                            </div>
                            <h3>{a.title}</h3>
                            <p>{a.description}</p>
                            <div className="activity-location">
                              <MapPin size={13} />
                              {a.location}
                            </div>
                            {a.transport && (
                              <p className="transport-note">↳ {a.transport}</p>
                            )}
                            <div className="activity-bottom">
                              <span className="activity-cost">
                                {a.cost === null
                                  ? "Cost unknown"
                                  : money(a.cost, trip.preferences.currency) +
                                    " est. / group"}
                              </span>
                              <div>
                                <button
                                  disabled={busy || i === 0}
                                  className="icon"
                                  onClick={() => moveActivity(d, a, -1)}
                                  aria-label={"Move " + a.title + " up"}
                                >
                                  <MoveUp size={14} />
                                </button>
                                <button
                                  disabled={
                                    busy || i === d.activities.length - 1
                                  }
                                  className="icon"
                                  onClick={() => moveActivity(d, a, 1)}
                                  aria-label={"Move " + a.title + " down"}
                                >
                                  <MoveDown size={14} />
                                </button>
                                <button
                                  className="icon"
                                  disabled={busy}
                                  onClick={() =>
                                    setEditing({ dayId: d.id, activity: a })
                                  }
                                  aria-label={"Edit " + a.title}
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className="icon"
                                  disabled={busy}
                                  onClick={() => {
                                    if (confirm("Remove this activity?"))
                                      editActivity(d.id, a, true);
                                  }}
                                  aria-label={"Remove " + a.title}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      className="add-activity"
                      disabled={busy}
                      onClick={() => setEditing({ dayId: d.id })}
                    >
                      <Plus size={16} />
                      Add a little something
                    </button>
                  </article>
                );
              })}
              <div className="budget-summary">
                <Wallet size={21} />
                <div>
                  <strong>
                    {money(total, trip.preferences.currency)} estimated activity
                    costs
                  </strong>
                  <p>
                    For your group ·{" "}
                    {unknown
                      ? `${unknown} activities have unknown costs · `
                      : ""}
                    Excludes flights, accommodation and unlisted expenses.
                  </p>
                </div>
              </div>
              <p className="fine-print">
                Thoughtful suggestions, not confirmed bookings. AI prices,
                hours, travel times and coordinates need local verification.
              </p>
            </div>
          )}
        </section>
        <aside className="chat-panel">
          <div className="chat-header">
            <span className="sparkle-box">
              <Sparkles size={20} />
            </span>
            <div>
              <h3>Your travel companion</h3>
              <span>
                <span className="status-dot" />A little expertise. Endless
                possibilities.
              </span>
            </div>
          </div>
          <div className="chat-messages">
            <div className="chat-message assistant">
              <span className="message-label">ELSEWHERE</span>
              <p>
                Hey, explorer. Let’s make this trip feel like you. Tell me what
                you love, what you’re curious about, or what you’d like to
                change.
              </p>
            </div>
            {messages.map((m) => (
              <div key={m.id} className={"chat-message " + m.role}>
                <span className="message-label">
                  {m.role === "user" ? "YOU" : "ELSEWHERE"}
                </span>
                <p>{m.content}</p>
              </div>
            ))}
            {busy && (
              <div className="chat-message assistant thinking">
                <Spinner />
                <span>Connecting the dots for your journey…</span>
              </div>
            )}
            <div ref={bottom} />
          </div>
          <div className="chat-compose">
            {!messages.length && (
              <div className="chat-suggestions">
                {[
                  "Find hidden gems",
                  "Make it family-friendly",
                  "Keep the pace relaxed",
                ].map((s) => (
                  <button disabled={busy} key={s} onClick={() => onSend(s)}>
                    {s}
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) {
                  onSend(text.trim());
                  setText("");
                }
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={6000}
                placeholder="More local food, less rushing…"
                aria-label="Message your travel companion"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!busy && text.trim()) {
                      onSend(text.trim());
                      setText("");
                    }
                  }
                }}
              />
              <div>
                <span>Make it yours, one idea at a time.</span>
                <button
                  className="send-button"
                  disabled={busy || !text.trim()}
                  aria-label="Send message"
                >
                  {busy ? <Spinner /> : <ArrowUp size={18} />}
                </button>
              </div>
            </form>
          </div>
        </aside>
      </div>
      {editing && (
        <ActivityModal
          activity={editing.activity}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(a) => editActivity(editing.dayId, a)}
        />
      )}
      {prefs && (
        <TripDetailsModal
          trip={trip}
          busy={busy}
          onClose={() => setPrefs(false)}
          onSave={async (p) => {
            const error = await onUpdate(p);
            if (!error) setPrefs(false);
            return error;
          }}
        />
      )}
    </div>
  );
}
function ActivityModal({
  activity,
  busy,
  onClose,
  onSave,
}: {
  activity?: Activity;
  busy: boolean;
  onClose: () => void;
  onSave: (a: Activity) => Promise<string | null>;
}) {
  const initial: Activity = activity || {
    id: crypto.randomUUID(),
    time: "09:00",
    title: "",
    description: "",
    location: "",
    lat: null,
    lng: null,
    duration: 60,
    cost: null,
    category: "culture",
    transport: "",
  };
  const [a, setA] = useState(initial);
  const [error, setError] = useState("");
  const change = (k: string, v: any) => setA({ ...a, [k]: v });
  return (
    <Modal
      title={
        activity ? "A little fine-tuning." : "Make room for something good."
      }
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError((await onSave(a)) || "");
        }}
      >
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label>
          Activity
          <input
            required
            maxLength={200}
            value={a.title}
            onChange={(e) => change("title", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Start time
            <input
              type="time"
              required
              value={a.time}
              onChange={(e) => change("time", e.target.value)}
            />
          </label>
          <label>
            Duration (minutes)
            <input
              required
              type="number"
              min={15}
              max={720}
              value={a.duration}
              onChange={(e) => change("duration", +e.target.value)}
            />
          </label>
        </div>
        <label>
          Location
          <input
            maxLength={300}
            value={a.location}
            onChange={(e) => change("location", e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            maxLength={1500}
            value={a.description}
            onChange={(e) => change("description", e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Estimated group cost
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder="Unknown"
              value={a.cost ?? ""}
              onChange={(e) =>
                change("cost", e.target.value === "" ? null : +e.target.value)
              }
            />
          </label>
          <label>
            Category
            <select
              value={a.category}
              onChange={(e) => change("category", e.target.value)}
            >
              {[
                "culture",
                "food",
                "nature",
                "adventure",
                "relax",
                "transport",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Latitude
            <input
              type="number"
              min={-90}
              max={90}
              step="any"
              value={a.lat ?? ""}
              onChange={(e) =>
                change("lat", e.target.value === "" ? null : +e.target.value)
              }
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              min={-180}
              max={180}
              step="any"
              value={a.lng ?? ""}
              onChange={(e) =>
                change("lng", e.target.value === "" ? null : +e.target.value)
              }
            />
          </label>
        </div>
        <label>
          Transport & travel notes
          <input
            maxLength={500}
            value={a.transport}
            onChange={(e) => change("transport", e.target.value)}
          />
        </label>
        <p className="fine-print">
          Start times must not overlap. Leave room for travel between
          activities.
        </p>
        <button className="primary full" disabled={busy}>
          Save activity
          <Check size={17} />
        </button>
      </form>
    </Modal>
  );
}
function TripDetailsModal({
  trip,
  busy,
  onClose,
  onSave,
}: {
  trip: Trip;
  busy: boolean;
  onClose: () => void;
  onSave: (p: any) => Promise<string | null>;
}) {
  const [t, setT] = useState(trip.title),
    [d, setD] = useState(trip.destination),
    [p, setP] = useState({ ...trip.preferences }),
    [ages, setAges] = useState(trip.preferences.children.join(", "));
  const [error, setError] = useState("");
  const change = (k: string, v: any) => setP({ ...p, [k]: v });
  return (
    <Modal title="The details make the difference." onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const children = ages.trim() ? ages.split(",").map(Number) : [];
          setError(
            (await onSave({
              title: t,
              destination: d,
              preferences: { ...p, children },
            })) || "",
          );
        }}
      >
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <label>
          Trip name
          <input
            required
            maxLength={120}
            value={t}
            onChange={(e) => setT(e.target.value)}
          />
        </label>
        <label>
          Destination
          <input
            maxLength={200}
            value={d}
            onChange={(e) => setD(e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Start date
            <input
              type="date"
              value={p.startDate}
              onChange={(e) => change("startDate", e.target.value)}
            />
          </label>
          <label>
            Days
            <input
              type="number"
              min={1}
              max={30}
              required
              value={p.days}
              onChange={(e) => change("days", +e.target.value)}
            />
          </label>
          <label>
            Travelers
            <input
              type="number"
              min={1}
              max={30}
              required
              value={p.travelers}
              onChange={(e) => change("travelers", +e.target.value)}
            />
          </label>
          <label>
            Children’s ages
            <input
              value={ages}
              onChange={(e) => setAges(e.target.value)}
              placeholder="e.g. 10, 14"
            />
          </label>
          <label>
            Budget
            <input
              type="number"
              min={0}
              value={p.budget ?? ""}
              onChange={(e) =>
                change("budget", e.target.value ? +e.target.value : null)
              }
            />
          </label>
          <label>
            Currency
            <select
              value={p.currency}
              onChange={(e) => change("currency", e.target.value)}
            >
              {["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "INR"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Pace
          <select
            value={p.pace}
            onChange={(e) => change("pace", e.target.value)}
          >
            <option value="relaxed">Relaxed</option>
            <option value="balanced">Balanced</option>
            <option value="packed">Packed</option>
          </select>
        </label>
        <label>
          Interests
          <input
            maxLength={2000}
            value={p.interests}
            onChange={(e) => change("interests", e.target.value)}
          />
        </label>
        <label>
          Special requirements
          <textarea
            maxLength={2000}
            value={p.requirements}
            onChange={(e) => change("requirements", e.target.value)}
          />
        </label>
        <p className="fine-print">
          Saving preferences keeps your current itinerary. Ask your companion to
          adapt your plan when you’re ready.
        </p>
        <button className="primary full" disabled={busy}>
          Save details <Check size={17} />
        </button>
      </form>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(
  location.pathname.startsWith("/admin") ? (
    <Suspense
      fallback={
        <div className="loading-page">
          <Spinner />
          Loading…
        </div>
      }
    >
      <Admin />
    </Suspense>
  ) : (
    <App />
  ),
);
