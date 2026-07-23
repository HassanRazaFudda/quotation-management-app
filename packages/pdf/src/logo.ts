/**
 * The company logo, embedded in the page as a data URI.
 *
 * Embedding rather than linking matters: the rendered page then makes no
 * network requests at all, so it cannot be slowed down or broken by a missing
 * file, a strict CSP, or a container without outbound access.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const LOGO_PATH = join(here, "..", "assets", "logo.png");

let cached: string | null = null;

/** Base64 data URI for the logo, read once and kept in memory. */
export async function loadLogoDataUri(path: string = LOGO_PATH): Promise<string> {
  if (cached !== null && path === LOGO_PATH) return cached;

  try {
    const bytes = await readFile(path);
    const uri = `data:image/png;base64,${bytes.toString("base64")}`;
    if (path === LOGO_PATH) cached = uri;
    return uri;
  } catch {
    // A missing logo should not stop a quotation going out.
    if (path === LOGO_PATH) cached = "";
    return "";
  }
}
