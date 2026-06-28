import { claimJobs } from "@ytc/core";
import { checkAgentAuth } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!checkAgentAuth(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let limit = 5;
  try {
    const body = await request.json();
    if (typeof body?.limit === "number") limit = Math.min(Math.max(1, body.limit), 25);
  } catch {
    /* empty body is fine */
  }
  const jobs = await claimJobs(limit);
  return Response.json({ jobs });
}
