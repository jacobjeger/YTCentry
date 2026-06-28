import { completeJob } from "@ytc/core";
import { checkAgentAuth } from "@/lib/agentAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!checkAgentAuth(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: {
    jobId?: string;
    ok?: boolean;
    error?: string | null;
    faceUrl?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.jobId || typeof body.ok !== "boolean") {
    return Response.json({ error: "jobId and ok are required" }, { status: 400 });
  }
  await completeJob({
    jobId: body.jobId,
    ok: body.ok,
    error: body.error ?? null,
    faceUrl: body.faceUrl ?? null,
  });
  return Response.json({ ok: true });
}
