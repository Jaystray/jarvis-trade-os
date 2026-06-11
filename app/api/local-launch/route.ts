import { NextResponse } from "next/server";
import { getLaunchTargets, launchLocalTarget } from "@/lib/local-launch";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ targets: getLaunchTargets().map(({ target, ...item }) => item) });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { targetId?: string };
  const targetId = body.targetId?.trim();

  if (!targetId) {
    return NextResponse.json({ error: "targetId is required." }, { status: 400 });
  }

  try {
    const result = await launchLocalTarget(targetId);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      {
        result: {
          enabled: true,
          launched: false,
          message: error instanceof Error ? error.message : "Local launch failed."
        }
      },
      { status: 500 }
    );
  }
}
