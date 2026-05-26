# LiveImproved Ad System

This folder is the production ad blueprint for **LiveImproved**, the habit tracker app.

## What this system is
- a library of native social ad concepts
- a UI asset audit grounded in the real product codebase
- a testing plan for short-form paid social
- a reusable template for future iterations

## Creative rules
- Hook in the first 0.5s.
- Keep the format native to TikTok, Reels, Shorts, and Meta.
- Use creator / UGC energy, not corporate brand video energy.
- Burn captions into every video.
- Use real app screens, components, and assets only.
- Do not invent screenshots, stats, testimonials, ratings, or proof.
- Do not make medical claims.
- Keep one message per ad.
- Put the CTA in the final 2 seconds.

## What the repo actually has
The habit tracker repo *does* contain real product screens and assets:
- homepage / landing page
- login
- dashboard
- habits / add-habit flow
- daily entry / planner / coach entry flow
- analytics
- settings / reminder controls
- app icon and splash assets

## Screenshot capture checklist
Capture these real screens before production editing:
- Dashboard / Home / Today with streak and today summary
- Add Habit flow from the habits page
- Reminder / Schedule settings
- Progress / streak state from the dashboard
- Analytics / weekly review if shown in the app
- Login / onboarding if needed for ad opening shots
- App icon / splash for end cards

Capture rules:
- use the real app only
- no fake numbers or fabricated charts
- no browser chrome in the final media
- export 1080x1920 vertical frames where possible
- keep text legible on mobile
- keep the UI shot stable long enough to read

## Folder index
- `UI_ASSET_AUDIT.md`
- `VIDEO_AD_CONCEPTS.md`
- `STATIC_AD_CONCEPTS.md`
- `HOOK_LIBRARY.md`
- `CTA_LIBRARY.md`
- `AB_TESTING_PLAN.md`
- `PLATFORM_EXPORT_SPECS.md`
- `HERMES_AD_TEMPLATE.md`

## Current status
- real app screens confirmed in code
- no fake-proof creative allowed
- production ad concepts should mix creator footage with actual UI captures
