import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getCommitmentsForTicket, addCommitment } from "@/lib/commitments";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const commitments = await getCommitmentsForTicket(Number(id));
    return NextResponse.json(commitments);
  } catch (error) {
    console.error("Failed to fetch commitments:", error);
    return NextResponse.json({ error: "Failed to fetch commitments" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    if (!body.teamMemberId || !body.committedDate) {
      return NextResponse.json({ error: "teamMemberId and committedDate required" }, { status: 400 });
    }

    const commitment = await addCommitment({
      ticketId: Number(id),
      teamMemberId: body.teamMemberId,
      committedDate: body.committedDate,
      committedById: session.teamMemberId,
      notes: body.notes || "",
    });

    return NextResponse.json(commitment, { status: 201 });
  } catch (error) {
    console.error("Failed to add commitment:", error);
    return NextResponse.json({ error: "Failed to add commitment" }, { status: 500 });
  }
}
