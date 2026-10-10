import { NextResponse } from "next/server";
import { getGeminiApiKey } from "@/lib/ai/geminiClient";

export async function GET() {
  const apiKey = getGeminiApiKey();
  return NextResponse.json({
    configured: Boolean(apiKey && apiKey.length > 10),
    model: "gemini-3.5-flash-lite",
  });
}
