import { describe, expect, it } from 'vitest';
import { api } from './helpers/app.js';

describe('service health', () => {
  it('reports liveness without touching the database', async () => {
    const res = await api().get('/api/v1/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('reports readiness once migrations have been applied', async () => {
    const res = await api().get('/api/v1/readyz');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('reachable');
  });

  it('echoes a correlation id on every response', async () => {
    const res = await api().get('/api/v1/healthz').set('X-Request-Id', 'trace-me-123');
    expect(res.headers['x-request-id']).toBe('trace-me-123');
  });

  it('generates a correlation id when the caller does not supply one', async () => {
    const res = await api().get('/api/v1/healthz');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the uniform error envelope for an unknown route', async () => {
    const res = await api().get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('sets security headers', async () => {
    const res = await api().get('/api/v1/healthz');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
