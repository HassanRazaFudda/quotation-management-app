"use client";

import { useEffect } from "react";

/** Register the service worker once, in production only. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    // Register after load so it never competes with the first paint.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
