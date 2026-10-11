import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";
import { Paper } from "@/types/paper";
import { isPaperSaved, savePaper } from "@/lib/db/libraryRepo";

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

function isStrongTitleMatch(a: string, b: string): boolean {
  const normA = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  const normB = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normA === normB) return true;
  if (normA.includes(normB) || normB.includes(normA)) {
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    if (minLen / maxLen > 0.75) return true;
  }
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let common = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) common++;
  }
  const jaccard = common / Math.max(wordsA.size, wordsB.size);
  return jaccard >= 0.7;
}

export async function findArxivPreprintByTitle(title: string): Promise<string | null> {
  if (!title || title.trim().length < 8) return null;

  try {
    const cleanTitle = title
      .replace(/[:\-]/g, " ")
      .replace(/["'’]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const apiUrl = `https://export.arxiv.org/api/query?search_query=ti:%22${encodeURIComponent(cleanTitle)}%22&max_results=3`;
    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ResearchAssistant/1.0)",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const xml = await res.text();
    const entryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);
    for (const match of entryMatches) {
      const entryXml = match[1];
      const entryTitleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/);
      const entryIdMatch = entryXml.match(/<id>http:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/);

      if (entryTitleMatch && entryIdMatch) {
        const candidateTitle = entryTitleMatch[1].replace(/\s+/g, " ").trim();
        if (isStrongTitleMatch(cleanTitle, candidateTitle)) {
          const arxivId = entryIdMatch[1].trim();
          return `https://arxiv.org/pdf/${arxivId}.pdf`;
        }
      }
    }
  } catch (err) {
    console.warn(`[ContentResolver] arXiv cross-match search failed for "${title}":`, err);
  }

  return null;
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
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("text/html")) {
          // Attempt to extract direct PDF URL from meta tags or hrefs
          try {
            const htmlText = await response.text();
            const pdfMatch =
              htmlText.match(/<meta[^>]+name=["']citation_pdf_url["'][^>]+content=["']([^"']+)["']/i) ||
              htmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']citation_pdf_url["']/i) ||
              htmlText.match(/href=["'](https?:\/\/[^"']+\.pdf)["']/i);

            if (pdfMatch && pdfMatch[1]) {
              const redirectPdfUrl = pdfMatch[1];
              const pdfRes = await fetch(redirectPdfUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (compatible; ResearchAssistant/1.0; +https://github.com/academic-assistant)",
                  Accept: "application/pdf,*/*",
                },
              });
              if (pdfRes.ok) {
                const arrayBuf = await pdfRes.arrayBuffer();
                if (arrayBuf.byteLength > 2000) {
                  const parser = new PDFParse({ data: Buffer.from(arrayBuf) });
                  const textResult = await parser.getText();
                  const cleaned = cleanExtractedText(textResult?.text || "");

                  if (cleaned.length >= 400) {
                    return {
                      paperId: paper.id,
                      title: paper.title,
                      contentText: cleaned,
                      sourceType: "full_pdf",
                      charCount: cleaned.length,
                      metadataSnippet,
                    };
                  }
                }
              }
            }
          } catch {
            // ignore HTML parse error
          }
        } else {
          // Direct binary PDF stream
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
      }
    } catch (err) {
      console.warn(`[ContentResolver] Remote PDF fetch skipped or failed for ${targetPdfUrl}:`, err);
    }
  }

  // 3. Try arXiv Preprint Cross-Matching Engine if paper has no working PDF yet
  if (paper.title && paper.title.trim().length >= 8) {
    try {
      const preprintPdfUrl = await findArxivPreprintByTitle(paper.title);
      if (preprintPdfUrl) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const arxivRes = await fetch(preprintPdfUrl, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; ResearchAssistant/1.0; +https://github.com/academic-assistant)",
            Accept: "application/pdf,*/*",
          },
        });
        clearTimeout(timeoutId);

        if (arxivRes.ok) {
          const arrayBuf = await arxivRes.arrayBuffer();
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

              // Persist resolved preprint PDF URL in SQLite if paper is saved
              try {
                if (paper.id && isPaperSaved(paper.id)) {
                  savePaper({ ...(paper as Paper), pdfUrl: preprintPdfUrl });
                }
              } catch {}

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
      }
    } catch (err) {
      console.warn(`[ContentResolver] arXiv cross-match fetch failed for "${paper.title}":`, err);
    }
  }

  // 4. Fallback to comprehensive abstract & structured sections
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
