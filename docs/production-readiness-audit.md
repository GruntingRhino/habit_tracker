# Production Readiness Audit

Date: 2026-05-13

## Completed Hardening

### Security fixes

- Locked `provision-user` behind a dedicated secret and disabled it in production:
  [src/app/api/provision-user/route.ts](/Users/abhay/RTB/habit_tracker/src/app/api/provision-user/route.ts)
- Locked `seed` behind a dedicated secret and disabled it in production:
  [src/app/api/seed/route.ts](/Users/abhay/RTB/habit_tracker/src/app/api/seed/route.ts)
- Fixed cross-resource delete authorization for workout exercises:
  [src/app/api/weights/routines/[id]/exercises/route.ts](/Users/abhay/RTB/habit_tracker/src/app/api/weights/routines/[id]/exercises/route.ts)
- Fixed bulk reorder authorization so task IDs must belong to the current project:
  [src/app/api/projects/[id]/tasks/route.ts](/Users/abhay/RTB/habit_tracker/src/app/api/projects/[id]/tasks/route.ts)
- Added baseline security headers:
  [next.config.ts](/Users/abhay/RTB/habit_tracker/next.config.ts)
- Replaced process-local auth throttling with a shared Prisma-backed rate-limit bucket model:
  [src/lib/rate-limit.ts](/Users/abhay/RTB/habit_tracker/src/lib/rate-limit.ts),
  [prisma/schema.prisma](/Users/abhay/RTB/habit_tracker/prisma/schema.prisma)
- Added IP-aware login throttling and password-change throttling:
  [src/lib/auth.ts](/Users/abhay/RTB/habit_tracker/src/lib/auth.ts),
  [src/app/api/auth/change-password/route.ts](/Users/abhay/RTB/habit_tracker/src/app/api/auth/change-password/route.ts)

### Functional production fixes

- Added missing authenticated profile update route:
  [src/app/api/auth/update-profile/route.ts](/Users/abhay/RTB/habit_tracker/src/app/api/auth/update-profile/route.ts)
- Added missing authenticated password change route:
  [src/app/api/auth/change-password/route.ts](/Users/abhay/RTB/habit_tracker/src/app/api/auth/change-password/route.ts)
- Added native wake challenge flow and local test trigger:
  [ios/App/App/WakeChallengeManager.swift](/Users/abhay/RTB/habit_tracker/ios/App/App/WakeChallengeManager.swift),
  [ios/App/App/WakeChallengeViewController.swift](/Users/abhay/RTB/habit_tracker/ios/App/App/WakeChallengeViewController.swift),
  [src/app/(app)/settings/page.tsx](/Users/abhay/RTB/habit_tracker/src/app/(app)/settings/page.tsx)
- Removed invalid `"use server"` marker from wake alarm schema helper:
  [src/lib/wake-alarm.ts](/Users/abhay/RTB/habit_tracker/src/lib/wake-alarm.ts)
- Removed CSS import warning that polluted production builds:
  [src/app/globals.css](/Users/abhay/RTB/habit_tracker/src/app/globals.css)

### Dependency upgrades

- `next` -> `16.2.6`
- `eslint-config-next` -> `16.2.6`
- `prisma` -> `7.8.0`
- `@prisma/client` -> `7.8.0`
- `@prisma/adapter-neon` -> `7.8.0`
- `next-auth` -> `4.24.14`
- `postcss` -> `8.5.14`

## Verification Performed

- `npx eslint ... && npx tsc --noEmit`
- `npm run build`
- `npx prisma validate`
- `npm test`

## Current State

### Good

- Production web build succeeds.
- High-severity runtime advisories from `next` and `prisma` are no longer present in `npm audit --omit=dev`.
- Core API surface now has stronger authz around the two discovered nested-resource bugs.
- Developer bootstrap endpoints no longer expose production risk by default.

### Remaining Risks

1. No automated test suite
- Build and typecheck pass, but there are no integration or e2e tests proving auth, tenant isolation, or main user flows.

2. Incomplete request validation coverage
- Many write routes still accept loosely shaped JSON and should be migrated to explicit Zod schemas.

3. Auth hardening is still minimal
- Shared throttling now exists, but there is still no MFA, no WAF/CDN-level rate limiting, and no abuse analytics.

4. Monitoring/incident readiness is absent
- No Sentry, structured audit logging, uptime checks, or alerting pipeline is configured.

5. Native wake verification is still MVP-grade
- The iOS app target now has a native wake challenge, but non-step missions still use device-motion heuristics instead of camera/Vision verification.
- AlarmKit secondary action and richer native alarm UX still need device-build validation and final polish.

6. Residual moderate/low audit noise remains
- `npm audit` still reports ecosystem advisories tied to `next-auth`, nested `postcss`, and Prisma’s current toolchain packaging.
- These require case-by-case review rather than blind `audit fix --force`.

## Before Public Launch

1. Add end-to-end tests for:
- login
- daily entry CRUD
- habit CRUD
- project/task CRUD
- wake alarm settings CRUD
- tenant isolation negative cases

2. Keep closing schema validation gaps and add route-level negative tests.

3. Add observability:
- Sentry or equivalent
- request/error logging
- health checks

4. Add deployment controls:
- production env validation
- staging environment
- CI on lint, typecheck, build, and tests

5. Harden the native iOS layer:
- device-build and TestFlight validation
- camera/Vision verification for bodyweight missions
- App Intents / AlarmKit secondary flow
- production screenshots and review metadata

## Ship Decision

Web app:
- Closer to production than before, but not yet “fully production ready”.

iOS App Store release:
- Closer, but not ready yet. The remaining blockers are native verification quality, Xcode device-build validation, and App Store submission assets.
