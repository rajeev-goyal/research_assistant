import { NextRequest, NextResponse } from "next/server";
import { searchPapers } from "@/lib/search";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const sortBy = (searchParams.get("sortBy") || "relevance") as "relevance" | "date";
    const year = searchParams.get("year") || undefined;
    const provider = (searchParams.get("provider") || "all") as "all" | "openalex" | "arxiv";
    const openAccessOnly = searchParams.get("openAccessOnly") === "true";

    if (!query.trim()) {
      return NextResponse.json({
        success: true,
        total: 0,
        page,
        limit,
        results: [],
        providerUsed: provider,
      });
    }

    const data = await searchPapers({
      query,
      page,
      limit,
      sortBy,
      year,
      provider,
      openAccessOnly,
    });

    return NextResponse.json({
      success: true,
      ...data,
    });
  } catch (error) {
    console.error("API /api/search error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal search error",
      },
      { status: 500 }
    );
  }
}
