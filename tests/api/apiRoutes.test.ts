import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "@/lib/db/schema";
import * as dbModule from "@/lib/db/index";
import { GET as searchGet } from "@/app/api/search/route";
import { GET as libraryGet, POST as libraryPost, DELETE as libraryDelete } from "@/app/api/library/route";
import { POST as uploadPost } from "@/app/api/upload/route";
import { GET as aiStatusGet } from "@/app/api/ai/status/route";
import { GET as summarizeGet, POST as summarizePost } from "@/app/api/ai/summarize/route";
import { GET as chatGet, POST as chatPost, DELETE as chatDelete } from "@/app/api/ai/chat/route";
import * as searchModule from "@/lib/search";
import * as libraryRepo from "@/lib/db/libraryRepo";
import * as geminiClient from "@/lib/ai/geminiClient";
import * as pdfExtractorModule from "@/lib/pdfExtractor";

describe("API Route Handlers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/search", () => {
    it("should return empty results when q parameter is omitted or empty", async () => {
      const req = new NextRequest("http://localhost:3000/api/search?q=");
      const res = await searchGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.total).toBe(0);
      expect(json.results).toEqual([]);
    });

    it("should call searchPapers and return aggregated search payload", async () => {
      vi.spyOn(searchModule, "searchPapers").mockResolvedValue({
        query: "quantum computing",
        total: 1,
        page: 1,
        limit: 10,
        providerUsed: "arXiv",
        results: [
          {
            id: "arxiv:2401.0001",
            title: "Quantum Circuit Optimization",
            abstract: "Optimizing Clifford+T circuits.",
            authors: ["Alice"],
            year: 2024,
            url: "https://arxiv.org/abs/2401.0001",
            source: "arxiv",
          },
        ],
      });

      const req = new NextRequest("http://localhost:3000/api/search?q=quantum%20computing&sortBy=date");
      const res = await searchGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.results).toHaveLength(1);
      expect(json.results[0].title).toBe("Quantum Circuit Optimization");
    });

    it("should propagate errors with status 500 when searchPapers throws unexpectedly", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(searchModule, "searchPapers").mockRejectedValue(
        new Error("External search provider network timeout")
      );

      const req = new NextRequest("http://localhost:3000/api/search?q=machine+learning");
      const res = await searchGet(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("External search provider network timeout");

      consoleErrorSpy.mockRestore();
    });
  });

  describe("/api/library Endpoints", () => {
    it("GET should return all library papers", async () => {
      vi.spyOn(libraryRepo, "getLibraryPapers").mockReturnValue([
        {
          id: "arxiv:1",
          title: "Saved Paper 1",
          abstract: "Abstract",
          authors: ["Author"],
          year: 2024,
          url: "http://example.com",
          source: "arxiv",
          readStatus: "unread",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
          tags: [],
          notesCount: 0,
        },
      ]);

      const res = await libraryGet();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);
      expect(json.papers).toHaveLength(1);
    });

    it("POST should validate single paper schema and save", async () => {
      const saveSpy = vi.spyOn(libraryRepo, "savePaper").mockReturnValue(undefined);

      // Valid paper
      const req = new NextRequest("http://localhost:3000/api/library", {
        method: "POST",
        body: JSON.stringify({ id: "arxiv:2", title: "Valid Title", authors: ["Author"] }),
      });
      const res = await libraryPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(saveSpy).toHaveBeenCalledTimes(1);

      // Invalid paper missing title
      const invalidReq = new NextRequest("http://localhost:3000/api/library", {
        method: "POST",
        body: JSON.stringify({ id: "arxiv:missing-title" }),
      });
      const invalidRes = await libraryPost(invalidReq);
      expect(invalidRes.status).toBe(400);
    });

    it("POST should accept and process batch saving of papers and persist relations in database", async () => {
      // In-memory SQLite database setup to verify underlying relational state
      const memoryDb = new Database(":memory:");
      memoryDb.pragma("foreign_keys = ON");
      memoryDb.exec(SCHEMA_SQL);
      vi.spyOn(dbModule, "getDatabase").mockReturnValue(memoryDb);

      const batchPayload = {
        papers: [
          {
            id: "paper:1",
            title: "Scaling Transformer Models",
            authors: ["Alice Developer", "Bob Researcher"],
            abstract: "Scaling analysis of neural transformers.",
            year: 2024,
            url: "https://example.com/paper1",
            source: "arxiv" as const,
          },
          {
            id: "paper:2",
            title: "Sparse Mixture-of-Experts",
            authors: ["Carol Engineer"],
            abstract: "Sparse activations for efficient inference.",
            year: 2023,
            url: "https://example.com/paper2",
            source: "arxiv" as const,
          },
        ],
      };

      const req = new NextRequest("http://localhost:3000/api/library", {
        method: "POST",
        body: JSON.stringify(batchPayload),
      });

      const res = await libraryPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.count).toBe(2);

      // Deep database state verification: verify papers table rows
      const dbPapers = memoryDb
        .prepare("SELECT id, title, abstract, year, source FROM papers ORDER BY id ASC")
        .all() as { id: string; title: string; abstract: string; year: number; source: string }[];

      expect(dbPapers).toHaveLength(2);
      expect(dbPapers[0]).toEqual({
        id: "paper:1",
        title: "Scaling Transformer Models",
        abstract: "Scaling analysis of neural transformers.",
        year: 2024,
        source: "arxiv",
      });
      expect(dbPapers[1]).toEqual({
        id: "paper:2",
        title: "Sparse Mixture-of-Experts",
        abstract: "Sparse activations for efficient inference.",
        year: 2023,
        source: "arxiv",
      });

      // Deep database state verification: verify relational paper_authors table rows & foreign keys
      const dbAuthors = memoryDb
        .prepare("SELECT paper_id, name, author_order FROM paper_authors ORDER BY paper_id ASC, author_order ASC")
        .all() as { paper_id: string; name: string; author_order: number }[];

      expect(dbAuthors).toHaveLength(3);
      expect(dbAuthors[0]).toEqual({ paper_id: "paper:1", name: "Alice Developer", author_order: 0 });
      expect(dbAuthors[1]).toEqual({ paper_id: "paper:1", name: "Bob Researcher", author_order: 1 });
      expect(dbAuthors[2]).toEqual({ paper_id: "paper:2", name: "Carol Engineer", author_order: 0 });

      memoryDb.close();
    });

    it("POST should return 500 when request body contains malformed JSON", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const req = new NextRequest("http://localhost:3000/api/library", {
        method: "POST",
        body: "invalid-raw-json{",
      });

      const res = await libraryPost(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();

      consoleErrorSpy.mockRestore();
    });

    it("DELETE should require paper id and invoke deletePaper", async () => {
      const deleteSpy = vi.spyOn(libraryRepo, "deletePaper").mockReturnValue(undefined);

      // Missing id
      const badReq = new NextRequest("http://localhost:3000/api/library");
      const badRes = await libraryDelete(badReq);
      expect(badRes.status).toBe(400);

      // Valid id
      const validReq = new NextRequest("http://localhost:3000/api/library?id=arxiv:1");
      const validRes = await libraryDelete(validReq);
      const json = await validRes.json();

      expect(validRes.status).toBe(200);
      expect(json.success).toBe(true);
      expect(deleteSpy).toHaveBeenCalledWith("arxiv:1");
    });
  });

  describe("POST /api/upload Validation & Error Handling", () => {
    it("should reject requests without a file attachment", async () => {
      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST" });
      vi.spyOn(req, "formData").mockResolvedValue(new FormData());

      const res = await uploadPost(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("No file uploaded");
    });

    it("should reject non-PDF file formats", async () => {
      const mockFile = {
        name: "document.txt",
        type: "text/plain",
        size: 500,
      };
      const mockFormData = {
        get: (key: string) => (key === "file" ? mockFile : null),
      };

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST" });
      vi.spyOn(req, "formData").mockResolvedValue(mockFormData as any);

      const res = await uploadPost(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("Only PDF documents are supported");
    });

    it("should reject oversized PDF files exceeding 35MB limit", async () => {
      const mockOversizedFile = {
        name: "huge-paper.pdf",
        type: "application/pdf",
        size: 36 * 1024 * 1024,
      };
      const mockFormData = {
        get: (key: string) => (key === "file" ? mockOversizedFile : null),
      };

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST" });
      vi.spyOn(req, "formData").mockResolvedValue(mockFormData as any);

      const res = await uploadPost(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("File exceeds 35MB limit");
    });

    it("should return 500 when request formData parsing throws an error", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST" });
      vi.spyOn(req, "formData").mockRejectedValue(new Error("Malformed multipart form-data payload"));

      const res = await uploadPost(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Malformed multipart form-data payload");

      consoleErrorSpy.mockRestore();
    });

    it("should return 500 when metadata extraction throws an unhandled error", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockPdfFile = {
        name: "corrupted.pdf",
        type: "application/pdf",
        size: 2048,
        arrayBuffer: async () => new ArrayBuffer(2048),
      };
      const mockFormData = {
        get: (key: string) => (key === "file" ? mockPdfFile : null),
      };

      const req = new NextRequest("http://localhost:3000/api/upload", { method: "POST" });
      vi.spyOn(req, "formData").mockResolvedValue(mockFormData as any);
      vi.spyOn(pdfExtractorModule, "extractMetadataFromPdf").mockRejectedValue(
        new Error("Failed to parse corrupted PDF text stream")
      );

      const res = await uploadPost(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.success).toBe(false);
      expect(json.error).toContain("Failed to parse corrupted PDF text stream");

      consoleErrorSpy.mockRestore();
    });
  });

  describe("GET /api/ai/status", () => {
    it("should report configured: true when Gemini API key is valid (>10 chars)", async () => {
      vi.spyOn(geminiClient, "getGeminiApiKey").mockReturnValue("valid-api-key-12345");

      const res = await aiStatusGet();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.configured).toBe(true);
      expect(json.model).toBe("gemini-3.5-flash-lite");
    });

    it("should report configured: false when Gemini API key is completely stripped or missing", async () => {
      vi.spyOn(geminiClient, "getGeminiApiKey").mockReturnValue(null);

      const res = await aiStatusGet();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.configured).toBe(false);
      expect(json.model).toBe("gemini-3.5-flash-lite");
    });

    it("should report configured: false when Gemini API key is too short (<=10 chars)", async () => {
      vi.spyOn(geminiClient, "getGeminiApiKey").mockReturnValue("1234567890");

      const res = await aiStatusGet();
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.configured).toBe(false);
      expect(json.model).toBe("gemini-3.5-flash-lite");
    });
  });

  describe("/api/ai/summarize & /api/ai/chat Validation", () => {
    it("GET /api/ai/summarize requires paperId", async () => {
      const req = new NextRequest("http://localhost:3000/api/ai/summarize");
      const res = await summarizeGet(req);
      expect(res.status).toBe(400);
    });

    it("POST /api/ai/summarize returns 401 when API key is missing", async () => {
      vi.spyOn(geminiClient, "getGeminiApiKey").mockReturnValue(null);
      vi.spyOn(libraryRepo, "getPaperSummary").mockReturnValue(null);

      const req = new NextRequest("http://localhost:3000/api/ai/summarize", {
        method: "POST",
        body: JSON.stringify({
          paper: { id: "p1", title: "Paper Title" },
        }),
      });

      const res = await summarizePost(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toContain("Gemini API key is not configured");
    });

    it("POST /api/ai/chat validates empty message", async () => {
      const req = new NextRequest("http://localhost:3000/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          paper: { id: "p1", title: "Paper Title" },
          message: "   ",
        }),
      });

      const res = await chatPost(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain("Message cannot be empty");
    });

    it("DELETE /api/ai/chat clears messages for specified paper", async () => {
      const clearSpy = vi.spyOn(libraryRepo, "clearChatMessages").mockReturnValue(undefined);

      const req = new NextRequest("http://localhost:3000/api/ai/chat?paperId=p1");
      const res = await chatDelete(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(clearSpy).toHaveBeenCalledWith("p1");
    });
  });
});
