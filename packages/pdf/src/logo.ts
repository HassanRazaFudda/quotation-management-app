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
/** Junaidi Air Travel's logo, printed on Umrah quotations: the emblem and the lettered name. */
export const UMRAH_EMBLEM_PATH = join(here, "..", "assets", "umrah-emblem.jpg");
export const UMRAH_WORDMARK_PATH = join(here, "..", "assets", "umrah-wordmark.jpg");

/** Each file is read once and kept in memory. */
const cache = new Map<string, string>();

const mimeOf = (path: string): string => (/\.jpe?g$/i.test(path) ? "image/jpeg" : "image/png");

/** Base64 data URI for the logo, read once and kept in memory. */
export async function loadLogoDataUri(path: string = LOGO_PATH): Promise<string> {
  const known = cache.get(path);
  if (known !== undefined) return known;

  let uri = "";
  try {
    const bytes = await readFile(path);
    uri = `data:${mimeOf(path)};base64,${bytes.toString("base64")}`;
  } catch {
    // A missing logo should not stop a quotation going out.
  }
  cache.set(path, uri);
  return uri;
}

/** The Umrah letterhead's logo, as its two parts. */
export async function loadUmrahLogo(): Promise<{ emblem: string; wordmark: string }> {
  const [emblem, wordmark] = await Promise.all([
    loadLogoDataUri(UMRAH_EMBLEM_PATH),
    loadLogoDataUri(UMRAH_WORDMARK_PATH),
  ]);
  return { emblem, wordmark };
}
