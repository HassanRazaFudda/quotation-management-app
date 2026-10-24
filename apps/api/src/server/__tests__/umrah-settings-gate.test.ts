import { afterEach, describe, expect, it, vi } from "vitest";

import { routeWhen, umrahSettingsEnabled } from "../http";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the Umrah settings switch", () => {
  it("is off unless UMRAH_SETTINGS_ENABLED is turned on", () => {
    vi.stubEnv("UMRAH_SETTINGS_ENABLED", "");
    expect(umrahSettingsEnabled()).toBe(false);
    vi.stubEnv("UMRAH_SETTINGS_ENABLED", "false");
    expect(umrahSettingsEnabled()).toBe(false);
    vi.stubEnv("UMRAH_SETTINGS_ENABLED", "yes please");
    expect(umrahSettingsEnabled()).toBe(false);
  });

  it("is on for true or 1, however it is cased", () => {
    for (const value of ["true", "TRUE", " True ", "1"]) {
      vi.stubEnv("UMRAH_SETTINGS_ENABLED", value);
      expect(umrahSettingsEnabled()).toBe(true);
    }
  });

  it("is not tied to the rest of the Umrah module", () => {
    // The old, wider switch must not turn the settings editor on by accident.
    vi.stubEnv("UMRAH_ENABLED", "true");
    vi.stubEnv("UMRAH_SETTINGS_ENABLED", "");
    expect(umrahSettingsEnabled()).toBe(false);
  });
});

describe("routeWhen", () => {
  it("answers 404 while off, without running the handler or needing a login", async () => {
    const handler = vi.fn(async () => Response.json({ ok: true }));
    const guarded = routeWhen(() => false, handler);

    // No Authorization header at all: still a plain 404, not a 401 that would
    // reveal the endpoint exists.
    const response = await guarded(new Request("http://localhost/api/umrah-settings", { method: "PATCH" }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found." });
    expect(handler).not.toHaveBeenCalled();
  });
});
