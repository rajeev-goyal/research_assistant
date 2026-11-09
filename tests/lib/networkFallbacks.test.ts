import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchPapers, fetchFallbackAbstract } from "@/lib/search";
import { resolvePaperContent, findArxivPreprintByTitle } from "@/lib/paperContentResolver";
import * as libraryRepo from "@/lib/db/libraryRepo";
import { Paper } from "@/types/paper";

const mockGetText = vi.fn();
const mockGetInfo = vi.fn();
const mockDestroy = vi.fn();

vi.mock("pdf-parse", () => {
  return {
    PDFParse: class {
      constructor(public options?: any) {}
      getText() {
        return mockGetText();
      }
      getInfo() {
        return mockGetInfo();
      }
      destroy() {
        return mockDestroy();
      }
    },
  };
});

const longExtractedPdfText = `
1. Introduction and Architectural Motivation
Recent breakthroughs in deep neural representation learning have underscored the importance
of transformer architectures across multimodal tasks. Traditional recurrent models suffer
from sequential bottlenecks that prevent full GPU hardware parallelization. In this work,
we present an attention-driven framework that operates over dense embeddings while guaranteeing
sub-quadratic computational complexity.

2. Comprehensive Benchmark Evaluation
We evaluate our model across standard natural language understanding suites, achieving
superior BLEU scores of 41.8 on WMT 2014 English-to-German and 28.4 on English-to-French.
Extensive ablation studies demonstrate that scaled dot-product attention outperforms additive
scoring functions in both convergence speed and parameter efficiency.
`;

const mockArxivAtomXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <opensearch:totalResults>1</opensearch:totalResults>
  <entry>
    <id>http://arxiv.org/abs/1706.03762</id>
    <title>Attention Is All You Need</title>
    <summary>The dominant sequence transduction models are based on complex recurrent neural networks.</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <published>2017-06-12T17:00:00Z</published>
    <link href="http://arxiv.org/abs/1706.03762" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/1706.03762.pdf" rel="related" type="application/pdf"/>
  </entry>
</feed>`;

const mockOpenAlexSuccessResponse = {
  meta: { count: 1 },
  results: [
    {
      id: "https://openalex.org/W999001",
      title: "Self-Attention in Deep Generative Networks",
      publication_year: 2024,
      doi: "https://doi.org/10.1000/fallback-oa",
      primary_location: {
        landing_page_url: "https://example.com/paper",
        pdf_url: "https://example.com/paper.pdf",
        is_oa: true,
      },
      authorships: [{ author: { display_name: "Dr. Fallback Scientist" } }],
      cited_by_count: 42,
      abstract_inverted_index: {
        "This": [0],
        "is": [1],
        "a": [2],
        "fallback": [3],
        "abstract": [4],
        "from": [5],
        "OpenAlex": [6],
        "service": [7],
      },
    },
  ],
};

describe("Network Boundaries, Fallback Logic & Resilience", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDestroy.mockResolvedValue(undefined);
    mockGetText.mockResolvedValue({ text: longExtractedPdfText });
    mockGetInfo.mockResolvedValue({ info: { Title: "Sample Paper" }, total: 8 });
    vi.spyOn(libraryRepo, "getSavedPaperIds").mockReturnValue(new Set());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("searchPapers Fallback & Degradation", () => {
    it("should fall back to OpenAlex when provider is 'arxiv' and arXiv API returns HTTP 5xx or fails", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const urlStr = input.toString();
        if (urlStr.includes("export.arxiv.org")) {
          return new Response("Service Unavailable", { status: 503 });
        }
        if (urlStr.includes("api.openalex.org")) {
          return new Response(JSON.stringify(mockOpenAlexSuccessResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const response = await searchPapers({
        query: "deep learning",
        provider: "arxiv",
      });

      expect(response.results.length).toBe(1);
      expect(response.providerUsed).toBe("openalex (arXiv fallback)");
      expect(response.results[0].title).toBe("Self-Attention in Deep Generative Networks");
    });

    it("should automatically fall back to arXiv search when OpenAlex returns 5xx or network error", async () => {
      // CONFIRMED APPLICATION RESILIENCE BUG:
      // In src/lib/search.ts (lines 478-485), when provider="all" (the default), searchPapers executes:
      //   Promise.all([searchOpenAlex(params), searchCrossrefExactTitle(params.query)])
      // without a try/catch block to catch OpenAlex 5xx or network errors and degrade gracefully to searchArxiv.
      // In contrast, when provider="arxiv" (lines 457-476), an explicit try/catch catches arXiv errors and
      // falls back to OpenAlex. Under domain requirements for search availability, an OpenAlex service outage
      // or network timeout should trigger automatic fallback to arXiv search rather than crashing the route.
      // This test asserts the expected fallback behavior and is expected to fail until the application bug is fixed.
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const urlStr = input.toString();
        if (urlStr.includes("api.openalex.org")) {
          return new Response("Internal Server Error", { status: 500 });
        }
        if (urlStr.includes("export.arxiv.org")) {
          return new Response(mockArxivAtomXml, {
            status: 200,
            headers: { "Content-Type": "application/atom+xml" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const response = await searchPapers({
        query: "attention mechanism",
        provider: "all",
      });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results[0].title).toBe("Attention Is All You Need");
      expect(response.providerUsed).toMatch(/arxiv/i);
    });
  });

  describe("paperContentResolver - Remote PDF Downloading & Extraction", () => {
    it("should download remote open-access PDF via pdfUrl and extract full text", async () => {
      const mockPdfBuffer = Buffer.alloc(3000, "PDF-STREAM-PAYLOAD-");

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(mockPdfBuffer, {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        })
      );

      const paper: Partial<Paper> & { id: string; title: string } = {
        id: "openalex:W555123",
        title: "Advances in Neural Information Processing",
        pdfUrl: "https://openaccess.org/papers/sample.pdf",
        authors: ["Yann LeCun", "Geoffrey Hinton"],
        year: 2023,
      };

      const resolved = await resolvePaperContent(paper);

      expect(resolved.sourceType).toBe("full_pdf");
      expect(resolved.charCount).toBeGreaterThanOrEqual(400);
      expect(resolved.pageCount).toBe(1);
      expect(resolved.contentText).toContain("Recent breakthroughs in deep neural representation learning");
      expect(resolved.metadataSnippet).toContain("Title: Advances in Neural Information Processing");
    });

    it("should resolve direct arXiv PDF stream when paper id has 'arxiv:' prefix and no pdfUrl", async () => {
      const mockPdfBuffer = Buffer.alloc(2500, "ARXIV-PDF-DATA-");

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const urlStr = input.toString();
        if (urlStr === "https://arxiv.org/pdf/2301.00001.pdf") {
          return new Response(mockPdfBuffer, {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const paper: Partial<Paper> & { id: string; title: string } = {
        id: "arxiv:2301.00001",
        title: "Scalable Diffusion Models with Transformers",
        authors: ["William Peebles", "Saining Xie"],
        year: 2023,
      };

      const resolved = await resolvePaperContent(paper);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://arxiv.org/pdf/2301.00001.pdf",
        expect.objectContaining({
          headers: expect.objectContaining({ Accept: "application/pdf,*/*" }),
        })
      );
      expect(resolved.sourceType).toBe("full_pdf");
      expect(resolved.charCount).toBeGreaterThanOrEqual(400);
    });

    it("should handle HTML landing pages by extracting citation_pdf_url meta tag and downloading target PDF", async () => {
      const landingPageHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Publisher Landing Page</title>
            <meta name="citation_title" content="Deep Residual Learning">
            <meta name="citation_pdf_url" content="https://publisher.com/content/direct/paper123.pdf">
          </head>
          <body>
            <h1>Deep Residual Learning</h1>
          </body>
        </html>
      `;
      const mockPdfBuffer = Buffer.alloc(2800, "RESCUED-PDF-BINARY-");

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const urlStr = input.toString();
        if (urlStr === "https://publisher.com/article/landing") {
          return new Response(landingPageHtml, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        if (urlStr === "https://publisher.com/content/direct/paper123.pdf") {
          return new Response(mockPdfBuffer, {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const paper: Partial<Paper> & { id: string; title: string } = {
        id: "doi:10.1000/nature123",
        title: "Deep Residual Learning for Visual Recognition",
        pdfUrl: "https://publisher.com/article/landing",
      };

      const resolved = await resolvePaperContent(paper);

      expect(resolved.sourceType).toBe("full_pdf");
      expect(resolved.charCount).toBeGreaterThanOrEqual(400);
    });

    it("should fall back to abstract when remote PDF fetch aborts or returns non-PDF content", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ETIMEDOUT: Connection timed out after 12000ms"));

      const paper: Partial<Paper> & { id: string; title: string } = {
        id: "openalex:W99999",
        title: "Unreachable Remote Paper",
        pdfUrl: "https://broken-server.org/paper.pdf",
        abstract: "Comprehensive verified abstract of the publication with substantial scientific contributions.",
      };

      const resolved = await resolvePaperContent(paper);

      expect(resolved.sourceType).toBe("abstract");
      expect(resolved.contentText).toContain("Comprehensive verified abstract of the publication");
      expect(resolved.pageCount).toBeUndefined();
    });
  });

  describe("paperContentResolver - arXiv Preprint Cross-Matching", () => {
    it("should cross-match arXiv preprint by title when direct PDF links are absent and persist discovered link if paper is saved", async () => {
      const mockPdfBuffer = Buffer.alloc(3200, "CROSSMATCH-PDF-STREAM-");
      const savePaperSpy = vi.spyOn(libraryRepo, "savePaper").mockImplementation(() => {});
      vi.spyOn(libraryRepo, "isPaperSaved").mockReturnValue(true);

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const urlStr = input.toString();
        if (urlStr.includes("export.arxiv.org/api/query")) {
          return new Response(mockArxivAtomXml, {
            status: 200,
            headers: { "Content-Type": "application/atom+xml" },
          });
        }
        if (urlStr === "https://arxiv.org/pdf/1706.03762.pdf") {
          return new Response(mockPdfBuffer, {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const paper: Partial<Paper> & { id: string; title: string } = {
        id: "openalex:W_Vaswani_2017",
        title: "Attention Is All You Need",
        authors: ["Ashish Vaswani", "Noam Shazeer"],
        year: 2017,
        abstract: "The dominant sequence transduction models are based on complex recurrent neural networks.",
      };

      const resolved = await resolvePaperContent(paper);

      expect(resolved.sourceType).toBe("full_pdf");
      expect(resolved.charCount).toBeGreaterThanOrEqual(400);
      expect(savePaperSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "openalex:W_Vaswani_2017",
          pdfUrl: "https://arxiv.org/pdf/1706.03762.pdf",
        })
      );
    });

    it("should reject candidate preprint if title similarity is too weak", async () => {
      const weakMatchXml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>http://arxiv.org/abs/2301.99999</id>
          <title>Attention Guided Diffusion For Unrelated Medical Imaging</title>
        </entry>
      </feed>`;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const urlStr = input.toString();
        if (urlStr.includes("export.arxiv.org/api/query")) {
          return new Response(weakMatchXml, {
            status: 200,
            headers: { "Content-Type": "application/atom+xml" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const preprintUrl = await findArxivPreprintByTitle("Attention Is All You Need");
      expect(preprintUrl).toBeNull();
    });

    it("should return null immediately for empty or overly short titles (<8 characters)", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const result = await findArxivPreprintByTitle("AI");
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("fetchFallbackAbstract - Europe PMC & Semantic Scholar", () => {
    it("should resolve missing abstract from Europe PMC using PMID when DOI is absent", async () => {
      const mockPmcResponse = {
        resultList: {
          result: [
            {
              abstractText: "PubMed indexed clinical study abstract on mRNA vaccine efficacy against viral mutations.",
            },
          ],
        },
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const urlStr = input.toString();
        if (urlStr.includes("europepmc/webservices") && urlStr.includes("EXT_ID:34567890")) {
          return new Response(JSON.stringify(mockPmcResponse), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      const abstract = await fetchFallbackAbstract(undefined, "34567890");
      expect(abstract).toBe("PubMed indexed clinical study abstract on mRNA vaccine efficacy against viral mutations.");
    });

    it("should fall back to Semantic Scholar via DOI when Europe PMC returns no abstract", async () => {
      const mockEmptyPmc = { resultList: { result: [] } };
      const mockSemanticScholar = {
        abstract: "Semantic Scholar abstract retrieved after Europe PMC returned empty result.",
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const urlStr = input.toString();
        if (urlStr.includes("europepmc/webservices")) {
          return new Response(JSON.stringify(mockEmptyPmc), { status: 200 });
        }
        if (urlStr.includes("api.semanticscholar.org")) {
          return new Response(JSON.stringify(mockSemanticScholar), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      const abstract = await fetchFallbackAbstract("10.1038/nature-springer-paper");
      expect(abstract).toBe("Semantic Scholar abstract retrieved after Europe PMC returned empty result.");
    });

    it("should return empty string if both Europe PMC and Semantic Scholar return abstracts shorter than 40 characters", async () => {
      const mockShortPmc = { resultList: { result: [{ abstractText: "Too short" }] } };
      const mockShortSemanticScholar = { abstract: "Tiny text" };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const urlStr = input.toString();
        if (urlStr.includes("europepmc/webservices")) {
          return new Response(JSON.stringify(mockShortPmc), { status: 200 });
        }
        if (urlStr.includes("api.semanticscholar.org")) {
          return new Response(JSON.stringify(mockShortSemanticScholar), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      const abstract = await fetchFallbackAbstract("10.1038/short-abstract-paper");
      expect(abstract).toBe("");
    });
  });
});

