import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";

export const runtime = "nodejs";

async function parsePdf(buffer: Buffer): Promise<string> {
  // Import the internal lib directly — pdf-parse v1's main entry tries to open
  // a test fixture on first load which doesn't exist in production builds.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buf: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text?.trim() ?? "";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const mimeType = file.type || "";
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Plain text files — just decode directly
  if (
    mimeType === "text/plain" ||
    mimeType === "" ||
    (file instanceof File && file.name.endsWith(".txt"))
  ) {
    const text = buffer.toString("utf-8");
    return NextResponse.json({ text });
  }

  // PDF — use pdf-parse
  if (mimeType === "application/pdf" || (file instanceof File && file.name.toLowerCase().endsWith(".pdf"))) {
    try {
      const text = await parsePdf(buffer);
      if (!text) {
        return NextResponse.json({ error: "pdf_no_text", detail: "The PDF appears to be image-only or empty." }, { status: 422 });
      }
      return NextResponse.json({ text });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: "pdf_parse_failed", detail: msg }, { status: 422 });
    }
  }

  // Word documents — best-effort: extract readable text via buffer string decode
  // (handles basic .docx which is a ZIP; readable text portions are often extractable)
  try {
    const text = buffer.toString("utf-8").replace(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 50) {
      return NextResponse.json({ text });
    }
    return NextResponse.json({ error: "unsupported_format", detail: "Please use PDF or plain text (.txt) for best results." }, { status: 422 });
  } catch {
    return NextResponse.json({ error: "unsupported_format" }, { status: 422 });
  }
}
