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

function isAffiliationOrEmail(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    line.includes("@") ||
    lower.startsWith("http") ||
    lower.includes("project page") ||
    lower.includes("github.com") ||
    lower.includes("university") ||
    lower.includes("department") ||
    lower.includes("laboratory") ||
    lower.includes("institute") ||
    lower.includes("school of") ||
    lower.includes("college of") ||
    lower.includes("google brain") ||
    lower.includes("google research") ||
    lower.includes("meta ai") ||
    lower.includes("microsoft research") ||
    lower.includes("deepmind") ||
    lower.includes("openai") ||
    lower.includes("corporation") ||
    lower.includes("center for")
  );
}

function isAuthorLine(line: string): boolean {
  if (isAffiliationOrEmail(line) || isHeaderNoise(line)) return false;
  if (/[\bA-Za-z\u00C0-\u024F]+\s*[*∗†‡§\^#]/.test(line)) return true;
  if (/\b[A-Za-z\u00C0-\u024F]+\s+\d+\b/.test(line)) return true;
  if (line.includes(",") || /\band\b/i.test(line)) {
    if (!/system|model|generation|algorithm|framework|learning|network|analysis|study|survey|review|approach|towards|interactive|diffusion|streaming/i.test(line)) {
      return true;
    }
  }
  return false;
}

function extractAuthorsFromLines(rawLines: string[]): string[] {
  const authors: string[] = [];
  for (const raw of rawLines) {
    if (isAffiliationOrEmail(raw) || isHeaderNoise(raw)) continue;
    let cleaned = raw.replace(/[*∗†‡§\^#]/g, "");
    cleaned = cleaned.replace(/(\b[A-Za-z\u00C0-\u024F]+)\s*[\d,]+\s*/g, "$1, ");
    cleaned = cleaned.replace(/\s+and\s+/gi, ", ");
    cleaned = cleaned.replace(/\s*&\s*/g, ", ");

    const parts = cleaned.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      const name = p.replace(/\s+/g, " ").trim();
      if (/^[A-Za-z\u00C0-\u024F.-]+(?:\s+[A-Za-z\u00C0-\u024F.-]+)+$/.test(name)) {
        const lower = name.toLowerCase();
        const hasTechNoise = /video|generation|system|model|diffusion|streaming|learning|network|university|department|laboratory|institute|research|project|google|meta|microsoft|apple|amazon|openai|deepmind/i.test(lower);
        if (!hasTechNoise && !authors.includes(name) && name.length >= 3 && name.length <= 40) {
          authors.push(name);
        }
      }
    }
  }
  return authors;
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
  const rawLines = rawText
    .slice(0, 3500)
    .split("\n")
    .map((l: string) => l.trim())
    .filter((l: string) => Boolean(l));

  const preAbstractLines: string[] = [];
  for (const l of rawLines) {
    if (/^abstract\b/i.test(l)) break;
    if (isHeaderNoise(l)) continue;
    preAbstractLines.push(l);
  }

  // Detect boundary where title ends and authors begin
  let firstAuthorIdx = -1;
  for (let i = 0; i < preAbstractLines.length; i++) {
    if (isAuthorLine(preAbstractLines[i])) {
      firstAuthorIdx = i;
      break;
    }
    if (i + 1 < preAbstractLines.length && isAffiliationOrEmail(preAbstractLines[i + 1])) {
      firstAuthorIdx = i;
      break;
    }
  }

  let textExtractedTitle = "";
  let authorCandidates: string[] = [];

  if (firstAuthorIdx > 0) {
    textExtractedTitle = preAbstractLines.slice(0, firstAuthorIdx).join(" ").replace(/\s+/g, " ").trim();
    authorCandidates = preAbstractLines.slice(firstAuthorIdx);
  } else if (preAbstractLines.length > 0) {
    textExtractedTitle = preAbstractLines[0];
    authorCandidates = preAbstractLines.slice(1);
  }

  // --- 1. Determine Title ---
  let title = "";

  // Check PDF info dictionary first if clean and not containing author concatenations
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
      infoTitle.length > 200 ||
      isAuthorLine(infoTitle); // Avoid titles contaminated with author lists

    if (!isGeneric) {
      title = cleanText(infoTitle);
    }
  }

  if (!title || title.length < 5) {
    title = textExtractedTitle;
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

  if (info.CreationDate && typeof info.CreationDate === "string") {
    const match = info.CreationDate.match(/D:(\d{4})/);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (parsed >= 1950 && parsed <= year + 1) {
        year = parsed;
      }
    }
  }

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

    const endMatch = textAfterAbstract.match(
      /\n(?:\d+[\s.]+|[I|V|X]+[\s.]+|)(?:Introduction|Index Terms|Keywords|Categories and Subject Descriptors|Background|Overview)\b/i
    );

    let rawAbstract = "";
    if (endMatch && endMatch.index !== undefined) {
      rawAbstract = textAfterAbstract.slice(0, endMatch.index);
    } else {
      const paragraphs = textAfterAbstract.split(/\n\s*\n/);
      rawAbstract = paragraphs[0] || textAfterAbstract.slice(0, 1000);
    }

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
  let authors: string[] = extractAuthorsFromLines(authorCandidates);

  // If text lines yielded no authors, fallback to PDF info dictionary if valid person names
  if (authors.length === 0 && info.Author && typeof info.Author === "string" && info.Author.trim().length > 2) {
    const metaAuthor = info.Author.trim();
    const hasTechNoise = /video|generation|system|model|diffusion|streaming|learning|network|latex|tex|microsoft|untitled/i.test(metaAuthor);
    if (!hasTechNoise) {
      const parts = metaAuthor.split(/[,;&]|\band\b/i).map((a: string) => a.trim()).filter(Boolean);
      for (const p of parts) {
        if (/^[A-Za-z\u00C0-\u024F.-]+(?:\s+[A-Za-z\u00C0-\u024F.-]+)+$/.test(p)) {
          if (!authors.includes(p)) {
            authors.push(p);
          }
        }
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
