import { NextRequest, NextResponse } from "next/server";
import { getGeminiApiKey, streamGeminiChatAnswer } from "@/lib/ai/geminiClient";
import { resolvePaperContent } from "@/lib/paperContentResolver";
import {
  getChatMessages,
  saveChatMessage,
  clearChatMessages,
  savePaper,
  isPaperSaved,
} from "@/lib/db/libraryRepo";
import { Paper } from "@/types/paper";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const paperId = searchParams.get("paperId");

  if (!paperId) {
    return NextResponse.json({ error: "Missing paperId parameter" }, { status: 400 });
  }

  const messages = getChatMessages(paperId);
  return NextResponse.json({ messages });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const paperId = searchParams.get("paperId");

  if (!paperId) {
    return NextResponse.json({ error: "Missing paperId parameter" }, { status: 400 });
  }

  clearChatMessages(paperId);
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const paper = body.paper as Paper;
    const userMessage = (body.message || "").trim();
    const clientApiKey = body.apiKey as string | undefined;

    if (!paper || !paper.id || !paper.title) {
      return NextResponse.json({ error: "Invalid paper payload" }, { status: 400 });
    }

    if (!userMessage) {
      return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
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

    // Ensure paper record exists in DB to satisfy foreign keys
    if (!isPaperSaved(paper.id)) {
      savePaper(paper);
    }

    // Retrieve previous conversation history
    const historyRecords = getChatMessages(paper.id);
    const history = historyRecords.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Save current user message
    saveChatMessage({
      paperId: paper.id,
      role: "user",
      content: userMessage,
    });

    // Resolve grounded paper content (PDF or rich abstract)
    const resolvedContent = await resolvePaperContent(paper);

    const encoder = new TextEncoder();
    let accumulatedAnswer = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial metadata
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "meta",
                paperId: paper.id,
                sourceType: resolvedContent.sourceType,
                charCount: resolvedContent.charCount,
                model: "gemini-3.5-flash-lite",
              }) + "\n"
            )
          );

          // Stream chunks from Gemini
          for await (const chunk of streamGeminiChatAnswer(
            {
              paperTitle: paper.title,
              contentText: resolvedContent.contentText,
              sourceType: resolvedContent.sourceType,
              history,
              question: userMessage,
            },
            apiKey,
            "gemini-3.5-flash-lite"
          )) {
            accumulatedAnswer += chunk;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "chunk",
                  text: chunk,
                }) + "\n"
              )
            );
          }

          // Persist assistant message in SQLite
          if (accumulatedAnswer.trim().length > 0) {
            saveChatMessage({
              paperId: paper.id,
              role: "assistant",
              content: accumulatedAnswer.trim(),
            });
          }

          // Send done event
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "done",
                fullAnswer: accumulatedAnswer.trim(),
                sourceType: resolvedContent.sourceType,
                model: "gemini-3.5-flash-lite",
              }) + "\n"
            )
          );

          controller.close();
        } catch (streamErr: any) {
          console.error("[ChatAPI] Stream error:", streamErr);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                message: streamErr?.message || "An error occurred during Q&A generation.",
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
    console.error("[ChatAPI] Request error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
