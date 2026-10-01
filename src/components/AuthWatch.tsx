"use client";

import { useEffect } from "react";

/** Any API call answered 401 (logged out, or the password was changed elsewhere): to the login page. */
export default function AuthWatch() {
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const res = await original(...args);
      const url = String(args[0] instanceof Request ? args[0].url : args[0]);
      if (res.status === 401 && (url.startsWith("/api/") || url.startsWith(`${location.origin}/api/`)) && !url.includes("/api/auth/")) {
        window.location.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);
  return null;
}
