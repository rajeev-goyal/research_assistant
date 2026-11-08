import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getGeminiApiKey, buildAcademicSummaryPrompt } from "@/lib/ai/geminiClient";
import { resolvePaperContent, findArxivPreprintByTitle } from "@/lib/paperContentResolver";
import { Paper } from "@/types/paper";
import fs from "fs";

const mockGetText = vi.fn();
const mockGetInfo = vi.fn();
const mockDestroy = vi.fn();

vi.mock("pdf-parse", () => {
  return {
    PDFParse: class {
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

describe("AI Services & Paper Content Resolver", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    mockDestroy.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getGeminiApiKey resolution priority", () => {
    it("should prioritize client-provided API key if valid", () => {
      process.env.GEMINI_API_KEY = "env-secret-api-key-123456";
      const key = getGeminiApiKey("client-custom-key-987654321");
      expect(key).toBe("client-custom-key-987654321");
    });

    it("should fallback to process.env.GEMINI_API_KEY if client key not provided", () => {
      process.env.GEMINI_API_KEY = "env-secret-api-key-123456";
      const key = getGeminiApiKey("");
      expect(key).toBe("env-secret-api-key-123456");
    });

    it("should return null if no key is found in client or environment", () => {
      delete process.env.GEMINI_API_KEY;
      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const key = getGeminiApiKey(undefined);
      expect(key).toBeNull();
    });
  });

  describe("buildAcademicSummaryPrompt", () => {
    it("should assemble a structured prompt with all 5 academic sections", () => {
      const prompt = buildAcademicSummaryPrompt({
        title: "Deep Residual Learning for Image Recognition",
        contentText: "Deeper neural networks are more difficult to train. We present a residual learning framework.",
        sourceType: "full_pdf",
        authors: ["Kaiming He", "Xiangyu Zhang"],
        year: 2016,
      });

      expect(prompt).toContain("Deep Residual Learning for Image Recognition");
      expect(prompt).toContain("### 1. Executive Summary & Core Contribution");
      expect(prompt).toContain("### 2. Problem Formulation & Research Motivation");
      expect(prompt).toContain("### 3. Methodology & Technical Approach");
      expect(prompt).toContain("### 4. Key Findings & Empirical Results");
      expect(prompt).toContain("### 5. Critical Limitations & Open Challenges");
      expect(prompt).toContain("extracted full-text manuscript");
    });

    it("should reflect official abstract and published metadata when sourceType is abstract", () => {
      const prompt = buildAcademicSummaryPrompt({
        title: "Quantum Supremacy",
        contentText: "The promise of quantum computers is that certain computational tasks might be executed exponentially faster.",
        sourceType: "abstract",
      });

      expect(prompt).toContain("official abstract and published metadata");
    });
  });

  describe("findArxivPreprintByTitle", () => {
    it("should return null immediately for short or empty title queries", async () => {
      const res = await findArxivPreprintByTitle("AI");
      expect(res).toBeNull();
    });

    it("should find and parse matching arXiv preprint PDF URL", async () => {
      const mockXml = `<?xml version="1.0" encoding="utf-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <id>http://arxiv.org/abs/2301.00042</id>
            <title>Scaling Laws for Neural Language Models</title>
          </entry>
        </feed>`;

      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(mockXml, { status: 200 }));

      const pdfUrl = await findArxivPreprintByTitle("Scaling Laws for Neural Language Models");
      expect(pdfUrl).toBe("https://arxiv.org/pdf/2301.00042.pdf");
    });
  });

  describe("resolvePaperContent", () => {
    it("should resolve content from local uploaded PDF file when filePath exists", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("dummy-pdf-content"));

      const longManuscript = "Full extracted paper manuscript text discussing model architecture, transformer blocks, and benchmark evaluations. ".repeat(6);
      mockGetText.mockResolvedValue({ text: longManuscript });
      mockGetInfo.mockResolvedValue({ numPages: 8 });

      const paper: Paper = {
        id: "upload:12345",
        title: "Uploaded Local Paper",
        abstract: "Local abstract.",
        authors: ["Author A"],
        year: 2024,
        url: "/api/uploads/12345.pdf",
        source: "upload",
        filePath: "/data/uploads/12345.pdf",
      };

      const resolved = await resolvePaperContent(paper);
      expect(resolved.paperId).toBe("upload:12345");
      expect(resolved.sourceType).toBe("full_pdf");
      expect(resolved.contentText).toContain("Full extracted paper manuscript text");
      expect(resolved.pageCount).toBe(8);
    });

    it("should fallback to abstract and metadata when no PDF is accessible", async () => {
      const paper: Paper = {
        id: "openalex:W9999",
        title: "Theoretical Boundaries of Convex Optimization",
        abstract: "We establish tight convergence bounds for non-smooth convex objectives.",
        authors: ["Yurii Nesterov"],
        year: 2020,
        venue: "Mathematical Programming",
        url: "https://doi.org/10.1000/test",
        source: "openalex" as any,
      };

      const resolved = await resolvePaperContent(paper);
      expect(resolved.paperId).toBe("openalex:W9999");
      expect(resolved.sourceType).toBe("abstract");
      expect(resolved.contentText).toContain("We establish tight convergence bounds");
      expect(resolved.contentText).toContain("Title: Theoretical Boundaries of Convex Optimization");
    });
  });
});
