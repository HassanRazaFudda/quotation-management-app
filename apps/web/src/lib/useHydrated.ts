"use client";

import { useEffect, useState } from "react";

/** True once the client has mounted, so persisted auth state can be trusted. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
