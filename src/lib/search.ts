import { Paper, SearchResponse } from "@/types/paper";
import { searchArxiv } from "./arxiv";
import { getSavedPaperIds } from "./db/libraryRepo";

export interface UnifiedSearchParams {
  query: string;
  page?: number;
  limit?: number;
  provider?: "all" | "openalex" | "arxiv";
  sortBy?: "relevance" | "date";
  year?: string;
}

function reconstructAbstract(invertedIndex: Record<string, number[]> | undefined | null): string {
  if (!invertedIndex || typeof invertedIndex !== "object") return "";
  const words: [number, string][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    if (Array.isArray(positions)) {
      for (const pos of positions) {
        words.push([pos, word]);
      }
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map((w) => w[1]).join(" ");
}

/**
 * Resolves missing abstracts from open scientific registries (Europe PMC, Semantic Scholar).
 * Particularly important for publishers (such as Nature Portfolio, Springer, Lancet, Cell)
 * whose bulk inverted index is restricted from OpenAlex due to publisher commercial terms,
 * but is openly accessible through Europe PMC / PubMed Central open research mandates.
 */
export async function fetchFallbackAbstract(doi?: string, pmid?: string): Promise<string> {
  const cleanDoi = doi ? doi.replace(/^https?:\/\/doi\.org\//i, "").trim() : "";
  const cleanPmid = pmid ? pmid.replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, "").trim() : "";

  // 1. Europe PMC via DOI (ideal for Nature, Springer, Lancet, Elsevier, Cell, PLOS)
  if (cleanDoi) {
    try {
      const res = await fetch(
        `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:${encodeURIComponent(cleanDoi)}&format=json&resultType=core`,
        { next: { revalidate: 86400 } }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.resultList?.result?.[0]?.abstractText;
        if (text && text.trim().length > 40) {
          return text.replace(/<[^>]+>/g, "").trim();
        }
      }
    } catch {}
  }

  // 2. Europe PMC via PMID
  if (cleanPmid) {
    try {
      const res = await fetch(
        `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:${encodeURIComponent(cleanPmid)}%20SRC:MED&format=json&resultType=core`,
        { next: { revalidate: 86400 } }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.resultList?.result?.[0]?.abstractText;
        if (text && text.trim().length > 40) {
          return text.replace(/<[^>]+>/g, "").trim();
        }
      }
    } catch {}
  }

  // 3. Semantic Scholar via DOI
  if (cleanDoi) {
    try {
      const res = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(cleanDoi)}?fields=abstract`,
        { next: { revalidate: 86400 } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.abstract && data.abstract.trim().length > 40) {
          return data.abstract.trim();
        }
      }
    } catch {}
  }

  return "";
}

/**
 * Clean user query: remove accidental leading single characters like "t " or typos
 */
function cleanSearchQuery(q: string): string {
  let cleaned = q.trim();
  cleaned = cleaned.replace(/^[a-zA-Z]\s+(?=[A-Z])/, "");
  return cleaned;
}

/**
 * Checks if a paper has an informative, non-empty abstract.
 */
export function hasMeaningfulAbstract(paper: Paper): boolean {
  if (!paper.abstract) return false;
  const clean = paper.abstract.trim();
  if (
    clean === "" ||
    clean === "No abstract available." ||
    clean === "Published in conference proceedings." ||
    clean.length < 20
  ) {
    return false;
  }
  return true;
}

/**
 * Filter to ensure returned items are legitimate research papers,
 * discarding figures, tables, datasets, errata, author replies, and corrupted artifacts.
 */
export function isLegitimatePaper(paper: Paper): boolean {
  if (!paper || !paper.title) return false;
  const title = paper.title.trim();
  if (title.length < 5) return false;

  const lowerTitle = title.toLowerCase();

  // Filter out figures, graphics, tables, datasets, errata, front/back matter
  const artifactRegex = /^(figure\s+\d+|fig\.\s*\d+|table\s+\d+|supplementary\s+(figure|table|material|data)|errat(um|a)|corrigend(um|a)|author index|subject index|cover image|table of contents|editorial board|front matter|back matter|author reply)\b/i;
  if (artifactRegex.test(lowerTitle)) {
    return false;
  }

  // Filter out components/figures based on DOI or ID patterns
  if (
    paper.id.toLowerCase().includes("/fig-") ||
    paper.id.toLowerCase().includes("/figure-") ||
    paper.id.toLowerCase().includes("/table-") ||
    paper.url.toLowerCase().includes("/fig-")
  ) {
    return false;
  }

  // A valid research paper should have authors, unless it has a verified substantial abstract
  const hasAuthors = paper.authors && paper.authors.length > 0;
  const hasSubstantialAbstract =
    paper.abstract &&
    paper.abstract.length > 80 &&
    paper.abstract !== "No abstract available." &&
    paper.abstract !== "Published in conference proceedings.";

  if (!hasAuthors && !hasSubstantialAbstract) {
    return false;
  }

  return true;
}

/**
 * Searches Crossref for exact or bibliographic title matches (especially for ACM, IEEE, Nature, etc.)
 * Only triggers if the query is a substantial multi-word title candidate.
 */
async function searchCrossrefExactTitle(rawQuery: string): Promise<Paper | null> {
  const query = cleanSearchQuery(rawQuery);
  const words = query.split(/\s+/).filter(Boolean);

  // Only trigger title precision lookup if query contains at least 3 words and >= 15 characters
  // Avoids running on single keywords like "attention" or "quantum" which are topic searches
  if (words.length < 3 || query.length < 15) return null;

  try {
    const url = new URL("https://api.crossref.org/works");
    url.searchParams.set("query.bibliographic", query);
    url.searchParams.set("rows", "3");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "AIResearchAssistant/1.0 (mailto:researcher@example.com)",
      },
      next: { revalidate: 600 },
    });

    if (!response.ok) return null;
    const data = await response.json();
    const items = data.message?.items || [];
    if (!items.length) return null;

    for (const item of items) {
      // Discard components, figures, datasets, reviews
      const itemType = (item.type || "").toLowerCase();
      if (["component", "dataset", "figure", "graphic", "table", "peer-review", "other"].includes(itemType)) {
        continue;
      }

      const title = item.title?.[0] || "";
      if (!title || title.length < 5) continue;

      // Filter figure/table titles
      if (/^(figure\s+\d+|fig\.\s*\d+|table\s+\d+|supplementary\b)/i.test(title)) {
        continue;
      }

      // Check word overlap with query
      const queryTokens = query.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);
      const titleTokens = title.toLowerCase().replace(/[^a-z0-9]/g, " ").split(/\s+/).filter(Boolean);
      const matches = queryTokens.filter((tok) => titleTokens.includes(tok));
      const overlapRatio = matches.length / Math.max(1, queryTokens.length);

      // Must have at least 60% token overlap for high confidence
      if (overlapRatio < 0.6) continue;

      // Enrich with OpenAlex using DOI
      if (item.DOI) {
        try {
          const oaRes = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(item.DOI)}`, {
            next: { revalidate: 600 },
          });
          if (oaRes.ok) {
            const oaWork = await oaRes.json();
            const rawId = oaWork.id ? oaWork.id.replace("https://openalex.org/", "") : `work:${Date.now()}`;
            let abstractText = reconstructAbstract(oaWork.abstract_inverted_index);
            if (!abstractText) {
              abstractText = await fetchFallbackAbstract(oaWork.doi || item.DOI, oaWork.ids?.pmid);
            }

            const candidatePaper: Paper = {
              id: `openalex:${rawId}`,
              title: oaWork.title || title,
              abstract: abstractText || "No abstract available.",
              authors: Array.isArray(oaWork.authorships)
                ? oaWork.authorships
                    .map((a: any) => a?.author?.display_name)
                    .filter((name: unknown): name is string => typeof name === "string" && Boolean(name))
                : [],
              year: oaWork.publication_year || item.created?.["date-parts"]?.[0]?.[0] || new Date().getFullYear(),
              publicationDate: oaWork.publication_date,
              venue: oaWork.primary_location?.source?.display_name || item["container-title"]?.[0],
              url: oaWork.doi || `https://doi.org/${item.DOI}`,
              pdfUrl: oaWork.open_access?.oa_url || undefined,
              source: "semanticscholar",
              citationCount: oaWork.cited_by_count || 0,
              isSaved: false,
            };

            if (isLegitimatePaper(candidatePaper)) {
              return candidatePaper;
            }
          }
        } catch {
          // fallback
        }
      }

      const authors = Array.isArray(item.author)
        ? item.author.map((a: any) => `${a.given || ""} ${a.family || ""}`.trim()).filter(Boolean)
        : [];

      let fallbackAbs = "";
      if (item.DOI) {
        fallbackAbs = await fetchFallbackAbstract(item.DOI);
      }

      const candidatePaper: Paper = {
        id: `crossref:${item.DOI || encodeURIComponent(title)}`,
        title,
        abstract: fallbackAbs || (item.abstract ? item.abstract.replace(/<[^>]+>/g, "").trim() : "Published in conference proceedings."),
        authors,
        year: item.created?.["date-parts"]?.[0]?.[0] || new Date().getFullYear(),
        venue: item["container-title"]?.[0],
        url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : ""),
        source: "semanticscholar",
        citationCount: item["is-referenced-by-count"] || 0,
        isSaved: false,
      };

      if (isLegitimatePaper(candidatePaper)) {
        return candidatePaper;
      }
    }

    return null;
  } catch (err) {
    console.error("Crossref precision lookup error:", err);
    return null;
  }
}

export async function searchOpenAlex(params: UnifiedSearchParams): Promise<SearchResponse> {
  const cleanQ = cleanSearchQuery(params.query);
  const { page = 1, limit = 12, sortBy = "relevance", year } = params;

  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", cleanQ);
  url.searchParams.set("per-page", (limit * 2).toString()); // fetch extra so post-filtering maintains limit
  url.searchParams.set("page", page.toString());

  if (sortBy === "date") {
    url.searchParams.set("sort", "publication_date:desc");
  } else {
    url.searchParams.set("sort", "relevance_score:desc");
  }

  if (year && year !== "all") {
    url.searchParams.set("filter", `publication_year:${year}`);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "AIResearchAssistant/1.0 (mailto:researcher@example.com)",
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`OpenAlex API responded with status ${response.status}`);
  }

  const data = await response.json();
  const rawResults = data.results || [];
  const total = data.meta?.count || 0;

  const results: Paper[] = [];

  for (const item of rawResults) {
    // Skip non-paper types in OpenAlex
    const itemType = (item.type || "").toLowerCase();
    if (["dataset", "paratext", "erratum", "supplementary-materials", "peer-review"].includes(itemType)) {
      continue;
    }

    const rawId = item.id ? item.id.replace("https://openalex.org/", "") : `work:${Date.now()}`;
    const id = `openalex:${rawId}`;

    const title = item.title || "Untitled Paper";
    const abstract = reconstructAbstract(item.abstract_inverted_index) || "No abstract available.";

    const authors = Array.isArray(item.authorships)
      ? item.authorships
          .map((a: any) => a?.author?.display_name)
          .filter((name: unknown): name is string => typeof name === "string" && Boolean(name))
      : [];

    const publicationYear = item.publication_year || new Date().getFullYear();
    const publicationDate = item.publication_date;

    const venue =
      item.primary_location?.source?.display_name ||
      item.host_venue?.display_name ||
      undefined;

    const urlStr =
      item.doi ||
      item.primary_location?.landing_page_url ||
      `https://openalex.org/${rawId}`;

    const pdfUrl =
      item.open_access?.oa_url ||
      item.primary_location?.pdf_url ||
      undefined;

    const paper: Paper = {
      id,
      title,
      abstract,
      authors,
      year: publicationYear,
      publicationDate,
      venue,
      url: urlStr,
      pdfUrl,
      source: "semanticscholar",
      citationCount: item.cited_by_count || 0,
      isSaved: false,
    };

    if (isLegitimatePaper(paper)) {
      results.push(paper);
    }
  }

  // Enrich papers missing abstracts in parallel via fallback registries (Europe PMC, Semantic Scholar)
  await Promise.all(
    results.map(async (paper) => {
      if (!paper.abstract || paper.abstract === "No abstract available.") {
        const fallback = await fetchFallbackAbstract(paper.url);
        if (fallback) {
          paper.abstract = fallback;
        }
      }
    })
  );

  // Stable sort: prioritize papers with an abstract, putting papers without abstracts at the bottom
  results.sort((a, b) => {
    const aHas = hasMeaningfulAbstract(a) ? 1 : 0;
    const bHas = hasMeaningfulAbstract(b) ? 1 : 0;
    return bHas - aHas;
  });

  const finalResults = results.slice(0, limit);

  return {
    query: cleanQ,
    total,
    page,
    limit,
    results: finalResults,
  };
}

export async function searchPapers(params: UnifiedSearchParams): Promise<SearchResponse & { providerUsed: string }> {
  const provider = params.provider || "all";
  let searchResponse: SearchResponse;
  let providerUsed = "openalex";

  if (provider === "arxiv") {
    try {
      const arxivRes = await searchArxiv({
        query: cleanSearchQuery(params.query),
        page: params.page,
        limit: params.limit,
        sortBy: params.sortBy === "date" ? "submittedDate" : "relevance",
      });
      searchResponse = {
        query: params.query,
        total: arxivRes.total,
        page: arxivRes.page,
        limit: arxivRes.limit,
        results: arxivRes.results.filter(isLegitimatePaper),
      };
      providerUsed = "arxiv";
    } catch {
      searchResponse = await searchOpenAlex(params);
      providerUsed = "openalex (arXiv fallback)";
    }
  } else {
    // Run OpenAlex and precision Crossref in parallel
    const [oaRes, exactMatch] = await Promise.all([
      searchOpenAlex(params),
      params.page === 1 ? searchCrossrefExactTitle(params.query) : Promise.resolve(null),
    ]);

    searchResponse = oaRes;
    providerUsed = "Global Index (OpenAlex + Crossref)";

    // If Crossref found an exact high-confidence match, ensure it is ranked #1
    if (exactMatch && isLegitimatePaper(exactMatch)) {
      const existingIdx = searchResponse.results.findIndex(
        (p) => p.id === exactMatch.id || p.title.toLowerCase() === exactMatch.title.toLowerCase()
      );
      if (existingIdx >= 0) {
        const [found] = searchResponse.results.splice(existingIdx, 1);
        searchResponse.results.unshift(found);
      } else {
        searchResponse.results.unshift(exactMatch);
        searchResponse.total += 1;
      }
    }
  }

  // Cross-reference with local SQLite database to mark already saved papers
  try {
    const paperIds = searchResponse.results.map((p) => p.id);
    const savedSet = getSavedPaperIds(paperIds);
    searchResponse.results = searchResponse.results.map((p) => ({
      ...p,
      isSaved: savedSet.has(p.id),
    }));
  } catch (err) {
    console.error("Failed to cross-reference saved status:", err);
  }

  // Stable sort in current view: ensure papers with complete abstracts appear first,
  // and any papers without abstracts are placed at the bottom of the page/list.
  searchResponse.results.sort((a, b) => {
    const aHas = hasMeaningfulAbstract(a) ? 1 : 0;
    const bHas = hasMeaningfulAbstract(b) ? 1 : 0;
    return bHas - aHas;
  });

  return {
    ...searchResponse,
    providerUsed,
  };
}
