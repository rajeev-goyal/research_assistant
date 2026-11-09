import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "@/lib/db/schema";
import * as dbModule from "@/lib/db/index";
import {
  savePaper,
  savePapersBatch,
  getSavedPaperIds,
  isPaperSaved,
  deletePaper,
  getLibraryPapers,
  getPaperSummary,
  savePaperSummary,
  getChatMessages,
  saveChatMessage,
} from "@/lib/db/libraryRepo";
import { searchArxiv } from "@/lib/arxiv";
import { extractMetadataFromPdf } from "@/lib/pdfExtractor";
import * as searchModule from "@/lib/search";
import { GET as searchGet } from "@/app/api/search/route";
import { POST as uploadPost } from "@/app/api/upload/route";
import { NextRequest } from "next/server";
import { Paper } from "@/types/paper";
import fs from "fs";

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

describe("Boundary Conditions & Fault Hunting", () => {
  let memoryDb: Database.Database;

  beforeEach(() => {
    vi.restoreAllMocks();
    memoryDb = new Database(":memory:");
    memoryDb.pragma("foreign_keys = ON");
    memoryDb.exec(SCHEMA_SQL);
    vi.spyOn(dbModule, "getDatabase").mockReturnValue(memoryDb);
    mockDestroy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    memoryDb.close();
    vi.restoreAllMocks();
  });

  describe("Extreme Unicode & Internationalization in SQLite Persistence", () => {
    it("should accurately persist and retrieve papers with Emojis, RTL Arabic, CJK, and KaTeX notation", () => {
      const complexUnicodePaper: Paper = {
        id: "arxiv:unicode.2024.001",
        title: "🧬 CRISPR-Cas9 & 🤖 Deep Learning: 🔬 Multi-Omics Analysis (π ≈ 3.14159, λ → ∞)",
        abstract: `
          الذكاء الاصطناعي في علم الوراثة الحديثة.
          深度学习在基因编辑中的高维度优化与多模态表征。
          Formulation: \\sum_{i=1}^{n} \\alpha_i \\cdot \\nabla f(x_i) \\le \\epsilon \\text{ with } \\mathcal{O}(N \\log N) complexity.
          Café, naïve, façade, and résumé — preserved accurately with zero byte corruption.
        `,
        authors: [
          "François-René de Chateaubriand 🇫🇷",
          "Søren Aabye Kierkegaard 🇩🇰",
          "José Ignacio Gómez-Pérez 🇪🇸",
          "李德华 (Li Dehua) 🇨🇳",
          "طارق بن زياد 🇸🇦",
        ],
        year: 2024,
        publicationDate: "2024-06-15",
        venue: "国際会議 2024 🌸 (Tokyo, Japan)",
        url: "https://arxiv.org/abs/unicode.2024.001",
        pdfUrl: "https://arxiv.org/pdf/unicode.2024.001.pdf",
        source: "arxiv",
        citationCount: 42,
        readStatus: "reading",
      };

      savePaper(complexUnicodePaper);

      expect(isPaperSaved(complexUnicodePaper.id)).toBe(true);

      const savedIds = getSavedPaperIds([complexUnicodePaper.id, "arxiv:nonexistent"]);
      expect(savedIds.has(complexUnicodePaper.id)).toBe(true);
      expect(savedIds.has("arxiv:nonexistent")).toBe(false);

      const library = getLibraryPapers();
      expect(library).toHaveLength(1);
      const retrieved = library[0];

      expect(retrieved.id).toBe(complexUnicodePaper.id);
      expect(retrieved.title).toBe(complexUnicodePaper.title);
      expect(retrieved.venue).toBe(complexUnicodePaper.venue);
      expect(retrieved.authors).toEqual(complexUnicodePaper.authors);
      expect(retrieved.abstract).toContain("الذكاء الاصطناعي");
      expect(retrieved.abstract).toContain("深度学习在基因编辑中的高维度优化");
      expect(retrieved.abstract).toContain("\\sum_{i=1}^{n}");
    });

    it("should handle large text payloads (50k+ chars) in chat messages and paper summaries without truncation", () => {
      const paperId = "arxiv:payload.test";
      savePaper({
        id: paperId,
        title: "Test Large Payload Paper",
        abstract: "Abstract placeholder",
        authors: ["Author A"],
        year: 2024,
        url: "https://arxiv.org/abs/test",
        source: "arxiv",
      });

      // 50,000 character string of Markdown and KaTeX formulas
      const hugeFormulaBlock = "### Proof Section\n$$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$\n".repeat(800);
      expect(hugeFormulaBlock.length).toBeGreaterThan(50000);

      savePaperSummary({
        paperId,
        title: "Large Summary",
        summary: hugeFormulaBlock,
        model: "gemini-3.5-flash-lite",
        sourceType: "full_pdf",
        charCount: hugeFormulaBlock.length,
      });

      const summary = getPaperSummary(paperId);
      expect(summary).not.toBeNull();
      expect(summary?.summary.length).toBe(hugeFormulaBlock.length);
      expect(summary?.summary).toBe(hugeFormulaBlock);

      // Save huge Arabic/Multilingual chat message
      const hugeChatMessage = "مرحبا بكم في نظام الذكاء الاصطناعي المتطور! 🤖\n".repeat(1200);
      saveChatMessage({
        paperId,
        role: "assistant",
        content: hugeChatMessage,
      });

      const messages = getChatMessages(paperId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content.length).toBe(hugeChatMessage.length);
      expect(messages[0].content).toBe(hugeChatMessage);
    });
  });

  describe("SQL Injection Strings, Wildcards & Boundary Resilience", () => {
    it("should treat SQL wildcards (% and _) in paper IDs as literal characters rather than patterns", () => {
      const wildcardPaper: Paper = {
        id: "arxiv:2301.%_special",
        title: "Paper with Wildcards in Primary Key",
        abstract: "Testing LIKE pattern sanitization.",
        authors: ["Wildcard Researcher"],
        year: 2023,
        url: "https://arxiv.org/abs/wildcard",
        source: "arxiv",
      };

      const regularPaper: Paper = {
        id: "arxiv:2301.10099",
        title: "Regular Paper that would match %_ prefix if unescaped",
        abstract: "Regular paper abstract.",
        authors: ["Regular Author"],
        year: 2023,
        url: "https://arxiv.org/abs/regular",
        source: "arxiv",
      };

      savePaper(wildcardPaper);
      savePaper(regularPaper);

      // Literal query for "%" must return false
      expect(isPaperSaved("%")).toBe(false);
      expect(isPaperSaved("_")).toBe(false);

      // getSavedPaperIds with "%" query must return empty Set
      const wildcardMatches = getSavedPaperIds(["%"]);
      expect(wildcardMatches.size).toBe(0);

      // getSavedPaperIds with the exact wildcard ID should return ONLY that paper
      const specificMatches = getSavedPaperIds(["arxiv:2301.%_special"]);
      expect(specificMatches.size).toBe(1);
      expect(specificMatches.has("arxiv:2301.%_special")).toBe(true);
      expect(specificMatches.has("arxiv:2301.10099")).toBe(false);
    });

    it("should prevent SQL injection payloads in IDs, titles, and author names from modifying or dropping schema", () => {
      const injectionPaper: Paper = {
        id: "hack'; DROP TABLE papers; --",
        title: "Malicious'); DELETE FROM paper_authors; --",
        abstract: "' OR '1'='1' UNION SELECT username, password FROM users --",
        authors: ["Evil'); DROP TABLE chat_messages; --", "Assistant'); --"],
        year: 2024,
        url: "https://arxiv.org/abs/malicious",
        source: "arxiv",
      };

      // Ensure savePaper safely inserts using prepared parameterized statements
      savePaper(injectionPaper);

      expect(isPaperSaved(injectionPaper.id)).toBe(true);

      // Verify papers and relational paper_authors tables are completely intact
      const paperCount = memoryDb.prepare("SELECT COUNT(*) as count FROM papers").get() as { count: number };
      expect(paperCount.count).toBe(1);

      const authorsCount = memoryDb.prepare("SELECT COUNT(*) as count FROM paper_authors").get() as { count: number };
      expect(authorsCount.count).toBe(2);

      // Delete the injected paper using deletePaper and ensure parameterized DELETE works
      deletePaper(injectionPaper.id);
      expect(isPaperSaved(injectionPaper.id)).toBe(false);

      const countAfter = memoryDb.prepare("SELECT COUNT(*) as count FROM papers").get() as { count: number };
      expect(countAfter.count).toBe(0);
    });

    it("should handle empty array in savePapersBatch gracefully without SQL syntax errors", () => {
      const count = savePapersBatch([]);
      expect(count).toBe(0);
    });
  });

  describe("Pagination Boundaries & Search API Clamping", () => {
    it("searchArxiv should clamp negative page numbers to start=0 and handle extreme limits", async () => {
      let requestedUrl = "";
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        requestedUrl = input.toString();
        const emptyFeedXml = `<?xml version="1.0" encoding="UTF-8"?>
          <feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
            <opensearch:totalResults>0</opensearch:totalResults>
          </feed>`;
        return new Response(emptyFeedXml, { status: 200 });
      });

      // Negative page boundary: page=-5, limit=15
      // Expected: Math.max(0, (-5 - 1) * 15) = 0 -> start=0
      await searchArxiv({
        query: "deep learning",
        page: -5,
        limit: 15,
      });

      const url = new URL(requestedUrl);
      expect(url.searchParams.get("start")).toBe("0");
      expect(url.searchParams.get("max_results")).toBe("15");

      // Boundary page=0: (0 - 1) * 10 = -10 -> Math.max(0, -10) = 0
      await searchArxiv({
        query: "transformers",
        page: 0,
        limit: 10,
      });

      const url2 = new URL(requestedUrl);
      expect(url2.searchParams.get("start")).toBe("0");

      // Empty query string should return 0 results without invoking fetch
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockClear();

      const emptyRes = await searchArxiv({ query: "   " });
      expect(emptyRes.total).toBe(0);
      expect(emptyRes.results).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("GET /api/search should clamp limit between 1 and 50 and sanitize negative offsets", async () => {
      const searchPapersSpy = vi.spyOn(searchModule, "searchPapers").mockImplementation(async (params) => {
        return {
          query: params.query,
          total: 0,
          page: params.page || 1,
          limit: params.limit || 10,
          results: [],
          providerUsed: params.provider || "all",
        };
      });

      // 1. Limit = 0 should be clamped to 1
      const reqZero = new NextRequest("http://localhost:3000/api/search?q=test&limit=0");
      const resZero = await searchGet(reqZero);
      const jsonZero = await resZero.json();
      expect(resZero.status).toBe(200);
      expect(searchPapersSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
      expect(jsonZero.limit).toBe(1);

      // 2. Limit = -50 should be clamped to 1
      const reqNeg = new NextRequest("http://localhost:3000/api/search?q=test&limit=-50");
      const resNeg = await searchGet(reqNeg);
      const jsonNeg = await resNeg.json();
      expect(resNeg.status).toBe(200);
      expect(searchPapersSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 1 }));
      expect(jsonNeg.limit).toBe(1);

      // 3. Limit = 9999 should be clamped to 50
      const reqHuge = new NextRequest("http://localhost:3000/api/search?q=test&limit=9999");
      const resHuge = await searchGet(reqHuge);
      const jsonHuge = await resHuge.json();
      expect(resHuge.status).toBe(200);
      expect(searchPapersSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
      expect(jsonHuge.limit).toBe(50);

      // 4. Whitespace query should return immediately with success: true and total: 0 without invoking searchPapers
      searchPapersSpy.mockClear();
      const reqBlank = new NextRequest("http://localhost:3000/api/search?q=%20%20%20");
      const resBlank = await searchGet(reqBlank);
      const jsonBlank = await resBlank.json();
      expect(resBlank.status).toBe(200);
      expect(jsonBlank.success).toBe(true);
      expect(jsonBlank.total).toBe(0);
      expect(jsonBlank.results).toEqual([]);
      expect(searchPapersSpy).not.toHaveBeenCalled();
    });
  });

  describe("PDF Extractor Fault Hunting & Corrupt Buffer Handling", () => {
    it("extractMetadataFromPdf should properly bubble errors when parser rejects corrupt binary buffers", async () => {
      mockGetText.mockRejectedValue(new Error("Corrupt PDF: XRef table parsing failed"));

      const corruptBuffer = Buffer.from("CORRUPT_NON_PDF_BINARY_STREAM");

      await expect(extractMetadataFromPdf(corruptBuffer, "faulty.pdf")).rejects.toThrow(
        "Corrupt PDF: XRef table parsing failed"
      );

      // Ensure destroy() was invoked in finally block to prevent memory leaks
      expect(mockDestroy).toHaveBeenCalled();
    });

    it("extractMetadataFromPdf should fall back to filename and default placeholders when PDF contains 0 extractable text lines", async () => {
      // Image-only scanned document without OCR
      mockGetText.mockResolvedValue({ text: "" });
      mockGetInfo.mockResolvedValue({ info: {}, total: 3 });

      const imagePdfBuffer = Buffer.from("%PDF-1.4 scanned document with empty text layer");
      const result = await extractMetadataFromPdf(imagePdfBuffer, "scanned_biology_paper.pdf");

      expect(result.title).toBe("scanned biology paper");
      expect(result.authors).toEqual(["Unknown Author"]);
      expect(result.abstract).toBe("Abstract could not be automatically extracted from this document.");
      expect(result.pageCount).toBe(3);
    });

    it("POST /api/upload should catch corrupt PDF extraction failure and return HTTP 500 error response", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockGetText.mockRejectedValue(new Error("PDF parsing fatal: corrupted EOF marker"));

      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs.promises, "writeFile").mockResolvedValue(undefined);

      const corruptFile = {
        name: "corrupted_archive.pdf",
        type: "application/pdf",
        size: 512,
        arrayBuffer: async () => new ArrayBuffer(512),
      };

      const mockFormData = {
        get: (key: string) => (key === "file" ? corruptFile : null),
      };

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST" });
      vi.spyOn(req, "formData").mockResolvedValue(mockFormData as any);

      const response = await uploadPost(req);
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toContain("PDF parsing fatal: corrupted EOF marker");

      consoleErrorSpy.mockRestore();
    });
  });
});

