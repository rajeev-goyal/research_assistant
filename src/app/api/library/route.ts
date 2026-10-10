import { NextRequest, NextResponse } from "next/server";
import { getLibraryPapers, savePaper, savePapersBatch, deletePaper } from "@/lib/db/libraryRepo";
import { Paper } from "@/types/paper";

export async function GET() {
  try {
    const papers = getLibraryPapers();
    return NextResponse.json({ success: true, count: papers.length, papers });
  } catch (error) {
    console.error("GET /api/library error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Database query failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if batch save (array or { papers: [...] })
    const papersList: Paper[] = Array.isArray(body)
      ? body
      : Array.isArray(body?.papers)
      ? body.papers
      : [];

    if (papersList.length > 0) {
      const validPapers = papersList.filter((p) => p && p.id && p.title);
      if (!validPapers.length) {
        return NextResponse.json(
          { success: false, error: "No valid papers found with required fields (id, title)" },
          { status: 400 }
        );
      }
      const count = savePapersBatch(validPapers);
      return NextResponse.json({
        success: true,
        message: `Successfully saved ${count} papers to library`,
        count,
      });
    }

    // Single paper save
    const paper = body as Paper;
    if (!paper || !paper.id || !paper.title) {
      return NextResponse.json(
        { success: false, error: "Missing required paper fields (id, title)" },
        { status: 400 }
      );
    }

    savePaper(paper);
    return NextResponse.json({ success: true, message: "Paper saved to library", id: paper.id });
  } catch (error) {
    console.error("POST /api/library error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save paper" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Paper id is required" }, { status: 400 });
    }
    deletePaper(id);
    return NextResponse.json({ success: true, message: "Paper removed from library", id });
  } catch (error) {
    console.error("DELETE /api/library error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete paper" },
      { status: 500 }
    );
  }
}
