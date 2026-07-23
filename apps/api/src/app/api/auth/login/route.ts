import { AuthError, authenticate, issueToken } from "@/server/auth";
import { handleOptions, json, readJson, route } from "@/server/http";
import { loginSchema } from "@/server/schemas";

export const runtime = "nodejs";

export const OPTIONS = handleOptions;

export const POST = route(async (request) => {
  const body = loginSchema.parse(await readJson(request));
  const session = await authenticate(body.email, body.password);

  // Deliberately vague: do not reveal whether the email exists.
  if (!session) throw new AuthError("Email or password is incorrect.");

  return json(request, { token: await issueToken(session), user: session });
});
