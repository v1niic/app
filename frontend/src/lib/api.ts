// Typed fetch layer over the FastAPI backend. Na web a base é o prefixo relativo "/api": o mesmo código
// funciona no dev (Vite faz proxy de /api → :8001) e em produção, onde front e API dividem a origem.
// No app móvel (Capacitor) não há origem em comum: o build define VITE_API_URL (ex.: https://vaidebike.vercel.app)
// e a sessão passa a viajar como `Authorization: Bearer`, guardada em localStorage.
const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/$/, "");
const BASE = `${API_URL}/api`;
/** Endereço completo de um arquivo servido pela API (ex.: foto de alerta), para usar em <img src>. */
export const mediaUrl = (path: string): string => `${BASE}${path}`;
const USE_TOKEN = API_URL !== "";
const TOKEN_KEY = "vdb_token";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // armazenamento indisponível
  }
}

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  // Na web a sessão viaja no cookie httpOnly; só o build móvel (USE_TOKEN) manda o token no header.
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = USE_TOKEN ? readToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (USE_TOKEN) {
    const fresh = res.headers.get("X-Session-Token");
    if (fresh) {
      try {
        localStorage.setItem(TOKEN_KEY, fresh);
      } catch {
        // sem armazenamento: a sessão dura só até recarregar
      }
    }
  }

  // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);

/** Human message from an ApiError — FastAPI sends `{detail: "..."}` for HTTPException and `{detail: [...]}` for 422s. */
export function apiDetail(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const b = err.body as { detail?: unknown } | null;
    if (typeof b?.detail === "string") return b.detail;
  }
  return fallback;
}
