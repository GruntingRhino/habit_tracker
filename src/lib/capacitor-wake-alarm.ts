import { Capacitor, registerPlugin } from "@capacitor/core";
import type { WakeAlarmSettings } from "@/lib/wake-alarm";

interface WakeAlarmPlugin {
  requestPermission(): Promise<{ granted: boolean }>;
  scheduleAlarms(options: { settings: WakeAlarmSettings }): Promise<{ scheduled: boolean }>;
  cancelAlarms(): Promise<void>;
  getPermissionStatus(): Promise<{ status: "granted" | "denied" | "notDetermined" }>;
  startChallenge(options: { settings: WakeAlarmSettings }): Promise<{ status: WakeChallengeStatus }>;
  getChallengeStatus(): Promise<{ status: WakeChallengeStatus }>;
  dismissChallenge(): Promise<void>;
}

export interface WakeChallengeStatus {
  active: boolean;
  completed: boolean;
  missionType: string;
  effectiveMissionType: string;
  target: number;
  progress: number;
  strictMode: boolean;
  message: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

// Registered only on native — on web the stub is a no-op.
const NativeWakeAlarm = registerPlugin<WakeAlarmPlugin>("WakeAlarmPlugin");

export function isNativeAlarmSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function requestAlarmPermission(): Promise<boolean> {
  if (!isNativeAlarmSupported()) return false;
  const { granted } = await NativeWakeAlarm.requestPermission();
  return granted;
}

export async function scheduleWakeAlarms(settings: WakeAlarmSettings): Promise<boolean> {
  if (!isNativeAlarmSupported()) return false;
  // Keep a local mirror for web resume paths. The native plugin persists the canonical
  // copy to UserDefaults before scheduling so AppDelegate can re-sync on foreground.
  persistSettingsLocally(settings);
  const { scheduled } = await NativeWakeAlarm.scheduleAlarms({ settings });
  return scheduled;
}

export async function cancelWakeAlarms(): Promise<void> {
  if (!isNativeAlarmSupported()) return;
  await NativeWakeAlarm.cancelAlarms();
}

export async function getAlarmPermissionStatus(): Promise<"granted" | "denied" | "notDetermined" | "unsupported"> {
  if (!isNativeAlarmSupported()) return "unsupported";
  const { status } = await NativeWakeAlarm.getPermissionStatus();
  return status;
}

export async function startWakeChallenge(settings: WakeAlarmSettings): Promise<WakeChallengeStatus | null> {
  if (!isNativeAlarmSupported()) return null;
  const { status } = await NativeWakeAlarm.startChallenge({ settings });
  return status;
}

export async function getWakeChallengeStatus(): Promise<WakeChallengeStatus | null> {
  if (!isNativeAlarmSupported()) return null;
  const { status } = await NativeWakeAlarm.getChallengeStatus();
  return status;
}

export async function dismissWakeChallenge(): Promise<void> {
  if (!isNativeAlarmSupported()) return;
  await NativeWakeAlarm.dismissChallenge();
}

// Serialise settings to a well-known UserDefaults key so AppDelegate.syncWakeAlarmsIfNeeded
// can re-schedule on foreground without needing to hit the API.
function persistSettingsLocally(settings: WakeAlarmSettings): void {
  try {
    localStorage.setItem("wakeAlarmSettings", JSON.stringify(settings));
  } catch {
    // localStorage may not be available in SSR contexts
  }
}
