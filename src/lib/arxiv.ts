import { XMLParser } from "fast-xml-parser";
import { Paper } from "@/types/paper";

export interface ArxivSearchParams {
  query: string;
  page?: number;
  limit?: number;
  sortBy?: "relevance" | "submittedDate" | "lastUpdatedDate";
  sortOrder?: "descending" | "ascending";
  field?: "all" | "title" | "author" | "abstract";
}

export interface ArxivSearchResult {
  total: number;
  page: number;
  limit: number;
  results: Paper[];
}

function cleanText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function searchArxiv(params: ArxivSearchParams): Promise<ArxivSearchResult> {
  const {
    query,
    page = 1,
    limit = 12,
    sortBy = "relevance",
    sortOrder = "descending",
    field = "all",
  } = params;

  if (!query || !query.trim()) {
    return {
      total: 0,
      page,
      limit,
      results: [],
    };
  }

  // Construct search_query prefix based on field selection
  const trimmed = query.trim();
  let searchPrefix = "all";
  if (field === "title") searchPrefix = "ti";
  else if (field === "author") searchPrefix = "au";
  else if (field === "abstract") searchPrefix = "abs";

  // Escape query for arXiv query syntax
  const formattedQuery = `${searchPrefix}:"${encodeURIComponent(trimmed)}"`;
  const start = Math.max(0, (page - 1) * limit);

  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", formattedQuery);
  url.searchParams.set("start", start.toString());
  url.searchParams.set("max_results", limit.toString());
  url.searchParams.set("sortBy", sortBy);
  url.searchParams.set("sortOrder", sortOrder);

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "AIResearchAssistant/1.0 (academic research client)",
    },
    // Next.js fetch cache configuration: cache search results for 5 minutes
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`arXiv API responded with status ${response.status}: ${response.statusText}`);
  }

  const xmlText = await response.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) => ["entry", "author", "link"].includes(name),
  });

  const parsed = parser.parse(xmlText);
  const feed = parsed.feed;

  if (!feed) {
    return { total: 0, page, limit, results: [] };
  }

  const totalResults = parseInt(feed["opensearch:totalResults"] || "0", 10);
  const rawEntries = feed.entry || [];

  const results: Paper[] = rawEntries.map((entry: any) => {
    const rawId = entry.id || "";
    // Format id like 'arxiv:2310.12345'
    const idMatch = rawId.match(/abs\/([a-zA-Z0-9.\-_/]+)(v\d+)?$/);
    const arxivRawId = idMatch ? idMatch[1] : rawId.replace(/https?:\/\/arxiv.org\/abs\//, "");
    const canonicalId = `arxiv:${arxivRawId}`;

    const title = cleanText(entry.title);
    const abstract = cleanText(entry.summary);

    // Parse authors
    const rawAuthors = entry.author || [];
    const authors: string[] = rawAuthors
      .map((a: any) => cleanText(a.name))
      .filter((name: string) => Boolean(name));

    // Parse dates and year
    const publicationDate = entry.published || entry.updated || "";
    let year = new Date().getFullYear();
    if (publicationDate) {
      const parsedYear = new Date(publicationDate).getFullYear();
      if (!isNaN(parsedYear)) {
        year = parsedYear;
      }
    }

    // Parse links (abstract link and direct PDF)
    const links = entry.link || [];
    let paperUrl = rawId;
    let pdfUrl: string | undefined = undefined;

    for (const l of links) {
      const href = l["@_href"];
      const rel = l["@_rel"];
      const titleAttr = l["@_title"];
      const type = l["@_type"];

      if (type === "application/pdf" || titleAttr === "pdf") {
        pdfUrl = href;
      } else if (rel === "alternate" || !paperUrl) {
        paperUrl = href;
      }
    }

    if (!pdfUrl && arxivRawId) {
      pdfUrl = `https://arxiv.org/pdf/${arxivRawId}.pdf`;
    }

    // Venue / Category extraction
    let venue: string | undefined = undefined;
    if (entry["arxiv:primary_category"]?.["@_term"]) {
      venue = `arXiv: ${entry["arxiv:primary_category"]["@_term"]}`;
    } else if (entry["arxiv:journal_ref"]) {
      venue = cleanText(entry["arxiv:journal_ref"]);
    }

    return {
      id: canonicalId,
      title,
      abstract,
      authors,
      year,
      publicationDate: publicationDate ? new Date(publicationDate).toISOString().split("T")[0] : undefined,
      venue,
      url: paperUrl,
      pdfUrl,
      source: "arxiv",
      citationCount: 0,
      isSaved: false,
    };
  });

  return {
    total: totalResults,
    page,
    limit,
    results,
  };
}
