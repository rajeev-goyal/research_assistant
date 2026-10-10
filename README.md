# AI Research Assistant

A modern, desktop-grade web application designed to help researchers search literature across open scientific indexes, organize a persistent local library, upload research papers in PDF format with automated metadata extraction, and synthesize academic knowledge.

---

## Table of Contents
- [Major Features](#major-features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup & Execution Instructions](#setup--execution-instructions)
- [API Reference](#api-reference)
- [License](#license)

---

## Major Features

### 1. Multi-Source Academic Paper Search
- **250M+ Academic Works**: Live querying across **OpenAlex**, **Crossref**, and **arXiv** APIs.
- **Title Precision & Conference Resolution**: Integrated Crossref bibliographic search to resolve newly published ACM/IEEE/conference papers.
- **Missing Abstract Recovery**: Fallback resolution via **Europe PMC** and **PubMed Central** (`PMID`) for publisher-restricted works (Nature Portfolio, Springer, Lancet, Cell, Elsevier).
- **Search Quality Filtering**: Automatically filters out figures, tables, datasets, errata, and non-paper artifacts.
- **Smart Result Ranking**: Prioritizes papers with complete, informative abstracts at the top; relegates abstract-less works to the bottom.

### 2. Persistent Local Library (SQLite)
- **Zero-Config Database**: Embedded SQLite database (`data/library.db` via `better-sqlite3` with Write-Ahead Logging `WAL` mode).
- **Total Persistence**: Saved papers persist across browser refreshes, tabs, and server restarts.
- **Individual & Multi-Select Batch Saving**:
  - Save papers individually via the "Save Paper" button.
  - Multi-select papers using card checkboxes with "Select All on Page".
  - One-click batch save from the toolbar or the floating bottom action bar.

### 3. PDF Paper Upload & Automated Metadata Extraction
- **Drag-and-Drop Uploader**: Upload any research paper in PDF format directly from your device.
- **Automated Metadata Extraction Pipeline**:
  - Automatically parses the PDF text stream using `pdf-parse` v2.
  - Extracts the **Paper Title**, **Authors**, **Publication Year**, and **Abstract**.
- **Unified Rendering**: Uploaded papers are stored in `data/uploads/` and render seamlessly in the library alongside searched papers with an "Uploaded PDF" badge and a direct "Read PDF" viewer.

### 4. Summarize Papers with an LLM (Google Gemini Integration)
- **Grounded in Actual Paper Content**:
  - Automatically fetches and parses full-text PDFs on-the-fly for online open-access papers (such as arXiv preprints) and locally uploaded PDFs via `pdf-parse` v2.
  - Automatically falls back to verified full abstracts for paywalled/closed publications.
  - Grounding badge indicates whether full-text manuscript or published abstract was analyzed.
- **Academic Reviewer Prompt Engineering**:
  - Structured output tailored for researchers:
    1. **Executive Summary & Core Contribution**
    2. **Problem Formulation & Research Motivation**
    3. **Methodology & Technical Approach**
    4. **Key Findings & Empirical Results**
    5. **Critical Limitations & Open Challenges**
- **Real-Time Streaming Generation**:
  - Fast streaming token generation powered by `gemini-3.5-flash-lite` (1M token context window).
  - Responsive slide-over drawer with copy button, regenerate action, and markdown formatting.
- **Persistent SQLite Caching**:
  - Summaries are automatically cached in SQLite (`paper_summaries` table) by paper ID for instant offline review without redundant API calls.

### 5. Ask Questions About a Paper (Conversational Academic Q&A)
- **Natural-Language Question Answering**:
  - Ask in-depth questions about specific algorithms, empirical numbers, mathematical mechanisms, ablation studies, or baselines.
  - Answers are strictly grounded in the paper's manuscript text and cite specific sections, tables, and equations.
- **Handout-Aligned Quick Prompt Chips**:
  - Pre-configured, one-click prompt chips directly matching the assignment questions:
    - *"What problem does this paper address?"*
    - *"What is the main idea of the proposed approach?"*
    - *"What datasets are used?"*
    - *"What are the major limitations?"*
    - *"How does this method compare with the baselines?"*
- **Multi-Turn Context & Streaming**:
  - Maintains conversation turn history for iterative deep-dives (e.g., follow-up clarifications).
  - Real-time NDJSON token streaming with markdown formatting (bullet points, code, and math complexity notation).
- **Persistent Chat History in SQLite**:
  - All questions and assistant answers are persisted in SQLite (`chat_messages` table) per paper. Conversations are preserved across browser refreshes and application restarts.
  - Includes a one-click "Clear History" button to reset dialogue.

### 6. High-Contrast Dark Mode & Bright Mode
- **Low-Brightness Readability**: Tuned dark theme contrast tokens specifically optimized for laptops running at low display brightness (pure white text `#ffffff`, high-contrast slate-100 body `#e2e8f0`, distinct card borders).
- **Bright Mode**: Soft slate-white background with high-contrast slate-900 typography.
- **Theme Switcher**: Instant Sun/Moon toggle in the header; persists user preference in `localStorage`.

---

## Architecture & Tech Stack

```
+-----------------------------------------------------------------------------------+
|                              Client Tier (Browser)                                |
|  React 19, Vanilla CSS Modules, High-Contrast Dark & Bright Mode, AI Summary Drawer |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
|                            Server Tier (Next.js 16)                               |
|  /api/search     /api/library     /api/upload     /api/ai/summarize     /api/ai/status|
+-----------------------------------------------------------------------------------+
         |                  |                 |                      |
         v                  v                 v                      v
+------------------+ +-----------------+ +---------------------+ +--------------------+
|  Academic APIs   | | SQLite Database | | Local PDF Storage   | | Google Gemini API  |
|  - OpenAlex      | | - library.db    | | - data/uploads/*.pdf| | - 3.5-flash-lite   |
|  - Crossref      | | - WAL mode      | | - pdf-parse v2      | | - Real-time SSE    |
|  - Europe PMC    | | - better-sqlite3| +---------------------+ | - 1M token context |
|  - arXiv         | +-----------------+                         +--------------------+
+------------------+
```

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack) | Unified TypeScript runtime for server APIs and client UI. |
| **Styling** | Vanilla CSS + CSS Modules | Zero runtime bloat, CSS custom property tokens, glassmorphism. |
| **Database** | SQLite via `better-sqlite3` | Local persistent storage for papers, authors, tags, and notes. |
| **PDF Extraction** | `pdf-parse` v2 (`PDFParse`) | Server-side PDF text extraction and metadata heuristics. |
| **Icons** | `lucide-react` | Clean, modern iconography. |

---

## Project Structure

```
├── data/                       # Local SQLite database & uploaded PDF storage
│   ├── library.db              # SQLite database (auto-generated on startup)
│   └── uploads/                # Binary storage for uploaded research PDFs
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── library/        # GET, POST (single/batch), DELETE papers
│   │   │   ├── search/         # Unified academic search proxy
│   │   │   ├── upload/         # Multipart PDF upload & metadata extraction
│   │   │   └── uploads/[filename]/ # Binary PDF streaming endpoint
│   │   ├── globals.css         # Design tokens, bright/dark theme variables
│   │   ├── layout.tsx          # Root layout with theme initialization script
│   │   ├── page.tsx            # Main application UI controller
│   │   └── page.module.css     # Navigation tabs, layout, toolbar styling
│   ├── components/
│   │   ├── FilterBar.tsx       # Year, sorting, and source dropdowns
│   │   ├── PaperCard.tsx       # Research paper card with multi-select & save
│   │   ├── SearchBar.tsx       # Search bar with quick topic chips
│   │   ├── SearchSkeleton.tsx  # Shimmer loading skeleton
│   │   └── UploadModal.tsx     # PDF drag-and-drop upload modal
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts        # Database connection with WAL mode
│   │   │   ├── schema.ts       # Database auto-migration & table schemas
│   │   │   └── libraryRepo.ts  # CRUD & batch operations for library papers
│   │   ├── arxiv.ts            # arXiv API query builder & XML parser
│   │   ├── pdfExtractor.ts     # PDF text parser & heuristic metadata extractor
│   │   └── search.ts           # OpenAlex, Crossref, and Europe PMC search orchestrator
│   └── types/
│       └── paper.ts            # TypeScript data models and interfaces
├── PLAN_DETAILED.md            # In-depth architectural implementation plan
├── PLAN_SUMMARY.md             # High-level roadmap and milestone summaries
└── package.json                # Project dependencies and npm scripts
```

---

## Prerequisites

- **Node.js**: `v18.18.0` or higher (tested on Node v20+ and v22+)
- **npm**: `v9.0.0` or higher

---

## Setup & Execution Instructions

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/rajeev-goyal/research_assistant.git
cd research_assistant

# Install project dependencies
npm install
```

### 2. Configure Gemini API Key (Optional / Zero-Config)

You can either configure your key in `.env.local` or directly in the browser UI via the **"AI Key"** settings button:

```bash
# Create .env.local in the root directory (already git-ignored)
echo 'GEMINI_API_KEY="your-google-gemini-api-key"' > .env.local
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build & Run for Production

```bash
# Build the optimized production application
npm run build

# Start the production server
npm start
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/search?q={query}&page={page}&sortBy={sort}&year={year}&provider={provider}` | Queries OpenAlex, Crossref, and arXiv for academic papers. |
| `GET` | `/api/library` | Retrieves all saved papers from the local SQLite database. |
| `POST` | `/api/library` | Saves a single paper (`{ ...paper }`) or a batch of papers (`{ papers: [...] }`) to SQLite. |
| `DELETE` | `/api/library?id={paperId}` | Deletes a paper from the local library database. |
| `POST` | `/api/upload` | Accepts a multipart form upload (`file: PDF`) and extracts title, authors, year, and abstract. |
| `GET` | `/api/uploads/{filename}` | Streams the stored PDF binary for inline reading. |
| `GET` | `/api/ai/status` | Reports whether Gemini API key is configured. |
| `GET` | `/api/ai/summarize?paperId={id}` | Retrieves cached summary from SQLite. |
| `POST` | `/api/ai/summarize` | Resolves full paper content and streams NDJSON summary generated by Gemini. |
| `GET` | `/api/ai/chat?paperId={id}` | Retrieves persistent multi-turn conversation history from SQLite. |
| `POST` | `/api/ai/chat` | Sends question, grounds on manuscript content, streams answer, and persists turn in SQLite. |
| `DELETE` | `/api/ai/chat?paperId={id}` | Clears conversation history for the specified paper. |

---

## License

MIT License. Designed and built as an advanced academic research assistant.
