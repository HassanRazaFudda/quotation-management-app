import { notFound } from "next/navigation";

import { UMRAH_SETTINGS_ENABLED } from "@/lib/features";

/** The Umrah settings page is a 404 on a deployment that does not have it switched on. */
export default function UmrahSettingsLayout({ children }: { children: React.ReactNode }) {
  if (!UMRAH_SETTINGS_ENABLED) notFound();
  return <>{children}</>;
}
