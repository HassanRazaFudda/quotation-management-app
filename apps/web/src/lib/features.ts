/**
 * Parts of the app that are not part of what every client gets.
 *
 * The Umrah settings page (letterhead and default text for Umrah quotations) is
 * shown only on a deployment built with `NEXT_PUBLIC_UMRAH_SETTINGS_ENABLED=true`;
 * the API has its own `UMRAH_SETTINGS_ENABLED`. Next.js bakes `NEXT_PUBLIC_*`
 * values in at build time, so changing it means a rebuild.
 */
export const UMRAH_SETTINGS_ENABLED = ["true", "1"].includes(
  (process.env.NEXT_PUBLIC_UMRAH_SETTINGS_ENABLED ?? "").trim().toLowerCase(),
);
