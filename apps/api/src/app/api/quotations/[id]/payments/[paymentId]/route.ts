import { deletePayment, updatePayment } from "@junaidi/db";

import { sessionFrom } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";
import { paymentInputSchema } from "@/server/schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

/** Correct a recorded payment. Open to any signed-in staff. */
export const PATCH = route(async (request, { params }) => {
  const session = await sessionFrom(request);
  const { id, paymentId } = await params;
  const input = paymentInputSchema.parse(await readJson(request));
  const updated = await updatePayment(id!, paymentId!, input, {
    userId: session.userId,
    name: session.name,
  });
  return json(request, updated.toJSON());
});

/** Remove a recorded payment. */
export const DELETE = route(async (request, { params }) => {
  await sessionFrom(request);
  const { id, paymentId } = await params;
  const updated = await deletePayment(id!, paymentId!);
  return json(request, updated.toJSON());
});
