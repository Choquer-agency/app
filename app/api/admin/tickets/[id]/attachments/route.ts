import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/admin-auth";
import { getAttachments, addAttachmentRecord } from "@/lib/ticket-attachments";
import fs from "fs";
import path from "path";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const attachments = await getAttachments(Number(id));
    return NextResponse.json(attachments);
  } catch (error) {
    console.error("Failed to fetch attachments:", error);
    return NextResponse.json({ error: "Failed to fetch attachments" }, { status: 500 });
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
    const ticketId = Number(id);
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File must be under 10MB" }, { status: 400 });
    }

    let fileUrl: string;

    // Try Vercel Blob first (production)
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { put } = await import("@vercel/blob");
      const blob = await put(
        `tickets/${ticketId}/${Date.now()}-${file.name}`,
        file,
        { access: "public" }
      );
      fileUrl = blob.url;
    } else {
      // Fallback: save to public/uploads (local dev)
      const uploadsDir = path.join(process.cwd(), "public", "uploads", "tickets");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const ext = file.name.split(".").pop() || "bin";
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = path.join(uploadsDir, filename);

      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(filePath, buffer);
      fileUrl = `/uploads/tickets/${filename}`;
    }

    const attachment = await addAttachmentRecord(
      ticketId,
      session.teamMemberId,
      session.name,
      file.name,
      fileUrl,
      file.size,
      file.type
    );

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Failed to upload attachment:", error);
    return NextResponse.json({ error: "Failed to upload attachment" }, { status: 500 });
  }
}
