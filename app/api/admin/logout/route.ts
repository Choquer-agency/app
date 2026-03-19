import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "choquer.app";
  const protocol = host.includes("localhost") ? "http" : "https";
  const response = NextResponse.redirect(new URL("/admin/activity", `${protocol}://${host}`));
  response.cookies.delete(COOKIE_NAME);
  return response;
}
