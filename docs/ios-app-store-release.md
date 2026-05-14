# iOS App Store Release

## What exists now

- Capacitor iOS app shell in `ios/App`
- Bundle id: `com.gruntingrhino.habittracker`
- App name: `GoodHabits`
- App Store baseline privacy strings for camera, motion, and AlarmKit
- Hosted-web configuration through `CAPACITOR_SERVER_URL`
- Native wake-alarm plugin registration in the iOS target
- Native wake challenge presentation and test hook from Settings
- Motion-backed verification:
  - step counting for `steps`
  - device-motion rep counting for `jumping_jacks`, `push_ups`, and `mixed`
- wake-up recheck local notification after challenge completion

## What still must be built before submission

1. Native wake challenge hardening

- camera/Vision-based verification for push-ups and jumping jacks
- App Intents / AlarmKit secondary action flow
- native state restoration and deeper failure analytics

2. Production mobile backend path

- stable hosted HTTPS origin for the app web UI
- mobile auth/session validation
- device build validation against the installed iOS SDK in Xcode

3. App Store assets

- app icon set
- screenshots
- privacy policy URL
- support URL
- App Store description

## Local workflow

1. Deploy the web app to a stable HTTPS origin.
2. Set `CAPACITOR_SERVER_URL` to that origin.
3. Run `npm run cap:sync`.
4. Apply the Prisma migration for `RateLimitBucket`.
5. Run `npm run cap:ios`.
6. Configure signing in Xcode.
7. Install the required iOS platform runtime in Xcode if missing.
8. Archive and ship to TestFlight.

## Public release path

1. Internal device testing from Xcode
2. TestFlight beta
3. App Store submission

## Hard constraint

The current iOS target now contains native wake-alarm and wake-challenge plumbing, but it is not yet a fully hardened alarm product. Public App Store release is realistic from this base once the Xcode device build, camera-grade verification, and final review assets are completed.
