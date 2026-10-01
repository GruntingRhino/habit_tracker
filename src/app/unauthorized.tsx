"use client";

import { useEffect } from "react";

/** A page request without a valid session (e.g. the password was changed elsewhere): to the login page. */
export default function Unauthorized() {
  useEffect(() => {
    window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, []);
  return null;
}
