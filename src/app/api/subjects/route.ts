import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, requireOperator, serverError } from "@/lib/api";
import { createSubjectInput } from "@/lib/validation";

export async function GET() {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  const subjects = await prisma.subject.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { attributes: true, removalRequests: true } } },
  });
  return NextResponse.json({ subjects });
}

export async function POST(request: Request) {
  const guard = await requireOperator();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = createSubjectInput.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error);

  // §9 guard: a non-operator subject requires an authorized-agent doc ref
  // before it can exist as an actionable target.
  if (!parsed.data.isOperator && !parsed.data.authorizedAgentDocRef) {
    return badRequest(
      "Non-operator subjects require authorizedAgentDocRef (signed authorization) — see §9.",
    );
  }

  try {
    const subject = await prisma.subject.create({ data: parsed.data });
    return NextResponse.json({ subject }, { status: 201 });
  } catch (err) {
    return serverError(err);
  }
}
