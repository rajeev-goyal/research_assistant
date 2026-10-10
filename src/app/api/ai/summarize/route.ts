import { NextRequest, NextResponse } from "next/server";
import { getGeminiApiKey, streamGeminiSummary } from "@/lib/ai/geminiClient";
import { resolvePaperContent } from "@/lib/paperContentResolver";
import { getPaperSummary, savePaperSummary } from "@/lib/db/libraryRepo";
import { Paper } from "@/types/paper";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const paperId = searchParams.get("paperId");

  if (!paperId) {
    return NextResponse.json({ error: "Missing paperId parameter" }, { status: 400 });
  }

  const cached = getPaperSummary(paperId);
  return NextResponse.json({ summary: cached });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const paper = body.paper as Paper;
    const clientApiKey = body.apiKey as string | undefined;
    const forceRefresh = Boolean(body.forceRefresh);

    if (!paper || !paper.id || !paper.title) {
      return NextResponse.json({ error: "Invalid paper payload" }, { status: 400 });
    }

    const apiKey = getGeminiApiKey(clientApiKey);
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Gemini API key is not configured.",
          hint: "Please provide a Gemini API key in the UI settings or in .env.local file.",
        },
        { status: 401 }
      );
    }

    // 1. Check SQLite cache unless force refresh is requested
    if (!forceRefresh) {
      const cached = getPaperSummary(paper.id);
      if (cached && cached.summary && cached.summary.trim().length > 50) {
        return NextResponse.json({
          cached: true,
          summary: cached.summary,
          sourceType: cached.sourceType,
          model: cached.model,
          updatedAt: cached.updatedAt,
        });
      }
    }

    // 2. Resolve paper content (Full PDF or Rich Abstract)
    const resolvedContent = await resolvePaperContent(paper);

    // 3. Create a streaming response
    const encoder = new TextEncoder();
    let accumulatedSummary = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata event
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "meta",
                paperId: paper.id,
                title: paper.title,
                sourceType: resolvedContent.sourceType,
                charCount: resolvedContent.charCount,
                pageCount: resolvedContent.pageCount,
                model: "gemini-3.5-flash-lite",
              }) + "\n"
            )
          );

          // Stream chunks from Gemini
          for await (const chunk of streamGeminiSummary(
            {
              title: paper.title,
              contentText: resolvedContent.contentText,
              sourceType: resolvedContent.sourceType,
              authors: paper.authors,
              year: paper.year,
              venue: paper.venue,
              charCount: resolvedContent.charCount,
            },
            apiKey,
            "gemini-3.5-flash-lite"
          )) {
            accumulatedSummary += chunk;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "chunk",
                  text: chunk,
                }) + "\n"
              )
            );
          }

          // Save completed summary to SQLite
          if (accumulatedSummary.trim().length > 0) {
            savePaperSummary({
              paperId: paper.id,
              title: paper.title,
              summary: accumulatedSummary.trim(),
              model: "gemini-3.5-flash-lite",
              sourceType: resolvedContent.sourceType,
              charCount: resolvedContent.charCount,
            });
          }

          // Send done event
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "done",
                fullSummary: accumulatedSummary.trim(),
                sourceType: resolvedContent.sourceType,
                model: "gemini-3.5-flash-lite",
              }) + "\n"
            )
          );

          controller.close();
        } catch (streamErr: any) {
          console.error("[SummarizeAPI] Stream error:", streamErr);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                message: streamErr?.message || "An error occurred during summarization.",
              }) + "\n"
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    console.error("[SummarizeAPI] Request error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
