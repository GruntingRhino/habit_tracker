import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.gruntingrhino.habittracker",
  appName: "GoodHabits",
  webDir: "mobile-shell",
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: serverUrl.startsWith("http://"),
      }
    : undefined,
  ios: {
    contentInset: "always",
  },
};

export default config;
