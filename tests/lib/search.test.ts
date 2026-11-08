import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hasMeaningfulAbstract,
  isLegitimatePaper,
  fetchFallbackAbstract,
  searchPapers,
} from "@/lib/search";
import * as libraryRepo from "@/lib/db/libraryRepo";
import { Paper } from "@/types/paper";

describe("Academic Search Module - search.ts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(libraryRepo, "getSavedPaperIds").mockReturnValue(new Set(["arxiv:2310.saved"]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("hasMeaningfulAbstract", () => {
    it("should return false for missing, default placeholder, or too short abstracts", () => {
      expect(hasMeaningfulAbstract({ abstract: "" } as Paper)).toBe(false);
      expect(hasMeaningfulAbstract({ abstract: "No abstract available." } as Paper)).toBe(false);
      expect(hasMeaningfulAbstract({ abstract: "Published in conference proceedings." } as Paper)).toBe(false);
      expect(hasMeaningfulAbstract({ abstract: "Short text" } as Paper)).toBe(false);
    });

    it("should return true for substantial research abstracts", () => {
      const validPaper: Paper = {
        id: "p1",
        title: "Test",
        abstract: "This paper presents a scalable approach to diffusion probabilistic models on multimodal benchmarks.",
        authors: ["Researcher A"],
        year: 2024,
        url: "http://example.com",
        source: "arxiv",
      };
      expect(hasMeaningfulAbstract(validPaper)).toBe(true);
    });
  });

  describe("isLegitimatePaper", () => {
    it("should reject figures, tables, datasets, errata, and corrupted artifacts", () => {
      const figurePaper: Paper = {
        id: "crossref:doi/fig-1",
        title: "Figure 1. Architecture diagram of neural net",
        abstract: "",
        authors: ["Author A"],
        year: 2023,
        url: "http://example.com/fig-1",
        source: "arxiv",
      };
      expect(isLegitimatePaper(figurePaper)).toBe(false);

      const erratumPaper: Paper = {
        id: "openalex:W123",
        title: "Erratum to: Deep Residual Learning for Image Recognition",
        abstract: "",
        authors: ["Kaiming He"],
        year: 2016,
        url: "http://example.com",
        source: "arxiv",
      };
      expect(isLegitimatePaper(erratumPaper)).toBe(false);

      const tablePaper: Paper = {
        id: "openalex:W456",
        title: "Table 2: Ablation results on GLUE dataset",
        abstract: "",
        authors: [],
        year: 2021,
        url: "http://example.com",
        source: "arxiv",
      };
      expect(isLegitimatePaper(tablePaper)).toBe(false);
    });

    it("should reject items with no authors and no substantial abstract", () => {
      const ghostPaper: Paper = {
        id: "openalex:W789",
        title: "Some Miscellaneous Entry",
        abstract: "",
        authors: [],
        year: 2022,
        url: "http://example.com",
        source: "arxiv",
      };
      expect(isLegitimatePaper(ghostPaper)).toBe(false);
    });

    it("should accept valid research papers with authors and titles", () => {
      const validPaper: Paper = {
        id: "openalex:W100",
        title: "Attention Is All You Need",
        abstract: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
        authors: ["Ashish Vaswani", "Noam Shazeer"],
        year: 2017,
        url: "https://arxiv.org/abs/1706.03762",
        source: "arxiv",
      };
      expect(isLegitimatePaper(validPaper)).toBe(true);
    });
  });

  describe("fetchFallbackAbstract", () => {
    it("should return empty string when neither DOI nor PMID provided", async () => {
      const abstract = await fetchFallbackAbstract();
      expect(abstract).toBe("");
    });

    it("should fetch abstract from Europe PMC using DOI", async () => {
      const mockEuropePmcResponse = {
        resultList: {
          result: [
            {
              abstractText: "<p>Europe PMC recovered abstract for Nature research paper on CRISPR Cas9 mechanisms.</p>",
            },
          ],
        },
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockEuropePmcResponse), { status: 200 })
      );

      const abstract = await fetchFallbackAbstract("10.1038/nature12345");
      expect(abstract).toBe("Europe PMC recovered abstract for Nature research paper on CRISPR Cas9 mechanisms.");
    });

    it("should gracefully handle network or API failures in fallback resolution", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network timeout"));

      const abstract = await fetchFallbackAbstract("10.1038/error-doi");
      expect(abstract).toBe("");
    });
  });

  describe("searchPapers Orchestrator", () => {
    it("should handle empty search results gracefully", async () => {
      const mockEmptyOpenAlex = {
        meta: { count: 0 },
        results: [],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(mockEmptyOpenAlex), { status: 200 })
      );

      const res = await searchPapers({ query: "nonexistent-query-terms-12345" });
      expect(res.results).toEqual([]);
      expect(res.total).toBe(0);
    });

    it("should query OpenAlex, mark saved papers, and rank papers with abstracts first", async () => {
      const mockOpenAlexData = {
        meta: { count: 2 },
        results: [
          {
            id: "https://openalex.org/W1",
            title: "Paper Without Abstract",
            publication_year: 2023,
            publication_date: "2023-05-01",
            doi: "https://doi.org/10.1000/1",
            primary_location: {
              landing_page_url: "https://example.com/1",
              pdf_url: null,
              is_oa: false,
              source: { display_name: "IEEE Conf" },
            },
            authorships: [{ author: { display_name: "Author One" } }],
            cited_by_count: 5,
            abstract_inverted_index: null,
          },
          {
            id: "https://openalex.org/W2",
            title: "Paper With Comprehensive Abstract",
            publication_year: 2024,
            publication_date: "2024-02-01",
            doi: "https://doi.org/10.1000/2",
            primary_location: {
              landing_page_url: "https://example.com/2",
              pdf_url: "https://example.com/2.pdf",
              is_oa: true,
              source: { display_name: "ACM Trans" },
            },
            authorships: [{ author: { display_name: "Author Two" } }],
            cited_by_count: 20,
            abstract_inverted_index: {
              "This": [0],
              "is": [1],
              "an": [2],
              "informative": [3],
              "abstract": [4],
              "explaining": [5],
              "the": [6],
              "novel": [7],
              "contributions": [8],
              "in": [9],
              "depth": [10],
            },
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (urlInput) => {
        const urlStr = urlInput.toString();
        if (urlStr.includes("api.openalex.org")) {
          return new Response(JSON.stringify(mockOpenAlexData), { status: 200 });
        }
        return new Response("Not found", { status: 404 });
      });

      const response = await searchPapers({
        query: "neural networks",
        provider: "openalex",
        limit: 10,
      });

      expect(response.results.length).toBe(2);
      // The paper with meaningful abstract should be ranked first!
      expect(response.results[0].title).toBe("Paper With Comprehensive Abstract");
      expect(response.results[0].abstract).toBe("This is an informative abstract explaining the novel contributions in depth");
      expect(response.results[0].isSaved).toBe(false);

      expect(response.results[1].title).toBe("Paper Without Abstract");
    });
  });
});
