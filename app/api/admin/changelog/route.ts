import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = getConvexClient();
    const entries = await convex.query(api.changelog.list, { limit: 20 });

    const mapped = entries.map((e: any) => ({
      id: e._id,
      title: e.title,
      description: e.description,
      category: e.category,
      imageUrl: e.imageUrl || undefined,
      authorName: e.authorName || "Bryce",
      createdAt: e._creationTime
        ? new Date(e._creationTime).toISOString()
        : new Date().toISOString(),
    }));

    return NextResponse.json(mapped);
  } catch (error) {
    console.error("Changelog fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load changelog" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, description, category, imageUrl } = body;

    if (!title || !description || !category) {
      return NextResponse.json(
        { error: "title, description, and category are required" },
        { status: 400 }
      );
    }

    const convex = getConvexClient();
    const id = await convex.mutation(api.changelog.create, {
      title,
      description,
      category,
      imageUrl: imageUrl || undefined,
      authorName: session.name || "Bryce",
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error("Changelog create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create changelog entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const convex = getConvexClient();
    await convex.mutation(api.changelog.remove, { id: id as any });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Changelog delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete changelog entry" },
      { status: 500 }
    );
  }
}
