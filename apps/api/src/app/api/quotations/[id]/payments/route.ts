import { addPayment } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";
import { paymentInputSchema } from "@/server/schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** Record a payment against a confirmed booking. Open to any signed-in staff. */
export const POST = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id } = await params;
  const input = paymentInputSchema.parse(await readJson(request));
  const updated = await addPayment(id!, input, { userId: session.userId, name: session.name });
  return json(request, updated.toJSON());
});
