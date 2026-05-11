# Wake Alarm Plan

## Constraint

This repository is a Next.js web app. A real iPhone wake alarm with `AlarmKit` cannot run from this codebase alone.

## What the web app now owns

- Alarm schedule
- Repeat days
- Mission type
- Challenge target
- Wake-up recheck minutes
- Strict mode

These settings are stored in `CoachProfile.preferences.wakeAlarm` through `/api/wake-alarm`.

## Native iOS app required for

- Exact `6:00 AM` alarm execution
- AlarmKit scheduling
- Foreground wake challenge launch
- Camera / motion verification
- Anti-sleep recheck flow

## Delivery options

1. Private use on your own devices

- Build a native iOS client in Xcode
- Sign with your Apple ID
- Install directly on your phone

2. Small closed beta

- Ship through TestFlight

3. Public product

- Publish to the App Store

## Recommended build order

1. Keep the alarm settings in this web app as the source of truth.
2. Build a SwiftUI iOS 18+ client that logs into the same backend.
3. Read `/api/wake-alarm` from iOS.
4. Schedule the native alarm with AlarmKit.
5. Launch a wake challenge screen for steps first.
6. Add Vision-based jumping-jack or push-up verification after that.
