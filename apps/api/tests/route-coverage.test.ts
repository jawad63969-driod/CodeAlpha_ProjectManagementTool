import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

/**
 * The guard that makes FR-C-04 structural rather than aspirational: every
 * mutating route must declare a permission through `authorize()`. Adding a
 * POST/PATCH/DELETE without one fails this test, so a forgotten check cannot
 * reach production.
 *
 * The allowlist below is short, explicit and each entry is justified — that is
 * the point. An unexplained addition to it should not survive review.
 */
const PUBLIC_OR_SELF_SCOPED = new Set([
  'POST /api/v1/auth/register',            // creating an account — no caller yet
  'POST /api/v1/auth/login',               // no caller yet
  'POST /api/v1/auth/refresh',             // authenticated by the refresh token itself
  'POST /api/v1/auth/logout',              // authenticated by the refresh token itself
  'PATCH /api/v1/auth/me',                 // acts only on the caller's own record
  'POST /api/v1/auth/workspaces/switch',   // membership is verified inside the service
  'PATCH /api/v1/notifications/:notificationId/read', // scoped to the caller's own inbox by the WHERE clause
  'POST /api/v1/notifications/read-all',              // same: acts only on rows owned by the caller
]);

interface Layer {
  name?: string;
  route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle?: unknown }> };
  handle?: { stack?: Layer[] };
  matchers?: unknown;
  path?: string;
}

const collectRoutes = (stack: Layer[], prefix = ''): Array<{ key: string; guarded: boolean }> => {
  const found: Array<{ key: string; guarded: boolean }> = [];

  for (const layer of stack) {
    if (layer.route?.path && layer.route.methods) {
      const guarded = (layer.route.stack ?? []).some(
        (entry) => typeof entry.handle === 'function' && '__permission' in (entry.handle as object),
      );
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (!enabled) continue;
        found.push({ key: `${method.toUpperCase()} ${prefix}${layer.route.path}`, guarded });
      }
    } else if (layer.handle && Array.isArray(layer.handle.stack)) {
      found.push(...collectRoutes(layer.handle.stack, prefix));
    }
  }
  return found;
};

describe('route authorization coverage (FR-C-04)', () => {
  const app = createApp();
  // Express 5 exposes the router directly; fall back for older shapes.
  const router = (app as unknown as { router?: { stack: Layer[] }; _router?: { stack: Layer[] } });
  const stack = router.router?.stack ?? router._router?.stack ?? [];
  const routes = collectRoutes(stack, '/api/v1');

  it('discovers the registered routes', () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it('guards every mutating route with a declared permission', () => {
    const unguarded = routes
      .filter((route) => /^(POST|PATCH|PUT|DELETE)/.test(route.key))
      .filter((route) => !route.guarded)
      .map((route) => route.key)
      .filter((key) => !PUBLIC_OR_SELF_SCOPED.has(key));

    expect(unguarded, `Unguarded mutating routes:\n${unguarded.join('\n')}`).toEqual([]);
  });
});
