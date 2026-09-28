import type { CurrentSession, LogoutResponse } from "@royal-palace/contracts";

// Client-side API client. All HTTP calls go through here so the backend
// can be swapped (JSON Server -> production REST) without touching the UI.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const j = await res.json();
      message = j.error ?? j.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const api = {
  get: <T>(path: string) => fetch(path, { credentials: "same-origin" }).then(handle<T>),
  post: <T>(path: string, body?: unknown) =>
    fetch(path, {
      credentials: "same-origin",
      method: "POST",
      headers: mutationHeaders(),
      body: body == null ? undefined : JSON.stringify(body),
    }).then(handle<T>),
  patch: <T>(path: string, body?: unknown) =>
    fetch(path, {
      credentials: "same-origin",
      method: "PATCH",
      headers: mutationHeaders(),
      body: body == null ? undefined : JSON.stringify(body),
    }).then(handle<T>),
  delete: <T>(path: string) =>
    fetch(path, { credentials: "same-origin", headers: mutationHeaders(), method: "DELETE" }).then(
      handle<T>,
    ),
};

// Generic resource helpers (REST-style over /api/resources/[collection]).
export const resource = {
  list: <T>(collection: string, params?: Record<string, string | number | boolean | undefined>) => {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== "") qs.set(k, String(v));
      }
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api.get<{ data: T[] }>(`/api/resources/${collection}${suffix}`).then((r) => r.data);
  },
  get: <T>(collection: string, id: string) =>
    api.get<{ data: T }>(`/api/resources/${collection}/${id}`).then((r) => r.data),
  create: <T>(collection: string, body: unknown) =>
    api.post<{ data: T }>(`/api/resources/${collection}`, body).then((r) => r.data),
  update: <T>(collection: string, id: string, body: unknown) =>
    api.patch<{ data: T }>(`/api/resources/${collection}/${id}`, body).then((r) => r.data),
  remove: (collection: string, id: string) =>
    api.delete<{ ok: boolean }>(`/api/resources/${collection}/${id}`),
};

export const action = (name: string, body: unknown, method: "POST" | "PATCH" = "POST") =>
  method === "PATCH"
    ? api.patch<{ data: unknown }>(`/api/actions/${name}`, body)
    : api.post<{ data: unknown }>(`/api/actions/${name}`, body);

// ---------------------------------------------------------------------------
// Session-scoped calls use same-origin cookies. JavaScript can read the CSRF
// token but never the encrypted HttpOnly session reference.
// ---------------------------------------------------------------------------

function csrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const expectedName = window.location.protocol === "https:" ? "__Host-csrf" : "rp-dev-csrf";
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=", 2))
    .find(([name]) => name === expectedName)?.[1];
}

function mutationHeaders(): Record<string, string> {
  const token = csrfToken();
  return {
    "Content-Type": "application/json",
    ...(token === undefined ? {} : { "x-rp-csrf-token": decodeURIComponent(token) }),
  };
}

export const sessionApi = {
  get: <T>(path: string) =>
    fetch(path, { credentials: "same-origin" }).then(handle<T>),
  post: <T>(path: string, body?: unknown) =>
    fetch(path, {
      credentials: "same-origin",
      method: "POST",
      headers: mutationHeaders(),
      body: body == null ? undefined : JSON.stringify(body),
    }).then(handle<T>),
  patch: <T>(path: string, body?: unknown) =>
    fetch(path, {
      credentials: "same-origin",
      method: "PATCH",
      headers: mutationHeaders(),
      body: body == null ? undefined : JSON.stringify(body),
    }).then(handle<T>),
};

export const authClient = {
  current: () => api.get<CurrentSession>("/api/bff/auth/session"),
  logout: () => api.post<LogoutResponse>("/api/bff/auth/logout"),
  refresh: () => api.post<{ refreshed: true }>("/api/bff/auth/refresh"),
};

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; [key: string]: unknown };
}
