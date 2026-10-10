import fs from "fs";
import path from "path";

/**
 * Resolves Gemini API key with priority:
 * 1. Client header override
 * 2. process.env.GEMINI_API_KEY
 * 3. .env.local file directly on disk
 */
export function getGeminiApiKey(clientKey?: string): string | null {
  if (clientKey && clientKey.trim().length > 10) {
    return clientKey.trim();
  }

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    return process.env.GEMINI_API_KEY.trim();
  }

  try {
    const envLocalPath = path.join(process.cwd(), ".env.local");
    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, "utf-8");
      const match = content.match(/^GEMINI_API_KEY=["']?([^"'\r\n]+)["']?/m);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  } catch (err) {
    console.warn("[GeminiClient] Could not read .env.local fallback:", err);
  }

  return null;
}

export interface SummaryRequestParams {
  title: string;
  contentText: string;
  sourceType: "full_pdf" | "abstract" | "partial";
  authors?: string[];
  year?: number;
  venue?: string;
  charCount?: number;
}

export function buildAcademicSummaryPrompt(params: SummaryRequestParams): string {
  const sourceDescription =
    params.sourceType === "full_pdf"
      ? "extracted full-text manuscript of the paper"
      : "official abstract and published metadata of the paper";

  return `You are a distinguished senior academic peer reviewer and research scientist.
Your task is to generate a comprehensive, rigorous academic summary of the paper titled "${params.title}".

The following text is the ${sourceDescription}:
----------------------------------------
${params.contentText.slice(0, 120000)}
----------------------------------------

Instructions:
1. Ground your entire summary exclusively on the provided text above. Do NOT hallucinate claims or metrics not stated in the source text.
2. Structure your summary with clear Markdown headings as follows:
   - **### 1. Executive Summary & Core Contribution**: State the primary breakthrough or core thesis in 2-3 crisp sentences.
   - **### 2. Problem Formulation & Research Motivation**: What fundamental limitation or open question in the literature does this work address?
   - **### 3. Methodology & Technical Approach**: Detail the proposed framework, system architecture, mathematical mechanisms, or experimental setup.
   - **### 4. Key Findings & Empirical Results**: Present concrete performance metrics, benchmarks, ablation insights, or findings mentioned in the paper.
   - **### 5. Critical Limitations & Open Challenges**: Highlight limitations, edge cases, scalability boundaries, or future research directions noted by the authors.
3. Write with academic clarity, objectivity, and precision. Maintain active, authoritative prose suitable for graduate-level researchers.`;
}

/**
 * Streams Gemini response chunks using Server-Sent Events (SSE)
 */
export async function* streamGeminiSummary(
  params: SummaryRequestParams,
  apiKey: string,
  model = "gemini-3.5-flash-lite"
): AsyncGenerator<string, void, unknown> {
  const prompt = buildAcademicSummaryPrompt(params);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2500,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body stream from Gemini API");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      try {
        const parsed = JSON.parse(jsonStr);
        const candidates = parsed.candidates;
        if (candidates && candidates[0]?.content?.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.text) {
              yield part.text;
            }
          }
        }
      } catch (err) {
        // Skip malformed chunk
      }
    }
  }
}

export interface ChatQuestionRequestParams {
  paperTitle: string;
  contentText: string;
  sourceType: "full_pdf" | "abstract" | "partial";
  history?: { role: "user" | "assistant"; content: string }[];
  question: string;
}

/**
 * Streams conversational question answering grounded on paper content
 */
export async function* streamGeminiChatAnswer(
  params: ChatQuestionRequestParams,
  apiKey: string,
  model = "gemini-3.5-flash-lite"
): AsyncGenerator<string, void, unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const isFullPdf = params.sourceType === "full_pdf";
  const sourceDesc = isFullPdf
    ? "extracted full-text manuscript of the paper"
    : "official abstract and published metadata of the paper";

  const systemInstructionText = `You are a distinguished academic research assistant answering questions about the paper "${params.paperTitle}".

Grounding Level: ${isFullPdf ? "Full-text PDF manuscript extracted" : "Published abstract and metadata only (full PDF was not open-access or not uploaded)"}

The following is the ${sourceDesc}:
----------------------------------------
${params.contentText.slice(0, 120000)}
----------------------------------------

Instructions:
1. Answer the user's question directly, accurately, and objectively based on the text provided above.
2. When referencing methodology, numbers, datasets, or baselines, cite the specific sections or findings stated in the text.
3. If the paper does not mention or evaluate the topic (e.g. if the work is a software framework release without training datasets, or if only the abstract is available and specific experimental details like dataset names or benchmark tables are missing from the abstract), state this clearly and objectively. If only the abstract was analyzed, inform the user that they can upload the full PDF paper via the "Upload PDF" button in the application to analyze the entire manuscript.
4. Format your answer with clean Markdown (bold text, bullet points, headers if helpful).`;

  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  if (params.history && params.history.length > 0) {
    contents.push({
      role: "user",
      parts: [
        {
          text: `[SYSTEM CONTEXT & GROUNDING]\n${systemInstructionText}\n\n[USER FIRST QUESTION]\n${params.history[0].content}`,
        },
      ],
    });

    for (let i = 1; i < params.history.length; i++) {
      const h = params.history[i];
      contents.push({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      });
    }

    contents.push({
      role: "user",
      parts: [{ text: params.question }],
    });
  } else {
    contents.push({
      role: "user",
      parts: [
        {
          text: `${systemInstructionText}\n\nQuestion:\n${params.question}`,
        },
      ],
    });
  }

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2000,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body stream from Gemini API");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      try {
        const parsed = JSON.parse(jsonStr);
        const candidates = parsed.candidates;
        if (candidates && candidates[0]?.content?.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.text) {
              yield part.text;
            }
          }
        }
      } catch {
        // Skip malformed chunk
      }
    }
  }
}

