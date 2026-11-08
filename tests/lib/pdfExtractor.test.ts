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

  it("should filter messy conference header noise, copyright notices, and institutional email blocks", async () => {
    const mockRawText = `
Proceedings of the 40th International Conference on Machine Learning, Honolulu, Hawaii, USA. PMLR 202, 2023.
Copyright 2023 by the author(s). All rights reserved.
Vol. 45, No. 3, March 2023
DOI: 10.1145/3544548.3581388
Page 1 of 15
Linear Transformers with Fast Autoregressive Attention Mechanisms
Angelos Katharopoulos*1, Apoorv Vyas*1, Nikolaos Pappas2, François Fleuret1,3
1Idiap Research Institute, Switzerland 2University of Washington, Seattle, USA
{angelos.katharopoulos, apoorv.vyas}@idiap.ch, francois.fleuret@unige.ch
Abstract
Transfor-\nmers achieve state-of-the-art results in sequence modeling but exhibit quadratic computa-\ntional complexity with respect to sequence length.
Index Terms—Attention, Transformer, Linear complexity
1. Introduction
`;

    mockGetText.mockResolvedValue({ text: mockRawText });
    mockGetInfo.mockResolvedValue({
      info: {
        Title: "Linear Transformers with Fast Autoregressive Attention Mechanisms",
        CreationDate: "D:20230615100000",
      },
      total: 15,
    });

    const buffer = Buffer.from("fake-pdf-binary");
    const result = await extractMetadataFromPdf(buffer, "linear-transformers.pdf");

    // Title should be correctly extracted, omitting the conference and DOI noise
    expect(result.title).toBe("Linear Transformers with Fast Autoregressive Attention Mechanisms");
    // Authors should be cleaned of footnotes, asterisks, and affiliations
    expect(result.authors).toContain("Angelos Katharopoulos");
    expect(result.authors).toContain("Apoorv Vyas");
    expect(result.authors).toContain("Nikolaos Pappas");
    expect(result.authors).toContain("François Fleuret");
    // Emails and affiliations should be completely excluded from authors
    expect(result.authors.some((a) => a.includes("@") || a.includes("Idiap") || a.includes("Washington"))).toBe(false);
    // Hyphenated line breaks in abstract should be stitched together cleanly
    expect(result.abstract).toContain("Transformers achieve state-of-the-art results");
    expect(result.abstract).toContain("computational complexity");
    // Abstract should stop before Index Terms
    expect(result.abstract).not.toContain("Index Terms");
    expect(result.year).toBe(2023);
  });

  it("should handle spaced OCR character artifacts in abstract heading (A B S T R A C T)", async () => {
    const mockRawText = `
Deep Learning for Scientific Discovery
Yann LeCun, Yoshua Bengio
A B S T R A C T
Artificial intelligence systems are accelerating empirical scientific discoveries across chemistry, physics, and genomics by modeling complex molecular interactions.
I. INTRODUCTION
Scientific exploration requires...
`;

    mockGetText.mockResolvedValue({ text: mockRawText });
    mockGetInfo.mockResolvedValue({
      info: {
        Title: "Deep Learning for Scientific Discovery",
        CreationDate: "D:20220810140000",
      },
      total: 8,
    });

    const buffer = Buffer.from("fake-pdf-binary");
    const result = await extractMetadataFromPdf(buffer, "science-discovery.pdf");

    expect(result.title).toBe("Deep Learning for Scientific Discovery");
    expect(result.authors).toContain("Yann LeCun");
    expect(result.authors).toContain("Yoshua Bengio");
    expect(result.abstract).toContain("Artificial intelligence systems are accelerating empirical scientific discoveries");
    expect(result.abstract).not.toContain("I. INTRODUCTION");
  });

  it("should fallback to clean author in PDF metadata dictionary when text lines lack authors", async () => {
    const mockRawText = `
A Mathematical Theory of Communication
Abstract
The fundamental problem of communication is that of reproducing at one point either exactly or approximately a message selected at another point.
1. Introduction
`;

    mockGetText.mockResolvedValue({ text: mockRawText });
    mockGetInfo.mockResolvedValue({
      info: {
        Title: "A Mathematical Theory of Communication",
        Author: "Claude Shannon and Warren Weaver",
        CreationDate: "D:19480701120000",
      },
      total: 55,
    });

    const buffer = Buffer.from("fake-pdf-binary");
    const result = await extractMetadataFromPdf(buffer, "shannon1948.pdf");

    expect(result.title).toBe("A Mathematical Theory of Communication");
    expect(result.authors).toEqual(["Claude Shannon", "Warren Weaver"]);
    // Application Bug / Heuristic Limitation in src/lib/pdfExtractor.ts:
    // Lines 212 and 222 enforce `parsed >= 1950 && parsed <= year + 1`.
    // Seminal historical papers published prior to 1950 (such as Claude Shannon's 1948 paper)
    // fail this lower bound check and erroneously fall back to the current year (2026).
    expect(result.year).toBe(1948);
  });

  it("should reject software/generic author in PDF info dictionary and fall back to Unknown Author", async () => {
    const mockRawText = `
Unformatted Document Without Explicit Author
Abstract
This document has an unformatted body text without metadata authors.
1. Introduction
`;

    mockGetText.mockResolvedValue({ text: mockRawText });
    mockGetInfo.mockResolvedValue({
      info: {
        Title: "Unformatted Document",
        Author: "Microsoft Word - Document1",
      },
      total: 3,
    });

    const buffer = Buffer.from("fake-pdf-binary");
    const result = await extractMetadataFromPdf(buffer, "doc1.pdf");

    expect(result.authors).toEqual(["Unknown Author"]);
  });

  it("should detect publication year from raw text copyright notice when CreationDate is absent", async () => {
    const mockRawText = `
Robust Policy Optimization for Robotic Control
Peter Stone, George Konidaris
© 2022 IEEE. Personal use of this material is permitted.
Abstract
We investigate robust policy gradients under sensor noise.
1. Introduction
`;

    mockGetText.mockResolvedValue({ text: mockRawText });
    mockGetInfo.mockResolvedValue({
      info: { Title: "Robust Policy Optimization for Robotic Control" },
      total: 6,
    });

    const buffer = Buffer.from("fake-pdf-binary");
    const result = await extractMetadataFromPdf(buffer, "policy_opt.pdf");

    expect(result.year).toBe(2022);
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
