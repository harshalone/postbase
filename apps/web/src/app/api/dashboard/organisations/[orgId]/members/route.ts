import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminUsers, adminUsersToOrganisations, organisations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth/admin";
import { z } from "zod";

const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "member"]).default("member"),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Check if current user is a member of the organization
  const [access] = await db
    .select()
    .from(adminUsersToOrganisations)
    .where(
      and(
        eq(adminUsersToOrganisations.adminUserId, userId),
        eq(adminUsersToOrganisations.organisationId, orgId)
      )
    )
    .limit(1);

  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all members
  const members = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      role: adminUsersToOrganisations.role,
      createdAt: adminUsersToOrganisations.createdAt,
    })
    .from(adminUsersToOrganisations)
    .innerJoin(adminUsers, eq(adminUsersToOrganisations.adminUserId, adminUsers.id))
    .where(eq(adminUsersToOrganisations.organisationId, orgId));

  return NextResponse.json({ members });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Check if current user is an owner (only owners can add members)
  const [access] = await db
    .select()
    .from(adminUsersToOrganisations)
    .where(
      and(
        eq(adminUsersToOrganisations.adminUserId, userId),
        eq(adminUsersToOrganisations.organisationId, orgId),
        eq(adminUsersToOrganisations.role, "owner")
      )
    )
    .limit(1);

  if (!access) {
    return NextResponse.json({ error: "Only owners can manage members" }, { status: 403 });
  }

  const result = addMemberSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  // Find the user by email
  const [targetUser] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, result.data.email))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: "User not found. They must first sign up as an administrator." }, { status: 404 });
  }

  // Add the member
  try {
    await db.insert(adminUsersToOrganisations).values({
      adminUserId: targetUser.id,
      organisationId: orgId,
      role: result.data.role,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.code === "23505") { // Unique violation
      return NextResponse.json({ error: "User is already a member" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
