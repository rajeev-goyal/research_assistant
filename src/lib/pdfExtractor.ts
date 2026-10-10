import { PDFParse } from "pdf-parse";

export interface ExtractedPdfMetadata {
  title: string;
  authors: string[];
  year: number;
  abstract: string;
  venue?: string;
  pageCount: number;
  rawText: string;
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t ]+/g, " ")
    .trim();
}

/**
 * Normalizes title candidates: filters out preprint stamps, journal headers, etc.
 */
function isHeaderNoise(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.startsWith("arxiv:") ||
    lower.includes("under review") ||
    lower.includes("proceedings of") ||
    lower.includes("conference on") ||
    lower.includes("symposium on") ||
    lower.includes("journal of") ||
    lower.includes("ieee transactions") ||
    lower.includes("a preprint") ||
    lower.includes("permission to reproduce") ||
    lower.includes("attribution is provided") ||
    lower.includes("scholarly works") ||
    lower.includes("solely for use") ||
    lower.includes("journalistic") ||
    lower.includes("all rights reserved") ||
    lower.includes("copyright") ||
    lower.startsWith("vol.") ||
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("doi:") ||
    lower.startsWith("page ") ||
    /^\d+$/.test(line.trim())
  );
}

export async function extractMetadataFromPdf(buffer: Buffer, originalFilename?: string): Promise<ExtractedPdfMetadata> {
  const parser = new PDFParse({ data: buffer });
  let rawText = "";
  let info: Record<string, any> = {};
  let numPages = 1;

  try {
    const textResult = await parser.getText();
    rawText = textResult?.text || "";
    const infoResult = await parser.getInfo();
    info = (infoResult?.info || {}) as Record<string, any>;
    numPages = infoResult?.total || 1;
  } finally {
    try {
      await parser.destroy();
    } catch {
      // ignore destroy errors
    }
  }

  // Split first page / initial chunk into lines
  const lines = rawText
    .slice(0, 3500)
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => Boolean(l));

  // --- 1. Extract Title ---
  let title = "";

  // Check PDF info dictionary first
  if (info.Title && typeof info.Title === "string" && info.Title.trim().length > 5) {
    const infoTitle = info.Title.trim();
    const isGeneric =
      infoTitle.toLowerCase().includes("untitled") ||
      infoTitle.toLowerCase().endsWith(".pdf") ||
      infoTitle.toLowerCase().startsWith("microsoft word") ||
      infoTitle.toLowerCase().startsWith("latex") ||
      infoTitle.toLowerCase().includes("permission") ||
      infoTitle.toLowerCase().includes("attribution") ||
      infoTitle.toLowerCase().includes("copyright") ||
      infoTitle.toLowerCase().includes("rights reserved") ||
      infoTitle.length > 200;

    if (!isGeneric) {
      title = cleanText(infoTitle);
    }
  }

  // If not found in metadata or metadata was generic, extract top lines from text
  if (!title || title.length < 5) {
    const titleCandidates: string[] = [];
    let abstractIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (/^abstract\b/i.test(lines[i])) {
        abstractIndex = i;
        break;
      }
    }

    const searchLimit = abstractIndex > 0 ? Math.min(abstractIndex, 10) : Math.min(lines.length, 10);

    for (let i = 0; i < searchLimit; i++) {
      const line = lines[i];
      if (isHeaderNoise(line)) continue;

      // Stop if line looks like author affiliations or emails
      if (
        line.includes("@") ||
        line.toLowerCase().includes("university") ||
        line.toLowerCase().includes("department") ||
        line.toLowerCase().includes("laboratory") ||
        line.toLowerCase().includes("institute")
      ) {
        break;
      }

      titleCandidates.push(line);
      // Academic titles rarely exceed 2-3 lines
      if (titleCandidates.length >= 3) break;
    }

    if (titleCandidates.length > 0) {
      title = cleanText(titleCandidates.join(" "));
    }
  }

  // Fallback if still empty: use sanitized filename
  if (!title && originalFilename) {
    title = originalFilename
      .replace(/\.pdf$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
  }
  if (!title) title = "Uploaded Research Paper";

  // --- 2. Extract Year ---
  let year = new Date().getFullYear();

  // Try creation date from metadata
  if (info.CreationDate && typeof info.CreationDate === "string") {
    const match = info.CreationDate.match(/D:(\d{4})/);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (parsed >= 1950 && parsed <= year + 1) {
        year = parsed;
      }
    }
  }

  // If metadata year was not found, search in first 2000 characters
  if (year === new Date().getFullYear()) {
    const yearMatch = rawText.slice(0, 2000).match(/(?:©|Copyright|\(c\)|Published|Proceedings)[\s\S]{0,40}?(20\d\d|19\d\d)/i);
    if (yearMatch) {
      const parsed = parseInt(yearMatch[1], 10);
      if (parsed >= 1950 && parsed <= year + 1) {
        year = parsed;
      }
    }
  }

  // --- 3. Extract Abstract ---
  let abstract = "";
  const abstractRegex = /\b(?:abstract|a\s+b\s+s\s+t\s+r\s+a\s+c\s+t)\b[:.\s\n]*/i;
  const abstractMatch = rawText.slice(0, 4000).match(abstractRegex);

  if (abstractMatch && abstractMatch.index !== undefined) {
    const startIdx = abstractMatch.index + abstractMatch[0].length;
    const textAfterAbstract = rawText.slice(startIdx, startIdx + 3000);

    // Look for next section header
    const endMatch = textAfterAbstract.match(
      /\n(?:\d+[\s.]+|[I|V|X]+[\s.]+|)(?:Introduction|Index Terms|Keywords|Categories and Subject Descriptors|Background|Overview)\b/i
    );

    let rawAbstract = "";
    if (endMatch && endMatch.index !== undefined) {
      rawAbstract = textAfterAbstract.slice(0, endMatch.index);
    } else {
      // Take first 1-2 paragraphs
      const paragraphs = textAfterAbstract.split(/\n\s*\n/);
      rawAbstract = paragraphs[0] || textAfterAbstract.slice(0, 1000);
    }

    // Clean hyphenated word breaks (e.g. "com-\nputer" -> "computer")
    abstract = cleanText(
      rawAbstract
        .replace(/(\w+)-\n(\w+)/g, "$1$2")
        .replace(/\n/g, " ")
    );
  }

  if (!abstract || abstract.length < 25) {
    abstract = "Abstract could not be automatically extracted from this document.";
  }

  // --- 4. Extract Authors ---
  const authors: string[] = [];

  // Check metadata first
  if (info.Author && typeof info.Author === "string" && info.Author.trim().length > 2) {
    const metaAuthor = info.Author.trim();
    if (
      !metaAuthor.toLowerCase().includes("latex") &&
      !metaAuthor.toLowerCase().includes("tex") &&
      !metaAuthor.toLowerCase().includes("microsoft")
    ) {
      const parts = metaAuthor.split(/[,;&]|\band\b/i).map((a: string) => a.trim()).filter(Boolean);
      for (const p of parts) {
        if (p.length > 2 && p.length < 50 && !authors.includes(p)) {
          authors.push(p);
        }
      }
    }
  }

  // Text heuristic if authors empty
  if (authors.length === 0) {
    let abstractIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^abstract\b/i.test(lines[i])) {
        abstractIdx = i;
        break;
      }
    }

    // Look between title lines and abstract
    if (abstractIdx > 1) {
      for (let i = 1; i < abstractIdx; i++) {
        const line = lines[i];
        if (isHeaderNoise(line)) continue;
        if (line.includes("@")) continue; // email line
        if (/university|department|laboratory|institute|school|college|ltd|inc|group/i.test(line)) continue;

        // Clean out superscript numbers/symbols
        const cleanedLine = line.replace(/[\d*†‡§]+/g, "").trim();
        const candidates = cleanedLine.split(/[,;&]|\band\b/i).map((c: string) => c.trim()).filter(Boolean);

        for (const c of candidates) {
          // A person's name usually has 2-4 words, starts with capital letters, and no special chars
          if (/^[A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){1,3}$/.test(c)) {
            if (!authors.includes(c)) {
              authors.push(c);
            }
          }
        }
        if (authors.length >= 6) break;
      }
    }
  }

  if (authors.length === 0) {
    authors.push("Unknown Author");
  }

  return {
    title,
    authors,
    year,
    abstract,
    venue: "Uploaded PDF",
    pageCount: numPages,
    rawText,
  };
}
