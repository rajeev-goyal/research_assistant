# Test Suite Activity Log

## Pre-Run Incident: Missing Vite Peer Dependency Startup Failure

- **Timestamp**: 2026-11-08 00:58:11 EST
- **Command**: `npm run test:coverage`
- **Error Code**: `ERR_MODULE_NOT_FOUND`
- **Status**: FAILED (Startup Blocker)

### Error Details
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite' imported from /Users/rajeevgoyal/Codes/ASE/node_modules/vitest/dist/chunks/nativeModuleRunner.9xPIMzi7.js
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:331:9)
    at packageResolve (node:internal/modules/esm/resolve:784:25)
    at moduleResolve (node:internal/modules/esm/resolve:873:18)
    at defaultResolve (node:internal/modules/esm/resolve:1006:11)
    at #cachedDefaultResolve (node:internal/modules/esm/loader:708:20)
    at #resolveAndMaybeBlockOnLoaderThread (node:internal/modules/esm/loader:728:38)
    at ModuleLoader.resolveSync (node:internal/modules/esm/loader:766:56)
    at #resolve (node:internal/modules/esm/loader:690:17)
    at ModuleLoader.getOrCreateModuleJob (node:internal/modules/esm/loader:610:35)
    at ModuleJob.syncLink (node:internal/modules/esm/module_job:277:33) {
  code: 'ERR_MODULE_NOT_FOUND'
}
```

### Root Cause Analysis
Vitest `v5.1.0` requires `vite` as its underlying transform engine and module runner. While `@vitest/coverage-v8`, `@testing-library/react`, and other test utilities were installed, `vite` was not present as an explicit devDependency in `package.json`, causing the native module runner to fail immediately during bootstrap before any test suites could be loaded or executed.

### Resolution Steps
1. Installed `vite` explicitly as a devDependency via `npm install -D vite --legacy-peer-deps`.
2. Transitioned Vitest configuration to standard ESM `vitest.config.mts` using `import.meta.dirname` to ensure compatibility with Node.js `v26.8.1`.
3. Verified the runner bootstrap via `npx vitest --version` (`vitest/5.1.0 darwin-arm64 node-v26.8.1`).

---

## Run 1: Initial Test Suite Execution & Baseline Coverage

- **Timestamp**: 2026-11-08 01:01:28 EST
- **Environment**: Node.js `v26.8.1`, Vitest `v5.1.0`, v8 coverage provider
- **Command**: `npm run test:coverage`
- **Result**: PASS (7 test files passed, 65 tests passed, 0 failed)
- **Duration**: 4.21s

### Test Suite Breakdown

| Suite File | Tests Passed | Status | Coverage Focus |
|---|:---:|:---:|---|
| `tests/db/libraryRepo.test.ts` | 14 / 14 | PASS | In-memory SQLite CRUD, batch atomic insert, deduplication conflict updates, read status, summary cache, chat messages |
| `tests/lib/arxiv.test.ts` | 4 / 4 | PASS | Query builder prefixes, XML Atom parsing, error handling, pagination |
| `tests/lib/search.test.ts` | 10 / 10 | PASS | Abstract checks, artifact/figure filtering, fallback Europe PMC resolution, OpenAlex ranking |
| `tests/lib/pdfExtractor.test.ts` | 3 / 3 | PASS | PDFParse text extraction, header noise filtering, author normalization, title fallbacks |
| `tests/lib/aiModules.test.ts` | 9 / 9 | PASS | Gemini API key priority hierarchy, academic prompt assembler, content resolver |
| `tests/api/apiRoutes.test.ts` | 14 / 14 | PASS | Next.js App Router handlers (`/api/search`, `/api/library`, `/api/upload`, `/api/ai/*`) |
| `tests/components/components.test.tsx` | 11 / 11 | PASS | React 19 UI components (`SearchBar`, `FilterBar`, `PaperCard` events and interactions) |

### Baseline Coverage Output

```
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   35.73 |    35.69 |   35.98 |   36.36 |                   
 app               |       0 |        0 |       0 |       0 |                   
  layout.tsx       |       0 |      100 |       0 |       0 | 4-14              
  page.tsx         |       0 |        0 |       0 |       0 | 1-752             
 app/api/ai/chat   |   26.53 |    30.43 |      40 |   27.08 |                   
  route.ts         |   26.53 |    30.43 |      40 |   27.08 | ...2,30,45,52-173 
 app/api/ai/status |     100 |      100 |     100 |     100 |                   
  route.ts         |     100 |      100 |     100 |     100 |                   
 ...i/ai/summarize |   33.33 |    27.27 |   66.66 |   33.33 |                   
  route.ts         |   33.33 |    27.27 |   66.66 |   33.33 | 15-16,27,42-154   
 app/api/library   |   77.41 |    66.66 |     100 |   76.66 |                   
  route.ts         |   77.41 |    66.66 |     100 |   76.66 | ...32,57-58,75-76 
 app/api/search    |   86.66 |     87.5 |     100 |   86.66 |                   
  route.ts         |   86.66 |     87.5 |     100 |   86.66 | 41-42             
 app/api/upload    |   37.03 |    58.33 |     100 |   37.03 |                   
  route.ts         |   37.03 |    58.33 |     100 |   37.03 | 35-86             
 ...ads/[filename] |       0 |        0 |       0 |       0 |                   
  route.ts         |       0 |        0 |       0 |       0 | 10-31             
 components        |   10.29 |    14.35 |    19.1 |   10.97 |                   
  ApiKeyModal.tsx  |       0 |        0 |       0 |       0 | 1-104             
  FilterBar.tsx    |   71.42 |    77.77 |      60 |   71.42 | 66-84             
  PaperCard.tsx    |   84.61 |    71.18 |      75 |    87.5 | 55-56,210         
  SearchBar.tsx    |     100 |       80 |     100 |     100 | 35,74             
  ...hSkeleton.tsx |       0 |      100 |       0 |       0 | 1-10              
  SummaryModal.tsx |       0 |        0 |       0 |       0 | 1-780             
  UploadModal.tsx  |       0 |        0 |       0 |       0 | 1-232             
 lib               |   62.52 |    52.91 |      70 |   63.88 |                   
  arxiv.ts         |   95.83 |    70.68 |     100 |   95.58 | 94,145,151        
  ...ntResolver.ts |   40.87 |    33.62 |   44.44 |    43.2 | ...54-241,250-298 
  pdfExtractor.ts  |   83.33 |    80.37 |      90 |   85.34 | ...45-246,265-272 
  search.ts        |   53.18 |    40.39 |      64 |   53.88 | ...75,489-497,511 
 lib/ai            |   11.11 |    17.18 |      50 |   12.04 |                   
  geminiClient.ts  |   11.11 |    17.18 |      50 |   12.04 | 22-29,78-264      
 lib/db            |   76.85 |    71.15 |    91.3 |   76.28 |                   
  index.ts         |   15.38 |        0 |       0 |      16 | 13-52             
  libraryRepo.ts   |   96.29 |    80.43 |     100 |   97.18 | 183-184           
  schema.ts        |     100 |      100 |     100 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------
```


---

## Stage 1: Initial Test Suite Analysis & Coverage Report

- **Timestamp**: 2026-11-08 10:55:35 EST
- **Runner**: Vitest `v5.1.0` (V8 Coverage Provider, JSDOM environment)
- **Overall Metrics**:
  - **Total Tests**: 65
  - **Passed**: 65 (100%)
  - **Failed**: 0 (0%)
  - **Line Coverage**: 36.36% (Overall)
  - **Branch Coverage**: 35.69% (Overall)
  - **Statement Coverage**: 35.73%
  - **Function Coverage**: 35.98%

---

### 1. Files Tested & Test Suite Typology

The initial test suite spans 7 test files covering the database layer, search & retrieval pipeline, PDF heuristic extraction, AI integration, Next.js API route handlers, and React 19 UI components:

| Test File | Target Source File | Test Type | Coverage Focus & Core Capabilities Verified |
|---|---|---|---|
| `tests/db/libraryRepo.test.ts` | `src/lib/db/libraryRepo.ts`<br/>`src/lib/db/schema.ts` | Integration / Unit | In-memory SQLite (`:memory:`) testing; single & batch atomic inserts; deduplication updates (`ON CONFLICT DO UPDATE`); cascading foreign key deletions (`paper_authors`); status lifecycle (`unread` $\rightarrow$ `reading` $\rightarrow$ `completed`); persistent AI summary caching & updates; multi-turn chat message logging & clearing. |
| `tests/lib/arxiv.test.ts` | `src/lib/arxiv.ts` | Unit / Mocked Service | arXiv query construction (`ti:`, `au:`, `abs:` filters); Atom XML parsing into typed `Paper` entities; empty/whitespace input short-circuiting; HTTP 5xx error propagation. |
| `tests/lib/search.test.ts` | `src/lib/search.ts` | Unit / Mocked Service | Abstract quality heuristics (`hasMeaningfulAbstract`); non-paper artifact & errata filtering (`isLegitimatePaper`); Europe PMC / Semantic Scholar fallback abstract recovery; OpenAlex search ingestion, saved paper matching, and abstract-first ranking. |
| `tests/lib/pdfExtractor.test.ts` | `src/lib/pdfExtractor.ts` | Unit / Heuristic Parsing | `pdf-parse` v2 integration; preprint/conference header noise rejection; author normalization and affiliation suppression; title candidate extraction with filename fallback; abstract boundary parsing. |
| `tests/lib/aiModules.test.ts` | `src/lib/ai/geminiClient.ts`<br/>`src/lib/paperContentResolver.ts` | Unit / Service Integration | Three-tier Gemini API key resolution (`clientKey` > `process.env` > `.env.local`); academic 5-section prompt synthesis; title-based arXiv preprint cross-matching (`isStrongTitleMatch`); multi-source content resolution (local disk PDF vs published abstract). |
| `tests/api/apiRoutes.test.ts` | `src/app/api/*` | Route Handler Integration | Next.js App Router handlers (`/api/search`, `/api/library`, `/api/upload`, `/api/ai/*`) using `NextRequest`/`NextResponse`; input schema validation; HTTP status codes (200, 400, 401); error boundaries. |
| `tests/components/components.test.tsx` | `src/components/*` | Component / UI Interaction | React Testing Library + JSDOM; `SearchBar` (input changes, form submit, quick topic chips, clear button); `FilterBar` (sort selection, year filter, Open Access toggle, provider badge); `PaperCard` (metadata rendering, abstract toggle, save toggle, AI button triggers, multi-select checkboxes). |

---

### 2. Failure Analysis: Mock Assumptions vs. Real Application Bugs

During test suite development and prior to achieving a 100% pass rate, 13 test assertions failed temporarily during execution. All failures were isolated and analyzed:

1. **Arrow Function Constructor Mock (`pdf-parse`)**:
   - *Classification*: **Invalid Test Mock Assumption**.
   - *Cause*: `PDFParse` was initially mocked using an arrow function (`mockImplementation(() => mockParserInstance)`). In JavaScript/V8, arrow functions lack a `[[Construct]]` internal method, triggering `TypeError: () => mockParserInstance is not a constructor` when invoked with `new PDFParse(...)`.
   - *Resolution*: Replaced with an ES6 class mock containing `getText()`, `getInfo()`, and `destroy()` methods.

2. **OpenAlex Title Property Mapping (`search.test.ts`)**:
   - *Classification*: **Invalid Test Mock Assumption**.
   - *Cause*: Mock fixtures assigned `display_name` instead of `title`. `src/lib/search.ts` (line 347) specifically reads `item.title || "Untitled Paper"`, causing test assertions expecting the title to fail.
   - *Resolution*: Updated test fixture to provide both `title` and `display_name`.

3. **Local PDF Content Length Boundary (`aiModules.test.ts`)**:
   - *Classification*: **Invalid Test Mock Assumption**.
   - *Cause*: `src/lib/paperContentResolver.ts` applies a guard `if (cleaned.length >= 300)` before accepting extracted PDF text as a valid manuscript. The initial mock text was ~110 characters, causing the resolver to discard it and fall back to abstract mode.
   - *Resolution*: Adjusted mock text length in the test fixture to satisfy the $>300$ character threshold.

4. **Node Undici / WebIDL Multipart Parsing Incompatibility (`apiRoutes.test.ts`)**:
   - *Classification*: **Test Environment Limitation (JSDOM / Node 26 Undici)**.
   - *Cause*: Passing JSDOM's global `Blob` into `FormData` and wrapping it in `new NextRequest()` triggered an internal assertion failure inside Node 26's Undici multipart parser (`assert(webidl.is.File(value))`), yielding HTTP 500 instead of HTTP 400.
   - *Resolution*: Directly spied on `req.formData()` to return properly structured mock file payloads.

5. **React 19 `act(...)` Warning on Optimistic State Update (`PaperCard.tsx`)**:
   - *Classification*: **Harmless Component Test Timing Warning**.
   - *Cause*: `PaperCard` performs an optimistic local state update (`setSaved(!saved)`) upon save toggle. While the test assertion succeeded, React 19 emitted a console warning regarding state updates outside `act(...)`.

*Summary*: **Zero real application bugs** caused test failures. The application logic correctly enforces data validation, error handling, and formatting invariants.

---

### 3. Identified Weak Assertions in Passing Tests

The following passing tests contain opportunities for deeper validation in future testing iterations:

1. **`GET /api/ai/status`**:
   - *Current State*: Asserts `json.configured === true` and checks the model name string.
   - *Weakness*: Does not verify the unconfigured branch (`configured: false`) when the API key is completely absent from all three resolution tiers.

2. **`POST /api/library` (Batch Save)**:
   - *Current State*: Verifies that the route returns `{ success: true, count: 2 }`.
   - *Weakness*: Relies on a spy on `savePapersBatch`. Does not execute an end-to-end database query to inspect whether the child `paper_authors` and parent `papers` rows exist in SQLite with correct relational foreign keys and timestamps.

3. **`POST /api/ai/summarize` & `POST /api/ai/chat` (Validation Tests)**:
   - *Current State*: Validates HTTP 400 (bad payload) and HTTP 401 (missing API key).
   - *Weakness*: Does not test successful streaming output chunks (SSE/NDJSON parsing) or SQLite summary/chat history caching due to stream mocking complexity in standard unit tests.

4. **`PaperCard` Error State Reversion**:
   - *Current State*: Asserts `onToggleSave` is called with `(paper, false)`.
   - *Weakness*: Does not simulate a rejected promise from `onToggleSave` to verify that `setSaved` correctly rolls back the optimistic update and re-enables the button.

5. **`extractMetadataFromPdf` Text Variations**:
   - *Current State*: Evaluates clean, well-formatted text strings.
   - *Weakness*: Does not stress-test 2-column IEEE layouts, OCR scanned noise, or exotic author footnote formatting patterns.

---

### 4. Major Untested Files & Code Branches

Based on the V8 code coverage report (36.36% overall line coverage), the primary untested files and branches are:

#### A. Completely Untested Files (0% Coverage)
1. **`src/app/page.tsx` (752 lines)**:
   - Entire root UI controller: search state machine, tab transitions (Search vs. My Library), floating multi-select batch action bar, pagination controls, theme toggle persistence, and drawer opening triggers.
2. **`src/components/SummaryModal.tsx` (780 lines)**:
   - AI Paper Workspace drawer: SSE streaming reader, real-time Markdown and KaTeX rendering, dual-tab interface (Summary vs. Ask AI), pre-configured question chips, copy action, and history clearing.
3. **`src/components/UploadModal.tsx` (232 lines)**:
   - Drag-and-drop file interactions, drag-over styles, client-side size validation, upload progress bar, and server response preview.
4. **`src/components/ApiKeyModal.tsx` (104 lines)**:
   - Client API key input form, visibility toggle, validation, and `localStorage` persistence.
5. **`src/app/api/uploads/[filename]/route.ts` (31 lines)**:
   - File streaming endpoint serving stored PDF binaries from `data/uploads/` with HTTP Range and MIME headers.
6. **`src/components/SearchSkeleton.tsx` & `src/app/layout.tsx`**:
   - Shimmer placeholder rendering and root layout theme initialization script.

#### B. Partially Covered Files with Significant Untested Branches
1. **`src/lib/ai/geminiClient.ts` (12.04% Lines Covered)**:
   - Lines 78–264 are untested: `streamGeminiSummary` and `streamGeminiChatAnswer` async generator pipelines, SSE chunk parsing (`data: ...`), buffer line splitting, error stream handling, and multi-turn message history transformation.
2. **`src/lib/paperContentResolver.ts` (43.2% Lines Covered)**:
   - Lines 154–241: Remote open-access PDF downloading and on-the-fly streaming extraction via `pdfUrl`.
   - Lines 250–298: ArXiv preprint cross-matching fallback when a search result lacks direct PDF links.
3. **`src/lib/search.ts` (53.88% Lines Covered)**:
   - Lines 458–475: Fallback to arXiv search when OpenAlex API is unreachable.
   - Lines 489–497: Crossref exact title match elevation to position #1.
   - Lines 400–445: Multi-page result pagination and DOI cleaning branches.
4. **`src/app/api/upload/route.ts` (37.03% Lines Covered)**:
   - Lines 35–86: The successful upload execution branch that writes binary to `data/uploads/`, generates SHA-256 hashes, extracts metadata, and saves to SQLite.
5. **`src/app/api/ai/summarize/route.ts` & `src/app/api/ai/chat/route.ts` (~27–33% Lines Covered)**:
   - Streaming execution branches, SQLite caching on completion, and cache retrieval (`GET` with existing summary).
