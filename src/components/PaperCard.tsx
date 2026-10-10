"use client";

import React, { useState } from "react";
import { Paper } from "@/types/paper";
import styles from "./PaperCard.module.css";
import {
  Bookmark,
  BookmarkCheck,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Award,
  Check,
} from "lucide-react";

interface PaperCardProps {
  paper: Paper;
  onToggleSave?: (paper: Paper, currentlySaved: boolean) => Promise<void>;
  onSelectForAI?: (paper: Paper) => void;
  isSelected?: boolean;
  onToggleSelect?: (paper: Paper) => void;
  showCheckbox?: boolean;
}

export const PaperCard: React.FC<PaperCardProps> = ({
  paper,
  onToggleSave,
  onSelectForAI,
  isSelected = false,
  onToggleSelect,
  showCheckbox = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(Boolean(paper.isSaved));

  React.useEffect(() => {
    setSaved(Boolean(paper.isSaved));
  }, [paper.isSaved]);

  const handleToggleSave = async () => {
    if (isSaving || !onToggleSave) return;
    setIsSaving(true);
    const nextState = !saved;
    setSaved(nextState); // optimistic update
    try {
      await onToggleSave(paper, saved);
    } catch (err) {
      // Revert if failed
      setSaved(saved);
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const authorDisplay =
    paper.authors && paper.authors.length > 0
      ? paper.authors.slice(0, 3).join(", ") +
        (paper.authors.length > 3 ? ` +${paper.authors.length - 3} more` : "")
      : "Unknown authors";

  return (
    <article
      className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
      id={`paper-${paper.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
    >
      <div className={styles.cardHeader}>
        {showCheckbox && (
          <div
            className={styles.checkboxContainer}
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleSelect) onToggleSelect(paper);
            }}
            title={isSelected ? "Deselect paper" : "Select paper"}
            id={`checkbox-wrap-${paper.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
          >
            <input
              type="checkbox"
              className={styles.checkboxInput}
              checked={isSelected}
              onChange={() => {}}
              id={`select-${paper.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
              aria-label={`Select ${paper.title}`}
            />
            <div className={`${styles.customCheckbox} ${isSelected ? styles.customCheckboxChecked : ""}`}>
              {isSelected && <Check size={12} strokeWidth={3} />}
            </div>
          </div>
        )}

        <div className={styles.titleArea}>
          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.title}
            title="Open paper page"
          >
            {paper.title}
          </a>

          <div className={styles.metaRow}>
            <span className={styles.authors}>{authorDisplay}</span>
            <span>•</span>
            <span className="badge badge-indigo">{paper.year}</span>
            {paper.source === "upload" && (
              <span className="badge badge-emerald" title={paper.fileName || "Uploaded PDF"}>
                Uploaded PDF
              </span>
            )}
            {paper.venue && paper.source !== "upload" && (
              <span className="badge" title={paper.venue}>
                {paper.venue.length > 28 ? `${paper.venue.slice(0, 28)}...` : paper.venue}
              </span>
            )}
            {paper.citationCount !== undefined && paper.citationCount > 0 && (
              <span className="badge badge-amber" title="Citation count">
                <Award size={11} />
                {paper.citationCount.toLocaleString()} citations
              </span>
            )}
          </div>
        </div>

        <button
          className={`${styles.saveBtn} ${saved ? styles.saveBtnSaved : styles.saveBtnUnsaved}`}
          onClick={handleToggleSave}
          disabled={isSaving}
          id={`btn-save-${paper.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
          title={saved ? "Remove from Library" : "Save to Local Library"}
        >
          {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          <span>{saved ? "Saved" : "Save Paper"}</span>
        </button>
      </div>

      <div className={styles.abstractArea}>
        <p className={expanded ? "" : styles.abstractCollapsed}>
          {paper.abstract || "No abstract available."}
        </p>
        {paper.abstract && paper.abstract.length > 180 && (
          <button
            className={styles.toggleAbstractBtn}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp size={14} /> Show less
              </>
            ) : (
              <>
                <ChevronDown size={14} /> Show full abstract
              </>
            )}
          </button>
        )}
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.linksGroup}>
          {paper.pdfUrl && (
            <a
              href={paper.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ padding: "0.4rem 0.85rem", fontSize: "0.8rem" }}
              id={`btn-pdf-${paper.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
            >
              <FileText size={14} color="#06b6d4" />
              <span>Read PDF</span>
            </a>
          )}

          <a
            href={paper.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost"
            style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}
          >
            <ExternalLink size={14} />
            <span>View Source</span>
          </a>
        </div>

        {onSelectForAI && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: "0.8rem", color: "#a5b4fc" }}
            onClick={() => onSelectForAI(paper)}
            title="Inspect with AI Assistant"
          >
            <Sparkles size={14} />
            <span>AI Insights</span>
          </button>
        )}
      </div>
    </article>
  );
};
