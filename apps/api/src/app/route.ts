import { handleOptions, json, route } from "@/server/http";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** Root: a signpost, so hitting the service in a browser is not a 404. */
export const GET = route(async (request) =>
  json(request, {
    service: "Junaidi Quotation API",
    endpoints: [
      "POST /api/auth/login",
      "GET  /api/config/bootstrap?season=1448",
      "POST /api/calculate",
      "GET  /api/quotations",
      "POST /api/quotations",
      "GET  /api/quotations/:id",
      "PATCH /api/quotations/:id",
      "POST /api/quotations/:id/duplicate",
      "POST /api/quotations/:id/pdf",
      "GET  /api/health",
    ],
  }),
);
