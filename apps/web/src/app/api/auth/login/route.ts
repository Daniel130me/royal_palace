// POST /api/auth/login
// Simulated authentication for the prototype. Validates demo credentials
// against the User table and returns a session object the client stores
// in localStorage. Production auth must NEVER store plaintext passwords.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const user = await db.user.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!user || user.password !== password) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  if (user.status !== "active") {
    return NextResponse.json({ error: "Account is not active. Contact support." }, { status: 403 });
  }
  await audit({
    actorId: user.profileId ?? user.id,
    actorRole: user.role,
    action: `${user.role}_logged_in`,
    entityType: "session",
    entityId: user.id,
    description: `${user.name} logged in.`,
  });
  return NextResponse.json({
    session: {
      userId: user.id,
      role: user.role,
      profileId: user.profileId ?? undefined,
      name: user.name,
      email: user.email,
    },
  });
}
