# iOS App Store Release

## What exists now

- Capacitor iOS app shell in `ios/App`
- Bundle id: `com.gruntingrhino.habittracker`
- App name: `GoodHabits`
- App Store baseline privacy strings for camera, motion, and AlarmKit
- Hosted-web configuration through `CAPACITOR_SERVER_URL`

## What still must be built before submission

1. Native wake alarm implementation

- AlarmKit scheduling
- App Intents integration
- wake challenge verification
- recheck / escalation flow

2. Production mobile backend path

- stable hosted HTTPS origin for the app web UI
- mobile auth/session validation
- mobile-safe deep link flow into wake challenge routes

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
4. Run `npm run cap:ios`.
5. Configure signing in Xcode.
6. Archive and ship to TestFlight.

## Public release path

1. Internal device testing from Xcode
2. TestFlight beta
3. App Store submission

## Hard constraint

The current iOS target is an app shell. Public App Store release is realistic from this base, but the wake-alarm feature itself still requires native AlarmKit work before the app matches the product goal.
