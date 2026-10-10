# AI Research Assistant — Executive Plan (Concise)

> **Quick Reference Guide for Researchers & Stakeholders**  
> *For in-depth architectural specifications, schemas, and AI execution steps, see [PLAN_DETAILED.md](file:///Users/rajeevgoyal/Codes/ASE/PLAN_DETAILED.md).*

---

## 1. Project Vision & Goals

The **AI Research Assistant** is a desktop-grade web application designed to streamline the academic research workflow:
1. **Search & Discover**: Query real-time academic literature (via OpenAlex, Crossref, and arXiv public APIs) with metadata like authors, publication year, abstracts, and direct PDF links.
2. **Curate & Persist**: Save papers into a local, offline-first library stored in SQLite that survives page reloads and application restarts, with individual and multi-select batch saving.
3. **Upload PDF Papers**: Upload research papers in PDF format and add them directly to the local database. Automatically extract the paper title, authors, publication year, and abstract so they render alongside searched papers and become searchable/organizable.
4. **Summarize Papers with an LLM (Current Task)**: Select any paper (uploaded PDF or search result) and prompt an LLM to generate a structured, comprehensive summary based on the actual paper content rather than only its title or metadata.
5. **Interactive Q&A & Comprehension**: Conduct conversational question-answering over paper content and clarify unfamiliar concepts.

---

## 2. Recommended Architecture & Tech Stack

```mermaid
graph TD
    User([Researcher / User]) --> Frontend[Next.js React Frontend<br/>Vanilla CSS Design System]
    Frontend --> NextAPI[Next.js API Routes / Server Actions]
    NextAPI --> DB[(Local SQLite Database<br/>library.db)]
    NextAPI --> FileStore[(Local PDF Store<br/>data/uploads/*.pdf)]
    NextAPI --> PublicAPIs[Public Academic APIs<br/>OpenAlex, Crossref, arXiv]
    NextAPI --> PDFEngine[PDF Parser & Text Extractor<br/>pdf-parse v2]
    NextAPI --> LLMService[AI Assistant Service<br/>Gemini / OpenAI API]
```

### Why This Stack?

| Layer | Chosen Technology | Why We Chose It |
|---|---|---|
| **Full-Stack Framework** | **Next.js (App Router, TypeScript)** | Unified codebase for UI and API routes; eliminates CORS issues when calling external paper APIs; fast SSR and instant client updates. |
| **Styling** | **Vanilla CSS + CSS Modules** | Zero dependency bloat, maximum control, adhering to custom design tokens with high-contrast Dark Mode and Bright Mode toggles. |
| **Local Database** | **SQLite (via `better-sqlite3`)** | Zero configuration; embedded directly into a local file (`data/library.db`); instant queries, ACID compliant, persistent across restarts. |
| **PDF Extraction** | **`pdf-parse` v2 + Text Heuristics** | Robust parsing of academic PDF structures; reliably extracts titles, author blocks, publication years, and abstract sections from raw PDF text streams. |
| **Search Providers** | **OpenAlex + Crossref + arXiv API** | OpenAlex & Crossref provide 250M+ indexed works with exact conference/journal matching without rate limits; arXiv provides pre-prints. |
| **AI Engine** | **Google Gemini / OpenAI API** | High token context window suitable for ingesting full paper contents and PDFs; streaming support for real-time summaries. |

---

## 3. High-Level Feature Roadmap

```mermaid
gantt
    title Implementation Phases
    dateFormat  X
    axisFormat  Day %d
    section Phase 1
    Project Scaffolding & Design System (Done) :0, 1
    section Phase 2
    Paper Search Engine & Multi-Select Save (Done) :1, 2
    section Phase 3
    PDF Upload & Automated Metadata Extraction (Done) :2, 3
    section Phase 4
    Summarize Papers with an LLM (Current Focus) :3, 4
    section Phase 5
    Interactive Paper Q&A & Reading Tools :4, 5
    section Phase 6
    Polishing, Testing & Delivery :5, 6
```

### Phase Breakdown

1. **Phase 1: Project Setup & Design System** (Completed)
   - Initialized Next.js with TypeScript and Vanilla CSS Modules.
   - Built custom design system tokens (colors, gradients, glass cards, modern typography, bright/dark mode).

2. **Phase 2: Academic Search Engine & Multi-Select Save** (Completed)
   - Multi-provider search (OpenAlex + Crossref precision + arXiv fallback).
   - High-contrast readability for low laptop brightness + Bright Mode toggle.
   - Individual save and multi-select batch save to local SQLite database with persistence.
   - Abstract ranking (papers with abstracts prioritized; missing abstracts relegated to bottom).

3. **Phase 3: Upload PDF Papers & Metadata Extraction** (Completed)
   - Drag-and-drop and file-picker PDF uploader UI.
   - Server-side PDF text extraction using `pdf-parse` v2 (`PDFParse`).
   - Automated metadata extraction pipeline (Title, Authors, Publication Year, Abstract).
   - Saved binary to `data/uploads/` and recorded metadata into SQLite `papers` table.

4. **Phase 4: Summarize Papers with an LLM** (Completed)
   - **Multi-Source Content Extraction**:
     - Local uploaded PDFs read from `data/uploads/` and parsed with `pdf-parse` v2.
     - Remote PDFs fetched and parsed on-the-fly via `pdfUrl` (e.g. arXiv preprints, open-access papers).
     - Robust fallback to verified abstracts and metadata for closed publications.
   - **Google Gemini Integration**:
     - Real-time streaming generation powered by `gemini-3.5-flash-lite` with 1M token context.
     - Structured academic synthesis: Executive Summary & Contribution, Problem Formulation & Motivation, Methodology & Architecture, Key Empirical Results, Stated Limitations.
     - Zero-config `.env.local` server detection + client-side API Key settings modal.
   - **Persistent SQLite Caching**:
     - Summaries stored in SQLite `paper_summaries` table for instant retrieval and offline viewing.
   - **Interactive UI**:
     - Slide-over drawer with high-contrast Dark & Bright mode support.
     - Grounding badges (Full-text PDF extracted vs Abstract & Metadata), Copy Summary button, and Regenerate button.

5. **Phase 5: Interactive Paper Q&A & Conversational Research Assistant** (Completed)
   - **Grounded Manuscript Q&A**: Real-time conversational question answering powered by `gemini-3.5-flash-lite`, grounded in full PDF text streams or verified abstracts with section & metric citations.
   - **Handout-Aligned Suggested Prompt Chips**: Clickable chips for the 5 assignment questions (*"What problem does this paper address?"*, *"What is the main idea?"*, *"What datasets are used?"*, *"What are the major limitations?"*, *"Compare with baselines"*).
   - **Multi-Turn Context & Streaming**: Streaming NDJSON responses, Markdown formatting, LaTeX complexity notation, and turn-based follow-up questions.
   - **SQLite Persistence**: Stores chat history in `chat_messages` table across browser refreshes and server restarts, with one-click clear chat capability.
   - **Card & Drawer Integration**: Unified AI Paper Workspace drawer with dual tabs (Summary & Synthesis + Ask Questions), plus direct `Ask AI` button on every paper card.

6. **Phase 6: Hardening, Polish & Delivery** (Current Focus)
   - End-to-end integration testing across search results, library persistence, PDF upload, and Gemini AI interactions.
   - Documentation integrity, README completeness, and git tree clean state.

---

## 4. Architecture Diagram: Task 4 (LLM Paper Summarization)

```mermaid
flowchart TD
    subgraph Client ["Client Tier (Browser)"]
        SelectPaper["Select Paper<br/>(Search Results or My Library)"]
        TriggerSummary["Click 'AI Summary' Button"]
        SummaryModal["Summary Drawer<br/>• Streaming Markdown<br/>• Copy / Settings / Cache"]
        SelectPaper --> TriggerSummary --> SummaryModal
    end

    subgraph ServerTier ["Server Tier (Next.js /api/ai/summarize)"]
        PaperResolver{"Resolve Paper Source & Content"}
        LocalPDFParser["Read Stored PDF<br/>(data/uploads/*.pdf via pdf-parse)"]
        RemotePDFParser["Fetch Remote PDF / E-Print<br/>(Extract Text Stream)"]
        AbstractFallback["Comprehensive Abstract & Text Content"]
        PromptAssembler["Academic Prompt Assembler<br/>(System instructions + Paper Body Text)"]
        LLMClient["Gemini Streaming Client<br/>(gemini-3.5-flash-lite via SSE)"]
        CacheDB[("Store in SQLite<br/>data/library.db")]

        SummaryModal -->|POST paperId| PaperResolver
        PaperResolver -->|Uploaded PDF| LocalPDFParser
        PaperResolver -->|Remote PDF URL| RemotePDFParser
        PaperResolver -->|Text / Abstract| AbstractFallback
        LocalPDFParser --> PromptAssembler
        RemotePDFParser --> PromptAssembler
        AbstractFallback --> PromptAssembler
        PromptAssembler --> LLMClient
        LLMClient -->|Stream NDJSON Chunks| SummaryModal
        LLMClient -->|Persist Summary| CacheDB
    end
```

---

## 5. Immediate Next Step

Proceed with **Phase 5: Interactive Paper Q&A & Reading Tools**.
