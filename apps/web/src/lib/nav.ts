// Client-side SPA view router. Because the prototype is served from a
// single Next.js route ("/"), navigation between portals/pages is managed
// here with a Zustand store + a lightweight hash router so deep links and
// the browser back button still work.

"use client";

import { create } from "zustand";
import type { Session, UserRole } from "@/types";

export interface ViewState {
  portal: "public" | "patient" | "provider" | "pharmacy" | "laboratory" | "hospital" | "logistics" | "manager" | "support" | "admin" | "login";
  page: string; // e.g. "dashboard", "appointments", "encounter"
  params: Record<string, string>;
}

interface NavState {
  session: Session | null;
  sessionName: string;
  sessionEmail: string;
  view: ViewState;
  activePatientId: string | null; // for patient dependant switching
  setSession: (s: Session & { name?: string; email?: string }) => void;
  logout: () => void;
  navigate: (portal: ViewState["portal"], page: string, params?: Record<string, string>) => void;
  setActivePatient: (id: string) => void;
  back: () => void;
}

const SESSION_KEY = "royalPalaceSession";

function loadSession(): { session: Session | null; name: string; email: string } {
  if (typeof window === "undefined") return { session: null, name: "", email: "" };
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return { session: null, name: "", email: "" };
    const parsed = JSON.parse(raw);
    return { session: parsed, name: parsed.name ?? "", email: parsed.email ?? "" };
  } catch {
    return { session: null, name: "", email: "" };
  }
}

function viewFromHash(): ViewState {
  if (typeof window === "undefined") return { portal: "public", page: "home", params: {} };
  const hash = window.location.hash.replace(/^#\/?/, ""); // e.g. patient/appointments?id=APT-002
  if (!hash) return { portal: "public", page: "home", params: {} };
  const [path, query] = hash.split("?");
  const [portal, ...rest] = path.split("/");
  const page = rest[0] ?? (portal as string);
  const params: Record<string, string> = {};
  if (query) {
    for (const pair of query.split("&")) {
      const [k, v] = pair.split("=");
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }
  }
  return { portal: (portal as ViewState["portal"]) ?? "public", page: page || "home", params };
}

function hashFromView(v: ViewState): string {
  const path = `${v.portal}/${v.page}`;
  const qs = new URLSearchParams(v.params).toString();
  return `#/${path}${qs ? `?${qs}` : ""}`;
}

function authorizedView(session: Session | null, requested: ViewState): ViewState {
  if (requested.portal === "public" || requested.portal === "login") return requested;
  if (!session) return { portal: "login", page: "login", params: {} };

  const sessionPortal = rolePortal(session.role);
  return requested.portal === sessionPortal
    ? requested
    : { portal: sessionPortal, page: "dashboard", params: {} };
}

const initial = loadSession();
const initialView: ViewState =
  initial.session
    ? { portal: initial.session.role as ViewState["portal"], page: "dashboard", params: {} }
    : viewFromHash();

export const useNav = create<NavState>((set, get) => ({
  session: initial.session,
  sessionName: initial.name,
  sessionEmail: initial.email,
  view: initialView,
  activePatientId: initial.session?.role === "patient" ? initial.session.profileId ?? null : null,
  setSession: (s) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    }
    const portal = (s.role === "doctor" || s.role === "dentist" ? "provider" : s.role) as ViewState["portal"];
    set({
      session: { userId: s.userId, role: s.role, profileId: s.profileId },
      sessionName: s.name ?? "",
      sessionEmail: s.email ?? "",
      view: { portal, page: "dashboard", params: {} },
      activePatientId: s.role === "patient" ? s.profileId ?? null : null,
    });
    if (typeof window !== "undefined") {
      window.location.hash = hashFromView({ portal, page: "dashboard", params: {} });
    }
  },
  logout: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_KEY);
      window.location.hash = "";
    }
    set({ session: null, sessionName: "", sessionEmail: "", view: { portal: "public", page: "home", params: {} }, activePatientId: null });
  },
  navigate: (portal, page, params = {}) => {
    const view = authorizedView(get().session, { portal, page, params });
    set({ view });
    if (typeof window !== "undefined") {
      window.location.hash = hashFromView(view);
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  },
  setActivePatient: (id) => set({ activePatientId: id }),
  back: () => {
    if (typeof window !== "undefined") window.history.back();
  },
}));

// Keep the store in sync with browser back/forward.
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const requested = viewFromHash();
    const { session, view: current } = useNav.getState();
    const v = authorizedView(session, requested);
    if (v.portal !== requested.portal || v.page !== requested.page) {
      window.history.replaceState(null, "", hashFromView(v));
    }
    if (v.portal !== current.portal || v.page !== current.page || JSON.stringify(v.params) !== JSON.stringify(current.params)) {
      useNav.setState({ view: v });
    }
  });
}

export function navigate(portal: ViewState["portal"], page: string, params?: Record<string, string>) {
  useNav.getState().navigate(portal, page, params);
}

export function rolePortal(role: UserRole): ViewState["portal"] {
  if (role === "doctor" || role === "dentist") return "provider";
  return role as ViewState["portal"];
}
