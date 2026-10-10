import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { Paper } from "@/types/paper";

export interface ResolvedPaperContent {
  paperId: string;
  title: string;
  contentText: string;
  sourceType: "full_pdf" | "abstract" | "partial";
  charCount: number;
  pageCount?: number;
  metadataSnippet: string;
}

function cleanExtractedText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Resolves full-text paper content from local uploaded PDF, remote open-access PDF (arXiv/etc),
 * or falls back to full verified abstract.
 */
export async function resolvePaperContent(paper: Partial<Paper> & { id: string; title: string }): Promise<ResolvedPaperContent> {
  const metadataSnippet = [
    `Title: ${paper.title}`,
    paper.authors && paper.authors.length > 0 ? `Authors: ${paper.authors.join(", ")}` : null,
    paper.year ? `Year: ${paper.year}` : null,
    paper.venue ? `Venue: ${paper.venue}` : null,
  ].filter(Boolean).join("\n");

  // 1. Try local uploaded PDF if filePath exists
  if (paper.filePath) {
    try {
      const uploadDir = path.join(process.cwd(), "data", "uploads");
      const filename = path.basename(paper.filePath);
      const resolvedPath = path.join(uploadDir, filename);

      if (fs.existsSync(resolvedPath)) {
        const fileBuffer = fs.readFileSync(resolvedPath);
        const parser = new PDFParse({ data: fileBuffer });
        const textResult = await parser.getText();
        const cleaned = cleanExtractedText(textResult?.text || "");

        if (cleaned.length >= 300) {
          let numPages = 1;
          try {
            const info = (await parser.getInfo()) as any;
            numPages = info?.total_pages || info?.numPages || 1;
          } catch {
            // ignore
          }

          return {
            paperId: paper.id,
            title: paper.title,
            contentText: cleaned,
            sourceType: "full_pdf",
            charCount: cleaned.length,
            pageCount: numPages,
            metadataSnippet,
          };
        }
      }
    } catch (err) {
      console.warn(`[ContentResolver] Failed reading local PDF for ${paper.id}:`, err);
    }
  }

  // 2. Try remote PDF via pdfUrl or arXiv ID
  let targetPdfUrl = paper.pdfUrl;
  if (!targetPdfUrl && paper.id && paper.id.startsWith("arxiv:")) {
    const arxivId = paper.id.replace("arxiv:", "");
    targetPdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
  } else if (targetPdfUrl && targetPdfUrl.includes("arxiv.org/abs/")) {
    targetPdfUrl = targetPdfUrl.replace("/abs/", "/pdf/") + ".pdf";
  }

  if (targetPdfUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout for remote PDF fetch

      const response = await fetch(targetPdfUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ResearchAssistant/1.0; +https://github.com/academic-assistant)",
          Accept: "application/pdf,*/*",
        },
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const arrayBuf = await response.arrayBuffer();
        if (arrayBuf.byteLength > 2000) {
          const parser = new PDFParse({ data: Buffer.from(arrayBuf) });
          const textResult = await parser.getText();
          const cleaned = cleanExtractedText(textResult?.text || "");

          if (cleaned.length >= 400) {
            let numPages = 1;
            try {
              const info = (await parser.getInfo()) as any;
              numPages = info?.total_pages || info?.numPages || 1;
            } catch {
              // ignore
            }

            return {
              paperId: paper.id,
              title: paper.title,
              contentText: cleaned,
              sourceType: "full_pdf",
              charCount: cleaned.length,
              pageCount: numPages,
              metadataSnippet,
            };
          }
        }
      }
    } catch (err) {
      console.warn(`[ContentResolver] Remote PDF fetch skipped or failed for ${targetPdfUrl}:`, err);
    }
  }

  // 3. Fallback to comprehensive abstract & structured sections
  const abstractContent = paper.abstract && paper.abstract.trim().length > 0
    ? paper.abstract.trim()
    : "No abstract text available for this publication.";

  const contentText = `${metadataSnippet}\n\nAbstract:\n${abstractContent}`;

  return {
    paperId: paper.id,
    title: paper.title,
    contentText,
    sourceType: "abstract",
    charCount: contentText.length,
    pageCount: undefined,
    metadataSnippet,
  };
}
