"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "./page.module.css";
import { Paper, LibraryPaper } from "@/types/paper";
import { SearchBar } from "@/components/SearchBar";
import { FilterBar } from "@/components/FilterBar";
import { PaperCard } from "@/components/PaperCard";
import { SearchSkeleton } from "@/components/SearchSkeleton";
import { UploadModal } from "@/components/UploadModal";
import {
  Sparkles,
  Search,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  BookmarkCheck,
  CheckCircle2,
  AlertCircle,
  FileSearch,
  UploadCloud,
  Sun,
  Moon,
  Check,
  Bookmark,
  Key,
} from "lucide-react";
import { SummaryModal } from "@/components/SummaryModal";
import { ApiKeyModal } from "@/components/ApiKeyModal";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"search" | "library">("search");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Search State
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"relevance" | "date">("relevance");
  const [year, setYear] = useState("all");
  const [provider, setProvider] = useState<"all" | "openalex" | "arxiv">("all");
  const [results, setResults] = useState<Paper[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [providerUsed, setProviderUsed] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-Select State
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<string>>(new Set());
  const [isBatchSaving, setIsBatchSaving] = useState(false);

  // Library State
  const [libraryPapers, setLibraryPapers] = useState<LibraryPaper[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Theme State
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // AI Summary & Settings State
  const [summaryPaper, setSummaryPaper] = useState<Paper | null>(null);
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const handleOpenSummary = (paper: Paper) => {
    setSummaryPaper(paper);
    setIsSummaryModalOpen(true);
  };

  useEffect(() => {
    const stored = localStorage.getItem("research_theme") as "dark" | "light" | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      document.documentElement.setAttribute("data-theme", stored);
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("research_theme", nextTheme);
  };

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Load Library Papers from SQLite DB
  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch("/api/library");
      const data = await res.json();
      if (data.success) {
        setLibraryPapers(data.papers || []);
      }
    } catch (err) {
      console.error("Failed to fetch library:", err);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  // Execute Search
  const performSearch = useCallback(
    async (
      searchQuery: string,
      pageNumber: number = 1,
      sortOrder: "relevance" | "date" = sortBy,
      yearFilter: string = year,
      sourceProvider: "all" | "openalex" | "arxiv" = provider
    ) => {
      if (!searchQuery.trim()) return;

      setIsLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        const params = new URLSearchParams({
          q: searchQuery.trim(),
          page: pageNumber.toString(),
          limit: "10",
          sortBy: sortOrder,
          provider: sourceProvider,
        });

        if (yearFilter !== "all") {
          params.set("year", yearFilter);
        }

        const res = await fetch(`/api/search?${params.toString()}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to search research papers");
        }

        setResults(data.results || []);
        setTotalResults(data.total || 0);
        setProviderUsed(data.providerUsed || "");
        setPage(pageNumber);
        setSelectedPaperIds(new Set()); // reset selection on new search
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error during search");
        setResults([]);
        setTotalResults(0);
      } finally {
        setIsLoading(false);
      }
    },
    [sortBy, year, provider]
  );



  const handleSearchSubmit = (newQuery: string) => {
    setQuery(newQuery);
    setPage(1);
    performSearch(newQuery, 1, sortBy, year, provider);
  };

  const handleSortChange = (newSort: "relevance" | "date") => {
    setSortBy(newSort);
    setPage(1);
    performSearch(query, 1, newSort, year, provider);
  };

  const handleYearChange = (newYear: string) => {
    setYear(newYear);
    setPage(1);
    performSearch(query, 1, sortBy, newYear, provider);
  };

  const handleProviderChange = (newProvider: "all" | "openalex" | "arxiv") => {
    setProvider(newProvider);
    setPage(1);
    performSearch(query, 1, sortBy, year, newProvider);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;
    performSearch(query, newPage, sortBy, year, provider);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Multi-Select handlers
  const handleToggleSelect = (paper: Paper) => {
    setSelectedPaperIds((prev) => {
      const next = new Set(prev);
      if (next.has(paper.id)) {
        next.delete(paper.id);
      } else {
        next.add(paper.id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allIds = results.map((p) => p.id);
    const areAllSelected = allIds.length > 0 && allIds.every((id) => selectedPaperIds.has(id));
    if (areAllSelected) {
      setSelectedPaperIds(new Set());
    } else {
      setSelectedPaperIds(new Set(allIds));
    }
  };

  const handleSaveSelected = async () => {
    const selectedPapers = results.filter((p) => selectedPaperIds.has(p.id));
    if (!selectedPapers.length || isBatchSaving) return;

    setIsBatchSaving(true);
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: selectedPapers }),
      });
      const data = await res.json();
      if (data.success) {
        // Optimistically mark saved
        setResults((prev) =>
          prev.map((p) => (selectedPaperIds.has(p.id) ? { ...p, isSaved: true } : p))
        );
        loadLibrary();
        showToast(
          `Successfully saved ${selectedPapers.length} ${
            selectedPapers.length === 1 ? "paper" : "papers"
          } to library!`,
          "success"
        );
        setSelectedPaperIds(new Set());
      } else {
        showToast(data.error || "Failed to save selected papers", "info");
      }
    } catch (err) {
      console.error("Batch save error:", err);
      showToast("Error saving selected papers", "info");
    } finally {
      setIsBatchSaving(false);
    }
  };

  // Toggle Save to SQLite Library (Individual)
  const handleToggleSave = async (paper: Paper, currentlySaved: boolean) => {
    try {
      if (currentlySaved) {
        // Remove from library
        const res = await fetch(`/api/library?id=${encodeURIComponent(paper.id)}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Removed "${paper.title.slice(0, 40)}..." from library`, "info");
          // Update local search results state
          setResults((prev) =>
            prev.map((p) => (p.id === paper.id ? { ...p, isSaved: false } : p))
          );
          loadLibrary();
        }
      } else {
        // Save to library
        const res = await fetch("/api/library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(paper),
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Saved "${paper.title.slice(0, 40)}..." to local library`, "success");
          // Update local search results state
          setResults((prev) =>
            prev.map((p) => (p.id === paper.id ? { ...p, isSaved: true } : p))
          );
          loadLibrary();
        }
      }
    } catch (err) {
      console.error("Save toggle error:", err);
      showToast("Error updating paper in library", "info");
    }
  };

  const handleUploadSuccess = (newPaper: Paper) => {
    loadLibrary();
    setActiveTab("library");
    showToast(`Paper uploaded & saved: "${newPaper.title.slice(0, 35)}..."`, "success");
  };

  const totalPages = Math.ceil(totalResults / 10);

  return (
    <main className={styles.container}>
      {/* App Header */}
      <header className={styles.header}>
        <div
          className={styles.brand}
          onClick={() => {
            setActiveTab("search");
          }}
        >
          <div className={styles.brandIcon}>
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className={styles.brandTitle}>AI Research Assistant</h1>
            <p className={styles.brandSubtitle}>Academic Search & Local Knowledge Base</p>
          </div>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.themeToggleBtn}
            onClick={handleToggleTheme}
            id="btn-toggle-theme"
            title={theme === "dark" ? "Switch to Bright Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? (
              <>
                <Sun size={15} color="#f59e0b" />
                <span>Bright Mode</span>
              </>
            ) : (
              <>
                <Moon size={15} color="#6366f1" />
                <span>Dark Mode</span>
              </>
            )}
          </button>

          <button
            className={styles.themeToggleBtn}
            onClick={() => setIsApiKeyModalOpen(true)}
            id="btn-ai-settings"
            title="Gemini AI Settings"
          >
            <Key size={15} color="#818cf8" />
            <span>AI Key</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={() => setIsUploadModalOpen(true)}
            id="btn-open-upload-modal"
            style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
          >
            <UploadCloud size={16} />
            <span>Upload PDF</span>
          </button>

          <nav className={styles.navTabs}>
            <button
              className={`${styles.navTab} ${activeTab === "search" ? styles.navTabActive : ""}`}
              onClick={() => setActiveTab("search")}
              id="tab-search"
            >
              <Search size={16} />
              <span>Search Papers</span>
            </button>
            <button
              className={`${styles.navTab} ${activeTab === "library" ? styles.navTabActive : ""}`}
              onClick={() => {
                setActiveTab("library");
                loadLibrary();
              }}
              id="tab-library"
            >
              <BookOpen size={16} />
              <span>My Library</span>
              {libraryPapers.length > 0 && (
                <span className="badge badge-indigo" style={{ padding: "0.1rem 0.45rem", fontSize: "0.7rem" }}>
                  {libraryPapers.length}
                </span>
              )}
            </button>
          </nav>
        </div>
      </header>

      {/* Main Tab Content */}
      {activeTab === "search" ? (
        <div>
          {/* Search Bar with Chips */}
          <SearchBar
            initialQuery={query}
            onSearch={handleSearchSubmit}
            isLoading={isLoading}
          />

          {/* Filters Bar */}
          {hasSearched && (
            <FilterBar
              totalResults={totalResults}
              sortBy={sortBy}
              onSortChange={handleSortChange}
              year={year}
              onYearChange={handleYearChange}
              provider={provider}
              onProviderChange={handleProviderChange}
              providerUsed={providerUsed}
            />
          )}

          {/* Error Banner */}
          {error && (
            <div
              className="glass-card"
              style={{
                padding: "1rem 1.5rem",
                borderColor: "rgba(244, 63, 94, 0.4)",
                background: "rgba(244, 63, 94, 0.1)",
                color: "#fda4af",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              <AlertCircle size={20} />
              <div>
                <strong>Search Error:</strong> {error}
              </div>
            </div>
          )}

          {/* Loading Skeletons */}
          {isLoading && <SearchSkeleton />}

          {/* Welcoming state before first search */}
          {!isLoading && !hasSearched && (
            <div className={styles.emptyState} style={{ padding: "3.5rem 2rem" }}>
              <div className={styles.emptyIcon}>
                <Sparkles size={32} />
              </div>
              <h3 className={styles.emptyTitle}>Academic Search & Discovery</h3>
              <p className={styles.emptyDesc}>
                Search across 250M+ research papers, preprints, and conference publications. Enter a topic, keywords, or title above to start exploring.
              </p>
            </div>
          )}

          {/* Multi-Select Toolbar */}
          {!isLoading && results.length > 0 && (
            <div
              className={`${styles.selectionToolbar} ${
                selectedPaperIds.size > 0 ? styles.selectionToolbarActive : ""
              }`}
            >
              <label className={styles.selectAllLabel} onClick={handleSelectAll}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1.5px solid var(--border-hover)",
                    background:
                      results.every((p) => selectedPaperIds.has(p.id)) && results.length > 0
                        ? "var(--accent-primary)"
                        : "transparent",
                    borderColor:
                      results.every((p) => selectedPaperIds.has(p.id)) && results.length > 0
                        ? "var(--accent-primary)"
                        : "var(--border-hover)",
                    color: "#fff",
                  }}
                >
                  {results.every((p) => selectedPaperIds.has(p.id)) && results.length > 0 && (
                    <Check size={12} strokeWidth={3} />
                  )}
                </div>
                <span>
                  {results.every((p) => selectedPaperIds.has(p.id)) && results.length > 0
                    ? "Deselect All"
                    : `Select All on page (${results.length})`}
                </span>
                {selectedPaperIds.size > 0 && (
                  <span className="badge badge-indigo" style={{ fontSize: "0.75rem" }}>
                    {selectedPaperIds.size} selected
                  </span>
                )}
              </label>

              {selectedPaperIds.size > 0 && (
                <div className={styles.selectionActions}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveSelected}
                    disabled={isBatchSaving}
                    id="btn-save-selected"
                    style={{ padding: "0.45rem 1rem", fontSize: "0.825rem" }}
                  >
                    <BookmarkCheck size={15} />
                    <span>
                      {isBatchSaving
                        ? "Saving..."
                        : `Save Selected (${selectedPaperIds.size})`}
                    </span>
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setSelectedPaperIds(new Set())}
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.65rem" }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Results List */}
          {!isLoading && results.length > 0 && (
            <section className={styles.resultsList}>
              {[...results]
                .sort((a, b) => {
                  const aHas = a.abstract && a.abstract !== "No abstract available." && a.abstract.trim().length > 20 ? 1 : 0;
                  const bHas = b.abstract && b.abstract !== "No abstract available." && b.abstract.trim().length > 20 ? 1 : 0;
                  return bHas - aHas;
                })
                .map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    onToggleSave={handleToggleSave}
                    onSelectForAI={handleOpenSummary}
                    showCheckbox={true}
                    isSelected={selectedPaperIds.has(paper.id)}
                    onToggleSelect={handleToggleSelect}
                  />
                ))}
            </section>
          )}

          {/* Empty / Zero Results State */}
          {!isLoading && hasSearched && results.length === 0 && !error && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <FileSearch size={32} />
              </div>
              <h3 className={styles.emptyTitle}>No matching research papers found</h3>
              <p className={styles.emptyDesc}>
                Try broadening your search query, selecting &ldquo;Any Year&rdquo;, or checking for
                typos in topic keywords.
              </p>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && results.length > 0 && (
            <div className={styles.pagination}>
              <button
                className="btn btn-secondary"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                id="btn-pagination-prev"
              >
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>

              <span className={styles.pageInfo}>
                Page <strong>{page}</strong> of <strong>{Math.max(1, totalPages)}</strong>
              </span>

              <button
                className="btn btn-secondary"
                disabled={page >= totalPages}
                onClick={() => handlePageChange(page + 1)}
                id="btn-pagination-next"
              >
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      ) : (
        /* My Library View */
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
            <div>
              <h2 style={{ fontSize: "1.75rem", fontWeight: 700 }}>My Saved Research Library</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                Your curated collection of saved literature and uploaded research papers.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setIsUploadModalOpen(true)}
                id="btn-library-upload-pdf"
                style={{ padding: "0.4rem 0.85rem", fontSize: "0.85rem" }}
              >
                <UploadCloud size={15} color="#6366f1" />
                <span>Upload PDF</span>
              </button>
              <div className="badge badge-emerald" style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem" }}>
                <BookmarkCheck size={14} />
                {libraryPapers.length} {libraryPapers.length === 1 ? "Paper Saved" : "Papers Saved"}
              </div>
            </div>
          </div>

          {libraryLoading && <SearchSkeleton />}

          {!libraryLoading && libraryPapers.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <BookOpen size={32} />
              </div>
              <h3 className={styles.emptyTitle}>Your library is currently empty</h3>
              <p className={styles.emptyDesc}>
                Search for papers and click &ldquo;Save Paper&rdquo; or upload your own research PDFs to build your collection.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setActiveTab("search")}
                >
                  <Search size={16} />
                  <span>Start Searching Papers</span>
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsUploadModalOpen(true)}
                >
                  <UploadCloud size={16} />
                  <span>Upload PDF Paper</span>
                </button>
              </div>
            </div>
          )}

          {!libraryLoading && libraryPapers.length > 0 && (
            <section className={styles.resultsList}>
              {libraryPapers.map((paper) => (
                <PaperCard
                  key={paper.id}
                  paper={paper}
                  onToggleSave={handleToggleSave}
                  onSelectForAI={handleOpenSummary}
                />
              ))}
            </section>
          )}
        </div>
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Floating Action Bar for Selected Papers */}
      {selectedPaperIds.size > 0 && activeTab === "search" && (
        <aside className={styles.floatingBatchBar} id="floating-batch-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <BookmarkCheck size={18} color="#6366f1" />
            <strong style={{ fontSize: "0.9rem" }}>
              {selectedPaperIds.size} {selectedPaperIds.size === 1 ? "paper" : "papers"} selected
            </strong>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <button
              className="btn btn-primary"
              onClick={handleSaveSelected}
              disabled={isBatchSaving}
              id="btn-floating-save-selected"
              style={{ padding: "0.45rem 1.15rem", fontSize: "0.85rem" }}
            >
              <span>{isBatchSaving ? "Saving..." : `Save to Library (${selectedPaperIds.size})`}</span>
            </button>
            {selectedPaperIds.size === 1 && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const targetId = Array.from(selectedPaperIds)[0];
                  const targetPaper = results.find((p) => p.id === targetId);
                  if (targetPaper) handleOpenSummary(targetPaper);
                }}
                id="btn-floating-summarize-selected"
                style={{ padding: "0.45rem 0.95rem", fontSize: "0.85rem", color: "#a5b4fc" }}
              >
                <Sparkles size={14} />
                <span>Summarize</span>
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => setSelectedPaperIds(new Set())}
              style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem" }}
            >
              Clear
            </button>
          </div>
        </aside>
      )}

      {/* AI Summary Modal Drawer */}
      <SummaryModal
        paper={summaryPaper}
        isOpen={isSummaryModalOpen}
        onClose={() => setIsSummaryModalOpen(false)}
        onOpenApiKeySettings={() => setIsApiKeyModalOpen(true)}
      />

      {/* Gemini API Key Settings Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
      />

      {/* Floating Toast Notification */}
      {toast && (
        <div className={styles.toast} id="toast-notification">
          <CheckCircle2 size={16} color={toast.type === "success" ? "#10b981" : "#6366f1"} />
          <span>{toast.message}</span>
        </div>
      )}
    </main>
  );
}
