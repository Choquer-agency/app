import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 10MB" }, { status: 400 });
    }

    // Try Vercel Blob first (production)
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const blob = await put(
        `tickets/inline/${Date.now()}-${file.name}`,
        file,
        { access: "public" }
      );
      return NextResponse.json({ url: blob.url });
    }

    // Fallback: save to public/uploads (local dev)
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "inline");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = file.name.split(".").pop() || "png";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(uploadsDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ url: `/uploads/inline/${filename}` });
  } catch (error) {
    console.error("Image upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
