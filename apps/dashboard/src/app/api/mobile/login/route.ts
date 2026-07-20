/** POST /api/mobile/login  { email, password } -> { token, name, role } */
import { audit } from "@ytc/core";
import { authenticate } from "@/lib/auth";
import { signMobileToken } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let email = "";
  let password = "";
  try {
    const body = await request.json();
    email = String(body?.email ?? "").trim();
    password = String(body?.password ?? "");
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!email || !password) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const user = await authenticate(email, password);
  if (!user) {
    return Response.json({ error: "bad_credentials" }, { status: 401 });
  }

  const token = await signMobileToken(user);
  await audit({
    actorId: user.id,
    action: "auth.login",
    targetType: "StaffUser",
    targetId: user.id,
    meta: { via: "mobile" },
  });

  return Response.json({
    token,
    name: user.name,
    role: user.role,
  });
}
