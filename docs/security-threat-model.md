# Security Threat Model

## Overview

GoodHabits is a multi-surface personal tracking application:

- Next.js web app for authenticated end users
- JSON API routes under `src/app/api`
- Neon/Postgres persistence through Prisma
- AI-assisted features using Groq and optional Ollama
- Capacitor iOS shell intended to become the App Store client

The primary security goal is to prevent one user from reading or modifying another user's data while protecting credentials, session state, and any AI/provider secrets. Public exposure is the web app and its API routes; the iOS app is a native shell over the same backend.

## Threat Model, Trust Boundaries, and Assumptions

### Trust boundaries

1. Browser or mobile client to Next.js app
- Untrusted user input enters through forms and API requests.
- Session cookies are the primary authenticated boundary.

2. Next.js server to Postgres via Prisma
- Server code is trusted.
- Database records must remain tenant-scoped by `userId` or parent ownership checks.

3. Next.js server to external AI providers
- Groq and Ollama calls cross a separate network trust boundary.
- Prompts may include personal data from user records.

4. Local development and admin-only tooling
- `seed` and `provision-user` endpoints are developer conveniences and must never be production-open.

### Assumptions

- `NEXTAUTH_SECRET`, `DATABASE_URL`, and any AI/provider secrets are supplied securely.
- HTTPS terminates before production traffic reaches the app.
- Only authenticated users should access tracking data and mutate their own records.
- The future iOS app will share the same backend auth model unless replaced deliberately.

## Attack Surface, Mitigations, and Attacker Stories

### Main attack surfaces

- Credential login: [src/lib/auth.ts](/Users/abhay/RTB/habit_tracker/src/lib/auth.ts)
- Authenticated CRUD APIs across habits, projects, meals, workouts, daily entries
- AI-backed routes and outbound model calls: [src/app/api/chat/daily/route.ts](/Users/abhay/RTB/habit_tracker/src/app/api/chat/daily/route.ts), [src/lib/coach.ts](/Users/abhay/RTB/habit_tracker/src/lib/coach.ts), [src/lib/ollama.ts](/Users/abhay/RTB/habit_tracker/src/lib/ollama.ts)
- Development/admin endpoints: [src/app/api/provision-user/route.ts](/Users/abhay/RTB/habit_tracker/src/app/api/provision-user/route.ts), [src/app/api/seed/route.ts](/Users/abhay/RTB/habit_tracker/src/app/api/seed/route.ts)
- Mobile shell configuration: [capacitor.config.ts](/Users/abhay/RTB/habit_tracker/capacitor.config.ts), [ios/App/App/Info.plist](/Users/abhay/RTB/habit_tracker/ios/App/App/Info.plist)

### Mitigations now present

- Session checks on application API routes via `getServerSession`
- Production-disabled developer endpoints for seed/provision
- Constant-time comparison for developer secrets
- Ownership checks on nested workout/project resources
- Response security headers in [next.config.ts](/Users/abhay/RTB/habit_tracker/next.config.ts)
- Password hashing with bcrypt

### Real attacker stories

- Authenticated attacker attempts cross-tenant object mutation by sending another record ID.
- Unauthenticated attacker probes forgotten developer endpoints in production.
- Authenticated user abuses weak validation to push malformed data or cross-resource references.
- External attacker targets known framework/package CVEs in outdated runtime dependencies.

### Out-of-scope or lower-probability stories

- Direct database compromise outside the app boundary
- Device compromise on the end-user phone or laptop
- Nation-state level attacks against Groq/Ollama infrastructure

## Severity Calibration

### Critical

- Any bug that allows unauthenticated access to all user records or arbitrary account takeover.
- Any production-open debug/provisioning endpoint that creates users or resets data without strong access control.

### High

- Cross-tenant write or delete through predictable IDs on nested resources.
- Session/auth bypass allowing one user to read or mutate another user's projects, habits, meals, or workouts.
- Shipping known exploitable high-severity framework/runtime advisories in `next` or `prisma`.

### Medium

- Missing validation causing integrity corruption, malformed timestamps, or unsafe object references without immediate tenant escape.
- AI prompt/data leakage to third-party providers beyond user expectation.
- Missing security headers, weak privacy metadata, or incomplete production endpoint hardening.

### Low

- Cosmetic auth UX bugs.
- Non-sensitive error detail leakage.
- Developer-only tooling risk that is already disabled in production.
