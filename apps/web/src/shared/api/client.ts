import type { ApiErrorBody, ErrorCode } from '@taskforge/shared';

const BASE = import.meta.env.VITE_API_URL ?? '';
const ACCESS_KEY = 'taskforge.access';
const REFRESH_KEY = 'taskforge.refresh';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ErrorCode | 'NETWORK',
    readonly details?: Array<{ field: string; message: string }>,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field errors keyed by field name, for inline form messages. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).map((d) => [d.field, d.message]));
  }
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const tokens = {
  access: () => read(ACCESS_KEY),
  refresh: () => read(REFRESH_KEY),
  set(access: string, refresh: string) {
    try {
      localStorage.setItem(ACCESS_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
    } catch { /* private mode */ }
  },
  clear() {
    try {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
    } catch { /* private mode */ }
  },
};

/** Fired when refresh fails, so the app can drop to the login screen. */
export const SESSION_LOST = 'taskforge:session-lost';

/**
 * Silent refresh with a single-flight guard: if five requests hit a 401 at the
 * same moment, exactly one refresh runs and the other four wait for it. Without
 * this, a page load fans out into five refreshes, four of which look like token
 * reuse to the server and log the user out.
 */
let refreshInFlight: Promise<boolean> | null = null;

const refreshTokens = async (): Promise<boolean> => {
  const refreshToken = tokens.refresh();
  if (!refreshToken) return false;

  const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    tokens.clear();
    window.dispatchEvent(new CustomEvent(SESSION_LOST));
    return false;
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  tokens.set(data.accessToken, data.refreshToken);
  return true;
};

const ensureFreshToken = (): Promise<boolean> => {
  refreshInFlight ??= refreshTokens().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  formData?: FormData;
  retryOn401?: boolean;
}

const send = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, formData, retryOn401 = true } = options;
  const access = tokens.access();

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: {
        ...(formData ? {} : { 'Content-Type': 'application/json' }),
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running on port 4000?', 0, 'NETWORK');
  }

  if (res.status === 401 && retryOn401 && tokens.refresh()) {
    const refreshed = await ensureFreshToken();
    if (refreshed) return send<T>(path, { ...options, retryOn401: false });
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const envelope = payload as ApiErrorBody | null;
    if (res.status === 401) {
      tokens.clear();
      window.dispatchEvent(new CustomEvent(SESSION_LOST));
    }
    throw new ApiError(
      envelope?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      envelope?.error?.code ?? 'NETWORK',
      envelope?.error?.details,
      payload,
    );
  }
  return payload as T;
};

export const api = {
  get: <T>(path: string) => send<T>(path),
  post: <T>(path: string, body?: unknown) => send<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => send<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => send<T>(path, { method: 'POST', formData }),
  /** Absolute URL for a link the browser follows itself (downloads). */
  absolute: (path: string) => `${BASE}${path}`,
};
