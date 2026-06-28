/**
 * Bearer-token auth for the on-site agent queue API. The agent and the
 * dashboard share AGENT_BEARER_TOKEN (env). This is the ONLY auth on
 * /api/agent/* — those routes are excluded from the cookie proxy gate.
 */
import "server-only";

export function checkAgentAuth(req: Request): boolean {
  const expected = process.env.AGENT_BEARER_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // length-guarded constant-ish comparison
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++)
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
