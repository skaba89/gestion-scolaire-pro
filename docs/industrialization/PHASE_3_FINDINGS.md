# Phase 3 findings — functional stabilization

## Scope
Post-merge review after phase 2 landed in `main`.

## Findings

### 1. Frontend bootstrap still contains production-risk debug behavior
`src/main.tsx` currently:
- force-unregisters all service workers on every boot
- logs bootstrap details to console
- injects DOM overlays for runtime errors

This is useful during incident debugging but too aggressive for a production-facing application.

### 2. Auth layer still carries legacy naming and compatibility debt
`src/contexts/AuthContext.tsx` already uses OIDC / Keycloak, but it still exposes a `SupabaseUserShape` compatibility model and several debug `console.log` calls. This creates confusion in the codebase and increases maintenance cost.

### 3. Auth redirect and UX hardening still need review
The OIDC config uses `redirect_uri: window.location.origin`, which may be acceptable for a single-root app, but SchoolFlow uses tenant-aware paths and role-based routed dashboards. This should be validated carefully for tenant-specific login/logout journeys.

## Recommended actions
1. Replace hard debug behavior in `src/main.tsx` with environment-gated diagnostics.
2. Rename/remove legacy Supabase compatibility types from auth context.
3. Audit auth callback, logout redirect, and tenant-aware navigation after sign-in.
4. Add smoke tests for login bootstrap and protected-route rendering.
