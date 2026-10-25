# ADR-005 — React SPA in preference to Next.js

**Status:** Accepted · **Date:** Sprint 0

## Context
The brief asks for a demonstrable separation of frontend and backend. The product is a
behind-login application tool with no SEO requirement and a heavy WebSocket dependency.

## Decision
React 19 + Vite SPA, deployed as static assets, talking to an independently deployable API.

## Consequences
**Positive** — a genuinely separate, independently deployable API that a mobile client could
reuse unchanged; WebSocket lifecycle lives in one place instead of straddling server and
client components; the smallest possible gap between what the reviewer reads and what runs.
**Negative** — no SSR, so first paint is slower and SEO is absent (neither matters for an
authenticated tool); auth guarding is client-side, which the API must therefore never trust.
**Rejected** — Next.js App Router: strong on a CV, but it blurs the tier boundary the brief
asks to demonstrate and complicates the socket layer for no benefit here.
