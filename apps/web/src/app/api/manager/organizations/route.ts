import { NextResponse } from "next/server";
import { getManagerContext, ManagerAccessError } from "@/lib/manager-access";

/** Managers enroll organizations but do not manage or browse their records. */
export async function GET(req: Request) {
  try {
    await getManagerContext(req);
    return NextResponse.json({ error: "Organization records are available only to support and admin staff." }, { status: 403 });
  } catch (error) {
    if (error instanceof ManagerAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
}
