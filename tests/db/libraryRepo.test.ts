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
  updatePaperStatus,
  getLibraryPapers,
  getPaperSummary,
  savePaperSummary,
  deletePaperSummary,
  getChatMessages,
  saveChatMessage,
  clearChatMessages,
} from "@/lib/db/libraryRepo";
import { Paper } from "@/types/paper";

describe("Database Repository - libraryRepo", () => {
  let memoryDb: Database.Database;

  beforeEach(() => {
    // Create an isolated in-memory SQLite database for each test
    memoryDb = new Database(":memory:");
    memoryDb.pragma("foreign_keys = ON");
    memoryDb.exec(SCHEMA_SQL);

    // Mock getDatabase to return our in-memory instance
    vi.spyOn(dbModule, "getDatabase").mockReturnValue(memoryDb);
  });

  afterEach(() => {
    memoryDb.close();
    vi.restoreAllMocks();
  });

  const samplePaper: Paper = {
    id: "arxiv:2310.00001",
    title: "Advancements in Neural Retrieval Architectures",
    abstract: "This paper introduces a novel dual-encoder mechanism for literature search.",
    authors: ["Alice Johnson", "Bob Smith"],
    year: 2024,
    publicationDate: "2024-01-15",
    venue: "NeurIPS 2024",
    url: "https://arxiv.org/abs/2310.00001",
    pdfUrl: "https://arxiv.org/pdf/2310.00001.pdf",
    source: "arxiv",
    citationCount: 12,
    readStatus: "unread",
  };

  describe("Paper CRUD Operations", () => {
    it("should save a single paper and verify it is saved", () => {
      expect(isPaperSaved(samplePaper.id)).toBe(false);

      savePaper(samplePaper);

      expect(isPaperSaved(samplePaper.id)).toBe(true);

      const savedIds = getSavedPaperIds([samplePaper.id, "arxiv:nonexistent"]);
      expect(savedIds.has(samplePaper.id)).toBe(true);
      expect(savedIds.has("arxiv:nonexistent")).toBe(false);
    });

    it("should retrieve library papers with correct author ordering and metadata", () => {
      savePaper(samplePaper);

      const library = getLibraryPapers();
      expect(library).toHaveLength(1);

      const paper = library[0];
      expect(paper.id).toBe(samplePaper.id);
      expect(paper.title).toBe(samplePaper.title);
      expect(paper.authors).toEqual(["Alice Johnson", "Bob Smith"]);
      expect(paper.year).toBe(2024);
      expect(paper.isSaved).toBe(true);
      expect(paper.readStatus).toBe("unread");
      expect(paper.notesCount).toBe(0);
    });

    it("should update paper details on conflict when re-saving with new data", () => {
      savePaper(samplePaper);

      const updatedPaper: Paper = {
        ...samplePaper,
        title: "Updated Title: Advancements in Neural Retrieval",
        authors: ["Alice Johnson", "Bob Smith", "Charlie Brown"],
        citationCount: 42,
      };

      savePaper(updatedPaper);

      const library = getLibraryPapers();
      expect(library).toHaveLength(1);
      expect(library[0].title).toBe("Updated Title: Advancements in Neural Retrieval");
      expect(library[0].authors).toEqual(["Alice Johnson", "Bob Smith", "Charlie Brown"]);
    });

    it("should delete a paper and cascade delete its authors", () => {
      savePaper(samplePaper);
      expect(isPaperSaved(samplePaper.id)).toBe(true);

      deletePaper(samplePaper.id);

      expect(isPaperSaved(samplePaper.id)).toBe(false);
      expect(getLibraryPapers()).toHaveLength(0);

      // Verify cascading deletion of authors
      const authors = memoryDb
        .prepare("SELECT * FROM paper_authors WHERE paper_id = ?")
        .all(samplePaper.id);
      expect(authors).toHaveLength(0);
    });

    it("should update read status of an existing paper", () => {
      savePaper(samplePaper);

      updatePaperStatus(samplePaper.id, "reading");
      let library = getLibraryPapers();
      expect(library[0].readStatus).toBe("reading");

      updatePaperStatus(samplePaper.id, "completed");
      library = getLibraryPapers();
      expect(library[0].readStatus).toBe("completed");
    });
  });

  describe("Batch Operations", () => {
    it("should save multiple papers in an atomic batch", () => {
      const papers: Paper[] = [
        samplePaper,
        {
          id: "arxiv:2310.00002",
          title: "Benchmarking Foundation Models",
          abstract: "A standardized benchmark for scientific reasoning.",
          authors: ["Dana Scully", "Fox Mulder"],
          year: 2023,
          url: "https://arxiv.org/abs/2310.00002",
          source: "arxiv",
        },
        {
          id: "arxiv:2310.00003",
          title: "Quantum State Tomography via Deep Learning",
          abstract: "Accelerated state tomography using graph neural networks.",
          authors: ["Walter Bishop"],
          year: 2024,
          url: "https://arxiv.org/abs/2310.00003",
          source: "arxiv",
        },
      ];

      const count = savePapersBatch(papers);
      expect(count).toBe(3);

      const library = getLibraryPapers();
      expect(library).toHaveLength(3);

      const ids = getSavedPaperIds(papers.map((p) => p.id));
      expect(ids.size).toBe(3);
      papers.forEach((p) => expect(ids.has(p.id)).toBe(true));
    });

    it("should return 0 when saving an empty batch of papers", () => {
      const count = savePapersBatch([]);
      expect(count).toBe(0);
      expect(getLibraryPapers()).toHaveLength(0);
    });

    it("should return empty Set when querying saved IDs with an empty array", () => {
      const ids = getSavedPaperIds([]);
      expect(ids.size).toBe(0);
    });
  });

  describe("Paper Summaries Caching", () => {
    it("should return null when summary does not exist", () => {
      const summary = getPaperSummary("arxiv:nonexistent");
      expect(summary).toBeNull();
    });

    it("should save, retrieve, and update AI paper summary", () => {
      savePaper(samplePaper);

      savePaperSummary({
        paperId: samplePaper.id,
        title: samplePaper.title,
        summary: "### 1. Executive Summary\nBreakthrough retrieval mechanism.",
        model: "gemini-3.5-flash-lite",
        sourceType: "full_pdf",
      });

      const cached = getPaperSummary(samplePaper.id);
      expect(cached).not.toBeNull();
      expect(cached?.paperId).toBe(samplePaper.id);
      expect(cached?.summary).toContain("Breakthrough retrieval mechanism");
      expect(cached?.model).toBe("gemini-3.5-flash-lite");
      expect(cached?.sourceType).toBe("full_pdf");

      // Overwrite / update summary
      savePaperSummary({
        paperId: samplePaper.id,
        summary: "Updated executive summary with deeper insights.",
      });

      const updated = getPaperSummary(samplePaper.id);
      expect(updated?.summary).toBe("Updated executive summary with deeper insights.");
    });

    it("should delete paper summary", () => {
      savePaper(samplePaper);
      savePaperSummary({
        paperId: samplePaper.id,
        summary: "Test summary",
      });
      expect(getPaperSummary(samplePaper.id)).not.toBeNull();

      deletePaperSummary(samplePaper.id);
      expect(getPaperSummary(samplePaper.id)).toBeNull();
    });
  });

  describe("Chat Messages Persistence", () => {
    it("should return empty array when no chat messages exist for paper", () => {
      const messages = getChatMessages("arxiv:no-messages");
      expect(messages).toEqual([]);
    });

    it("should save and retrieve multi-turn chat messages in chronological order", () => {
      savePaper(samplePaper);

      const msg1 = saveChatMessage({
        paperId: samplePaper.id,
        role: "user",
        content: "What datasets are used in this paper?",
      });
      expect(msg1.id).toBeGreaterThan(0);
      expect(msg1.role).toBe("user");

      const msg2 = saveChatMessage({
        paperId: samplePaper.id,
        role: "assistant",
        content: "The authors evaluate on MS MARCO and BEIR benchmark datasets.",
      });
      expect(msg2.id).toBeGreaterThan(msg1.id);

      const history = getChatMessages(samplePaper.id);
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe("What datasets are used in this paper?");
      expect(history[1].content).toContain("MS MARCO");
    });

    it("should clear chat messages for a specific paper", () => {
      savePaper(samplePaper);
      saveChatMessage({
        paperId: samplePaper.id,
        role: "user",
        content: "Question 1",
      });
      expect(getChatMessages(samplePaper.id)).toHaveLength(1);

      clearChatMessages(samplePaper.id);
      expect(getChatMessages(samplePaper.id)).toHaveLength(0);
    });
  });
});

