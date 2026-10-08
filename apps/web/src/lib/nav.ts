// Client-side view navigation. Identity is hydrated from the server-managed BFF
// session; browser storage and URL state never grant a role or portal.

"use client";

import type { CurrentSession, PlatformRole } from "@royal-palace/contracts";
import { create } from "zustand";

import { authClient } from "@/lib/api-client";
import type { Session, UserRole } from "@/types";

export interface ViewState {
  portal:
    | "public"
    | "patient"
    | "provider"
    | "pharmacy"
    | "laboratory"
    | "hospital"
    | "logistics"
    | "manager"
    | "support"
    | "admin"
    | "login";
  page: string;
  params: Record<string, string>;
}

interface NavState {
  activePatientId: string | null;
  authenticated: boolean;
  back: () => void;
  hydrateSession: () => Promise<void>;
  logout: () => Promise<void>;
  navigate: (portal: ViewState["portal"], page: string, params?: Record<string, string>) => void;
  session: Session | null;
  sessionEmail: string;
  sessionHydrated: boolean;
  sessionName: string;
  setActivePatient: (id: string) => void;
  view: ViewState;
}

function viewFromHash(): ViewState {
  if (typeof window === "undefined") return { page: "home", params: {}, portal: "public" };
  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash) return { page: "home", params: {}, portal: "public" };
  const [path = "", query] = hash.split("?");
  const [portal = "public", ...rest] = path.split("/");
  const params: Record<string, string> = {};
  if (query !== undefined) {
    for (const pair of query.split("&")) {
      const [key, value] = pair.split("=");
      if (key !== undefined && key.length > 0) {
        params[decodeURIComponent(key)] = decodeURIComponent(value ?? "");
      }
    }
  }
  return { page: rest[0] ?? "home", params, portal: portal as ViewState["portal"] };
}

function hashFromView(view: ViewState): string {
  const query = new URLSearchParams(view.params).toString();
  return `#/${view.portal}/${view.page}${query.length > 0 ? `?${query}` : ""}`;
}

function authorizedView(session: Session | null, requested: ViewState): ViewState {
  if (requested.portal === "public" || requested.portal === "login") return requested;
  if (session === null) return { page: "login", params: {}, portal: "login" };
  const portal = rolePortal(session.role);
  return requested.portal === portal ? requested : { page: "dashboard", params: {}, portal };
}

function toLegacySession(session: CurrentSession): Session | null {
  const role = selectPortalRole(session.roles, session.memberships);
  return role === null
    ? null
    : {
        memberships: session.memberships.map(({ organizationId, organizationType }) => ({
          organizationId,
          organizationType,
        })),
        profileId:
          role === "patient" || role === "doctor"
            ? session.principalId
            : session.memberships.find(
                (membership) => organizationPortalRole(membership.organizationType) === role,
              )?.organizationId,
        role,
        userId: session.principalId,
      };
}

function selectPortalRole(
  roles: readonly PlatformRole[],
  memberships: CurrentSession["memberships"],
): UserRole | null {
  const precedence: readonly [PlatformRole, UserRole][] = [
    ["ADMINISTRATOR", "admin"],
    ["SUPPORT", "support"],
    ["FINANCE", "admin"],
    ["MANAGER", "manager"],
    ["PROVIDER", "doctor"],
    ["LOGISTICS", "logistics"],
    ["PATIENT", "patient"],
    ["ORGANIZATION_APPLICANT", "patient"],
  ];
  return (
    precedence.find(([role]) => roles.includes(role))?.[1] ??
    memberships
      .filter((membership) => membership.roles.includes("ORGANIZATION_STAFF"))
      .map((membership) => organizationPortalRole(membership.organizationType))[0] ??
    null
  );
}

function organizationPortalRole(
  type: CurrentSession["memberships"][number]["organizationType"],
): UserRole {
  return type === "PHARMACY" ? "pharmacy" : type === "LABORATORY" ? "laboratory" : "hospital";
}

export const useNav = create<NavState>((set, get) => ({
  activePatientId: null,
  authenticated: false,
  back: () => window.history.back(),
  hydrateSession: async () => {
    try {
      const serverSession = await authClient.current();
      const session = toLegacySession(serverSession);
      set({
        activePatientId: session?.role === "patient" ? session.userId : null,
        authenticated: true,
        session,
        sessionEmail: "",
        sessionHydrated: true,
        sessionName: "Account",
        view: authorizedView(session, viewFromHash()),
      });
    } catch {
      set({
        activePatientId: null,
        authenticated: false,
        session: null,
        sessionEmail: "",
        sessionHydrated: true,
        sessionName: "",
        view: authorizedView(null, viewFromHash()),
      });
    }
  },
  logout: async () => {
    try {
      const result = await authClient.logout();
      if (result.endSessionUrl !== null) window.location.assign(result.endSessionUrl);
    } finally {
      window.location.hash = "";
      set({
        activePatientId: null,
        authenticated: false,
        session: null,
        sessionEmail: "",
        sessionName: "",
        view: { page: "home", params: {}, portal: "public" },
      });
    }
  },
  navigate: (portal, page, params = {}) => {
    const view = authorizedView(get().session, { page, params, portal });
    set({ view });
    window.location.hash = hashFromView(view);
    window.scrollTo({ behavior: "instant", top: 0 });
  },
  session: null,
  sessionEmail: "",
  sessionHydrated: false,
  sessionName: "",
  setActivePatient: (id) => set({ activePatientId: id }),
  view: { page: "home", params: {}, portal: "public" },
}));

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    const requested = viewFromHash();
    const { session, view: current } = useNav.getState();
    const view = authorizedView(session, requested);
    if (view.portal !== requested.portal || view.page !== requested.page) {
      window.history.replaceState(null, "", hashFromView(view));
    }
    if (
      view.portal !== current.portal ||
      view.page !== current.page ||
      JSON.stringify(view.params) !== JSON.stringify(current.params)
    ) {
      useNav.setState({ view });
    }
  });
}

export function navigate(
  portal: ViewState["portal"],
  page: string,
  params?: Record<string, string>,
): void {
  useNav.getState().navigate(portal, page, params);
}

export function rolePortal(role: UserRole): ViewState["portal"] {
  if (role === "doctor" || role === "dentist") return "provider";
  return role;
}
