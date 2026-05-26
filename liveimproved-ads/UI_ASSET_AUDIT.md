# UI Asset Audit

Format:
- Screen/asset
- Exists
- Path
- Usable in ads
- Feature shown
- Notes

## Audit
- **Homepage / landing page**
  - Exists: yes
  - Path: `src/app/page.tsx`
  - Usable in ads: yes
  - Feature shown: product positioning, hero demo phone, score-driven system overview
  - Notes: good for top-of-funnel product intro and end-card positioning; not proof by itself

- **Login / onboarding**
  - Exists: yes
  - Path: `src/app/(auth)/login/page.tsx`
  - Usable in ads: yes
  - Feature shown: sign-in / sign-up flow
  - Notes: useful for onboarding-style or retargeting creative

- **Dashboard / Home / Today**
  - Exists: yes
  - Path: `src/app/(app)/dashboard/page.tsx`, `src/components/DashboardTabs.tsx`, `src/components/DashboardScores.tsx`
  - Usable in ads: yes
  - Feature shown: today score, streak, habit completion, active projects, entry CTA
  - Notes: this is the best proof screen for "consistency made visible"

- **Add Habit / Habit library**
  - Exists: yes
  - Path: `src/app/(app)/habits/page.tsx`
  - Usable in ads: yes
  - Feature shown: habit library and instant add habit modal
  - Notes: strong for the 3-step demo and one-habit challenge

- **Reminder / Schedule**
  - Exists: yes
  - Path: `src/app/(app)/settings/page.tsx`, `src/components/DailyEntryReminder.tsx`, `src/app/api/wake-alarm/route.ts`
  - Usable in ads: yes
  - Feature shown: reminder controls, alarm configuration, wake settings
  - Notes: supports the “set your first reminder” CTA

- **Progress / streak**
  - Exists: yes
  - Path: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/analytics/page.tsx`
  - Usable in ads: yes
  - Feature shown: streak, score trend, progression views, charts
  - Notes: use real captured UI only; do not fake streak numbers

- **Weekly review / analytics**
  - Exists: yes
  - Path: `src/app/(app)/analytics/page.tsx`
  - Usable in ads: yes
  - Feature shown: line charts, radar charts, habit stats, project stats, category scores
  - Notes: best for credibility shots and retargeting

- **App icon / splash**
  - Exists: yes
  - Path: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`, `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png`
  - Usable in ads: yes
  - Feature shown: brand identity only
  - Notes: good for end cards and store-style framing

- **Paywall**
  - Exists: no confirmed paywall asset found
  - Path: none found
  - Usable in ads: no
  - Feature shown: n/a
  - Notes: searched the repo for paywall / subscription / pricing / upgrade / pro plan and found nothing

## Important note
The older `LiveImproved/` ad mockups in the Ads repo are *not* real product proof. They are creative mockups and should not be used as UI evidence for product ads.
