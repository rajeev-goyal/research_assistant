# Testing Scratchpad

This scratchpad tracks system architecture details, test matrix mappings, fixtures, and technical notes across the AI Research Assistant codebase.

---

## 1. System Architecture & Tech Stack Reference

| Subsystem | Source Path | Tech Stack / Protocol | Key Responsibilities & Invariants |
|---|---|---|---|
| **Database & Persistence** | `src/lib/db/index.ts`<br/>`src/lib/db/schema.ts`<br/>`src/lib/db/libraryRepo.ts` | SQLite (`better-sqlite3`), WAL Mode | ACID transactions for single and batch paper saves (`ON CONFLICT(id) DO UPDATE`), author ordering preservation, summary caching (`paper_summaries`), multi-turn chat history (`chat_messages`). |
| **Search Engine & Aggregator** | `src/lib/search.ts`<br/>`src/lib/arxiv.ts`<br/>`src/app/api/search/route.ts` | OpenAlex API, Crossref API, Europe PMC, arXiv API | Multi-provider literature search, inverted index abstract reconstruction, Europe PMC / Semantic Scholar fallback resolution, ranking papers with abstracts first, filtering out figures/tables/errata. |
| **PDF Processing & Heuristics** | `src/lib/pdfExtractor.ts`<br/>`src/app/api/upload/route.ts`<br/>`src/app/api/uploads/[filename]/route.ts` | `pdf-parse` v2 (`PDFParse`), Node streams | Multipart file validation (max 35MB, PDF MIME/extension), text stream heuristic extraction (titles, authors, publication years, abstract boundaries, noise rejection). |
| **AI Synthesis & Q&A** | `src/lib/ai/geminiClient.ts`<br/>`src/lib/paperContentResolver.ts`<br/>`src/app/api/ai/*` | Google Gemini API (`gemini-3.5-flash-lite`), SSE streaming | Multi-source resolution (local stored PDF, remote preprint cross-matching, abstract fallback), academic 5-section prompt synthesis, grounded Q&A with conversational history. |
| **UI Components** | `src/components/*`<br/>`src/app/page.tsx` | React 19, Vanilla CSS Modules | High-contrast Dark / Bright mode, topic chips, real-time filtering, multi-select checkboxes, floating batch action bar, slide-out AI drawers. |

---

## 2. Test Suite Architecture & Directory Layout

The testing framework is built on **Vitest** with `@testing-library/react`, `@testing-library/jest-dom/vitest`, `jsdom`, and `@vitest/coverage-v8`.

```
tests/
├── setup.ts                           # Global Vitest configuration & DOM matcher extensions
├── db/
│   └── libraryRepo.test.ts            # In-memory SQLite isolated tests for all CRUD, batching, summaries, and chat
├── lib/
│   ├── arxiv.test.ts                  # arXiv query builder, pagination, XML Atom parsing, error handling
│   ├── search.test.ts                 # Abstract heuristics, artifact filtering, fallback resolvers, ranking
│   ├── pdfExtractor.test.ts           # PDF metadata extraction heuristics, author normalization, title fallbacks
│   └── aiModules.test.ts              # Gemini API key resolution, academic prompt synthesis, content resolver
├── api/
│   └── apiRoutes.test.ts              # NextRequest/NextResponse route handlers for search, library, upload, AI status/summaries/chat
└── components/
    └── components.test.tsx            # React UI components (SearchBar, FilterBar, PaperCard interaction & events)
```

---

## 3. Test Coverage Matrix

| Test Suite File | Coverage Target | Key Test Cases |
|---|---|---|
| `tests/db/libraryRepo.test.ts` | `src/lib/db/libraryRepo.ts` | • Single paper save and persistence check (`isPaperSaved`)<br/>• Author order retention and notes count<br/>• Conflict resolution (`ON CONFLICT(id) DO UPDATE`)<br/>• Cascading deletion of authors on paper removal<br/>• Read status transitions (`unread` -> `reading` -> `completed`)<br/>• Atomic batch saving (`savePapersBatch`) & empty batch safety<br/>• AI paper summary caching, updates, and deletion<br/>• Chat message logging, chronological ordering, and clearing |
| `tests/lib/arxiv.test.ts` | `src/lib/arxiv.ts` | • Zero network call on empty / whitespace queries<br/>• Field prefix formatting (`ti:`, `au:`, `abs:`) and pagination<br/>• Atom XML parsing (entry mapping, authors, dates, PDF URLs)<br/>• HTTP 5xx error propagation from external arXiv service |
| `tests/lib/search.test.ts` | `src/lib/search.ts` | • `hasMeaningfulAbstract` boundary checks<br/>• `isLegitimatePaper` filtering out figures, tables, and errata<br/>• Fallback abstract resolution via Europe PMC and Semantic Scholar<br/>• Empty search query validation<br/>• OpenAlex parsing, saved paper ID matching, abstract-first ranking |
| `tests/lib/pdfExtractor.test.ts` | `src/lib/pdfExtractor.ts` | • Extraction of title, authors, year, and abstract from raw text<br/>• Rejection of arXiv stamps, proceedings headers, and affiliations<br/>• Fallback to sanitized filename when metadata title is generic<br/>• Fallback when abstract is missing in document |
| `tests/lib/aiModules.test.ts` | `src/lib/ai/geminiClient.ts`<br/>`src/lib/paperContentResolver.ts` | • API key resolution order (client override > process.env > .env.local)<br/>• 5-section academic prompt construction<br/>• Source type discrimination (manuscript vs abstract)<br/>• arXiv preprint cross-matching by title<br/>• Content resolution for local PDF files vs abstract fallback |
| `tests/api/apiRoutes.test.ts` | `src/app/api/*` | • `GET /api/search` empty query vs query execution<br/>• `GET /api/library` paper retrieval<br/>• `POST /api/library` single & batch validation (400 on missing title/id)<br/>• `DELETE /api/library` query parameter validation<br/>• `POST /api/upload` rejecting missing files, non-PDFs, and >35MB<br/>• `GET /api/ai/status` key configuration status<br/>• `POST /api/ai/summarize` & `chat` 400 validation & 401 unauthenticated |
| `tests/components/components.test.tsx` | `src/components/*` | • `SearchBar` typing, submit event, topic chips, clear input<br/>• `FilterBar` count display, provider badge, sort and OA change<br/>• `PaperCard` metadata display, read/collapse abstract, save toggle, AI button, batch checkbox |

---

## 4. Run & Execution Reference

```bash
# Run complete test suite once
npm test

# Run tests with terminal coverage summary table
npm run test:coverage

# Run tests in interactive watch mode
npm run test:watch
```
