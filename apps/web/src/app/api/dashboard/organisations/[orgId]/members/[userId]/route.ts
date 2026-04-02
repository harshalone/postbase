import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminUsersToOrganisations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth/admin";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string; userId: string }> }
) {
  const { orgId, userId } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requesterId = session.user.id;

  // Check if current user is an owner
  const [access] = await db
    .select()
    .from(adminUsersToOrganisations)
    .where(
      and(
        eq(adminUsersToOrganisations.adminUserId, requesterId),
        eq(adminUsersToOrganisations.organisationId, orgId),
        eq(adminUsersToOrganisations.role, "owner")
      )
    )
    .limit(1);

  if (!access) {
    return NextResponse.json({ error: "Only owners can remove members" }, { status: 403 });
  }

  // Prevent removing yourself if you are the only owner
  if (requesterId === userId) {
    const owners = await db
      .select()
      .from(adminUsersToOrganisations)
      .where(
        and(
          eq(adminUsersToOrganisations.organisationId, orgId),
          eq(adminUsersToOrganisations.role, "owner")
        )
      );
    
    if (owners.length <= 1) {
      return NextResponse.json({ error: "Cannot remove the last owner of an organisation" }, { status: 400 });
    }
  }

  const result = await db
    .delete(adminUsersToOrganisations)
    .where(
      and(
        eq(adminUsersToOrganisations.adminUserId, userId),
        eq(adminUsersToOrganisations.organisationId, orgId)
      )
    );

  return NextResponse.json({ success: true });
}
