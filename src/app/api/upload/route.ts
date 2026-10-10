import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { UPLOADS_DIR } from "@/lib/db";
import { savePaper } from "@/lib/db/libraryRepo";
import { extractMetadataFromPdf } from "@/lib/pdfExtractor";
import { Paper } from "@/types/paper";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json(
        { success: false, error: "Only PDF documents are supported" },
        { status: 400 }
      );
    }

    // Limit size to 35MB
    const MAX_SIZE = 35 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "File exceeds 35MB limit" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Generate unique file id based on hash + timestamp
    const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
    const fileId = `${Date.now()}_${hash}`;
    const storedFileName = `${fileId}.pdf`;
    const physicalPath = path.join(UPLOADS_DIR, storedFileName);

    // Save physical PDF to disk
    await fs.promises.writeFile(physicalPath, buffer);

    // Extract metadata from the PDF text stream
    const metadata = await extractMetadataFromPdf(buffer, file.name);

    const paperId = `upload:${fileId}`;
    const servingUrl = `/api/uploads/${storedFileName}`;

    const paper: Paper = {
      id: paperId,
      title: metadata.title,
      abstract: metadata.abstract,
      authors: metadata.authors,
      year: metadata.year,
      venue: "Uploaded PDF",
      url: servingUrl,
      pdfUrl: servingUrl,
      source: "upload",
      citationCount: 0,
      readStatus: "unread",
      filePath: physicalPath,
      fileName: file.name,
      fileSize: file.size,
      isSaved: true,
    };

    // Save directly to persistent SQLite database
    savePaper(paper);

    return NextResponse.json({
      success: true,
      message: "Paper uploaded and parsed successfully",
      paper,
    });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process PDF upload",
      },
      { status: 500 }
    );
  }
}
