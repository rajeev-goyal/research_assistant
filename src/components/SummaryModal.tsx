"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  X,
  Copy,
  Check,
  RefreshCw,
  FileText,
  BookOpen,
  Cpu,
  Database,
  AlertTriangle,
  Key,
} from "lucide-react";
import { Paper } from "@/types/paper";
import styles from "./SummaryModal.module.css";

interface SummaryModalProps {
  paper: Paper | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenApiKeySettings?: () => void;
}

export function SummaryModal({
  paper,
  isOpen,
  onClose,
  onOpenApiKeySettings,
}: SummaryModalProps) {
  const [summary, setSummary] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [sourceType, setSourceType] = useState<"full_pdf" | "abstract" | "partial">("full_pdf");
  const [charCount, setCharCount] = useState<number>(0);
  const [model, setModel] = useState<string>("gemini-3.5-flash-lite");
  const [isCached, setIsCached] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Trigger summarization when paper changes or opened
  useEffect(() => {
    if (!isOpen || !paper) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      return;
    }

    fetchOrGenerateSummary(false);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [isOpen, paper?.id]);

  const fetchOrGenerateSummary = async (forceRefresh = false) => {
    if (!paper) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setError(null);
    setCopied(false);

    // If not force refresh, check if already cached in SQLite first
    if (!forceRefresh) {
      try {
        const cacheRes = await fetch(`/api/ai/summarize?paperId=${encodeURIComponent(paper.id)}`, {
          signal: controller.signal,
        });
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          if (cacheData?.summary?.summary) {
            setSummary(cacheData.summary.summary);
            setSourceType(cacheData.summary.sourceType || "full_pdf");
            setCharCount(cacheData.summary.charCount || cacheData.summary.summary.length);
            setModel(cacheData.summary.model || "gemini-3.5-flash-lite");
            setIsCached(true);
            setIsStreaming(false);
            return;
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
      }
    }

    // Otherwise, stream generation
    setSummary("");
    setIsStreaming(true);
    setIsCached(false);

    try {
      const storedKey = typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") || undefined : undefined;

      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paper,
          apiKey: storedKey,
          forceRefresh,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to generate summary`);
      }

      // If returned JSON (e.g. cached on server side)
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        setSummary(json.summary || "");
        setSourceType(json.sourceType || "full_pdf");
        setModel(json.model || "gemini-3.5-flash-lite");
        setIsCached(Boolean(json.cached));
        setIsStreaming(false);
        return;
      }

      // Process NDJSON stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body stream");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "meta") {
              setSourceType(event.sourceType || "full_pdf");
              setCharCount(event.charCount || 0);
              setModel(event.model || "gemini-3.5-flash-lite");
            } else if (event.type === "chunk" && event.text) {
              accumulated += event.text;
              setSummary(accumulated);
            } else if (event.type === "done") {
              setSummary(event.fullSummary || accumulated);
              setIsStreaming(false);
            } else if (event.type === "error") {
              throw new Error(event.message || "An error occurred during summarization.");
            }
          } catch (e: any) {
            if (e.message && e.message.includes("An error")) {
              throw e;
            }
          }
        }
      }

      setIsStreaming(false);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err?.message || "Failed to generate summary");
      setIsStreaming(false);
    }
  };

  const handleCopy = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderFormattedMarkdown = (text: string) => {
    if (!text) return null;

    const rawLines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let currentList: string[] = [];
    let currentParagraph: string[] = [];

    const flushParagraph = (key: string) => {
      if (currentParagraph.length > 0) {
        const pText = currentParagraph.join(" ").trim();
        if (pText) {
          elements.push(
            <p
              key={key}
              className={styles.paragraph}
              dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(pText) }}
            />
          );
        }
        currentParagraph = [];
      }
    };

    const flushList = (key: string) => {
      if (currentList.length > 0) {
        elements.push(
          <ul key={key} className={styles.list}>
            {currentList.map((item, idx) => (
              <li
                key={idx}
                className={styles.listItem}
                dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(item) }}
              />
            ))}
          </ul>
        );
        currentList = [];
      }
    };

    rawLines.forEach((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph(`p-${index}`);
        flushList(`l-${index}`);
        return;
      }

      if (trimmed.startsWith("###") || trimmed.startsWith("##") || trimmed.startsWith("#")) {
        flushParagraph(`p-${index}`);
        flushList(`l-${index}`);
        const headerText = trimmed.replace(/^#+\s*/, "");
        elements.push(
          <h3 key={`h-${index}`} className={styles.sectionHeader}>
            {headerText}
          </h3>
        );
        return;
      }

      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        flushParagraph(`p-${index}`);
        currentList.push(trimmed.replace(/^[*-]\s*/, ""));
        return;
      }

      currentParagraph.push(trimmed);
    });

    flushParagraph("p-final");
    flushList("l-final");

    return elements;
  };

  function formatInlineMarkdown(str: string): string {
    return str
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  if (!isOpen || !paper) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.topBar}>
            <div className={styles.titleTag}>
              <Sparkles size={14} />
              AI Paper Synthesis
            </div>
            <div className={styles.headerActions}>
              <button
                className={styles.actionIconBtn}
                title="API Settings"
                onClick={onOpenApiKeySettings}
              >
                <Key size={16} />
              </button>
              <button
                className={styles.actionIconBtn}
                title="Regenerate Summary"
                onClick={() => fetchOrGenerateSummary(true)}
                disabled={isStreaming}
              >
                <RefreshCw size={16} className={isStreaming ? styles.pulseDot : ""} />
              </button>
              <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">
                <X size={18} />
              </button>
            </div>
          </div>

          <h2 className={styles.paperTitle}>{paper.title}</h2>
          <p className={styles.paperMeta}>
            <span>{paper.authors?.slice(0, 4).join(", ") || "Unknown Authors"}</span>
            {paper.year && <span>• {paper.year}</span>}
            {paper.venue && <span>• {paper.venue}</span>}
          </p>

          <div className={styles.badgesRow}>
            {sourceType === "full_pdf" ? (
              <span className={`${styles.badge} ${styles.badgeFullPdf}`}>
                <FileText size={12} />
                Full-text PDF extracted {charCount > 0 ? `(${charCount.toLocaleString()} chars)` : ""}
              </span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeAbstract}`}>
                <BookOpen size={12} />
                Verified Abstract & Metadata {charCount > 0 ? `(${charCount.toLocaleString()} chars)` : ""}
              </span>
            )}
            <span className={`${styles.badge} ${styles.badgeModel}`}>
              <Cpu size={12} />
              Gemini 3.5 Flash
            </span>
            {isCached && (
              <span className={`${styles.badge} ${styles.badgeCached}`}>
                <Database size={12} />
                Saved in SQLite
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className={styles.contentScroll}>
          {isStreaming && (
            <div className={styles.streamingIndicator}>
              <span className={styles.pulseDot} />
              {summary ? "Synthesizing research findings..." : "Extracting paper content & generating analysis with Gemini..."}
            </div>
          )}

          {error ? (
            <div className={styles.errorBox}>
              <AlertTriangle size={36} color="#ef4444" />
              <h3 className={styles.errorTitle}>Could Not Generate Summary</h3>
              <p className={styles.errorMsg}>{error}</p>
              {onOpenApiKeySettings && (
                <button className={styles.errorBtn} onClick={onOpenApiKeySettings}>
                  Configure Gemini API Key
                </button>
              )}
            </div>
          ) : !summary && isStreaming ? (
            <div className={styles.skeletonContainer}>
              <div className={styles.skeletonLine} style={{ width: "45%", height: "24px" }} />
              <div className={styles.skeletonLine} style={{ width: "95%" }} />
              <div className={styles.skeletonLine} style={{ width: "88%" }} />
              <div className={styles.skeletonLine} style={{ width: "70%" }} />
              <div className={styles.skeletonLine} style={{ width: "40%", height: "24px", marginTop: "1rem" }} />
              <div className={styles.skeletonLine} style={{ width: "92%" }} />
              <div className={styles.skeletonLine} style={{ width: "85%" }} />
              <div className={styles.skeletonLine} style={{ width: "60%" }} />
            </div>
          ) : (
            <div className={styles.markdownBody}>
              {renderFormattedMarkdown(summary)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {summary && (
              <span>{summary.split(/\s+/).length} words • Grounded on paper content</span>
            )}
          </div>
          <div className={styles.footerRight}>
            <button className={styles.btnSecondary} onClick={handleCopy} disabled={!summary}>
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              {copied ? "Copied to Clipboard!" : "Copy Summary"}
            </button>
            <button className={styles.btnPrimary} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
