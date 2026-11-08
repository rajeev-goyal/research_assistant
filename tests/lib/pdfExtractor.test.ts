import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractMetadataFromPdf } from "@/lib/pdfExtractor";

const mockGetText = vi.fn();
const mockGetInfo = vi.fn();
const mockDestroy = vi.fn();

// Mock pdf-parse class constructor
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

describe("PDF Text Extractor & Heuristics - extractMetadataFromPdf", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDestroy.mockResolvedValue(undefined);
  });

  it("should extract title, authors, year, and abstract from standard academic paper text", async () => {
    const mockRawText = `
arXiv:2401.99999v1 [cs.LG] 15 Jan 2024
Scalable Latent Diffusion Models for High-Resolution Synthesis
Robin Rombach*, Andreas Blattmann*, Patrick Esser
University of Munich, Runway
Abstract
We propose latent diffusion models that operate in the latent space of powerful pretrained autoencoders, achieving state-of-the-art synthesis quality while greatly reducing computational requirements.
1. Introduction
Image generation has witnessed rapid progress...
`;

    mockGetText.mockResolvedValue({ text: mockRawText });
    mockGetInfo.mockResolvedValue({
      info: {
        Title: "Scalable Latent Diffusion Models for High-Resolution Synthesis",
        CreationDate: "D:20240115120000",
      },
      total: 14,
    });

    const buffer = Buffer.from("fake-pdf-binary");
    const result = await extractMetadataFromPdf(buffer, "latent-diffusion.pdf");

    expect(result.title).toBe("Scalable Latent Diffusion Models for High-Resolution Synthesis");
    expect(result.authors).toContain("Robin Rombach");
    expect(result.authors).toContain("Andreas Blattmann");
    expect(result.authors).toContain("Patrick Esser");
    expect(result.year).toBe(2024);
    expect(result.abstract).toContain("We propose latent diffusion models that operate in the latent space");
    expect(result.abstract).not.toContain("1. Introduction");
    expect(result.pageCount).toBe(14);
    expect(result.venue).toBe("Uploaded PDF");
  });

  it("should fallback to sanitized filename when PDF title is generic or missing", async () => {
    const mockRawText = `
Abstract
This paper has no title header or authors.
1. Introduction
`;

    mockGetText.mockResolvedValue({ text: mockRawText });
    mockGetInfo.mockResolvedValue({
      info: { Title: "untitled.pdf" },
      total: 2,
    });

    const buffer = Buffer.from("fake-pdf-binary");
    const result = await extractMetadataFromPdf(buffer, "neural_network_optimization.pdf");

    expect(result.title).toBe("neural network optimization");
    expect(result.authors).toEqual(["Unknown Author"]);
  });

  it("should fallback when abstract is not detected in the document", async () => {
    const mockRawText = `
Linear Algebra Lecture Notes
Gilbert Strang
MIT Department of Mathematics
Chapter 1: Vectors and Linear Combinations
`;

    mockGetText.mockResolvedValue({ text: mockRawText });
    mockGetInfo.mockResolvedValue({
      info: { Title: "Linear Algebra Lecture Notes", CreationDate: "D:20210501" },
      total: 50,
    });

    const buffer = Buffer.from("fake-pdf-binary");
    const result = await extractMetadataFromPdf(buffer, "linear_algebra.pdf");

    expect(result.abstract).toBe("Abstract could not be automatically extracted from this document.");
    expect(result.year).toBe(2021);
  });
});
