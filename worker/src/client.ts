import { config } from "./config.js";

export type Job = {
  id: string;
  type: "scan" | "web_form_removal" | "fetch_page";
  removalRequestId?: string;
  broker?: {
    name: string;
    domain: string;
    optOutUrl: string | null;
    adapterKey: string | null;
    requiresCaptcha: boolean;
    requiresId: boolean;
  };
  fingerprint?: {
    name: string | null;
    cityState: string | null;
    email: string | null;
  };
};

export type Outcome =
  | { status: "submitted"; needsEmailConfirmation: boolean; evidence?: Evidence[] }
  | { status: "needs_human"; reason: string; resumeToken?: string }
  | { status: "exempt"; reason: string }
  | { status: "failed"; reason: string };

export type Evidence = {
  kind: "screenshot" | "email_ref" | "request_id" | "pdf";
  blobRef: string;
};

function headers() {
  return {
    authorization: `Bearer ${config.workerToken}`,
    "content-type": "application/json",
  };
}

export async function claimJob(): Promise<Job | null> {
  const res = await fetch(
    `${config.controlPlaneUrl}/api/worker/jobs?workerId=${encodeURIComponent(config.workerId)}`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`claim failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { job: Job | null };
  return json.job;
}

export async function reportResult(jobId: string, outcome: Outcome): Promise<void> {
  const res = await fetch(`${config.controlPlaneUrl}/api/worker/jobs/${jobId}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(outcome),
  });
  if (!res.ok) throw new Error(`report failed: ${res.status} ${await res.text()}`);
}
