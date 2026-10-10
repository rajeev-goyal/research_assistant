"use client";

import React, { useState, useRef, useEffect } from "react";
import styles from "./UploadModal.module.css";
import { Paper } from "@/types/paper";
import {
  UploadCloud,
  X,
  FileCheck2,
  AlertCircle,
  Sparkles,
  BookOpen,
  ArrowRight,
} from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (paper: Paper) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedPaper, setUploadedPaper] = useState<Paper | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setUploadedPaper(null);
      setIsUploading(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isUploading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isUploading, onClose]);

  if (!isOpen) return null;

  const handleUploadFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Please select a valid PDF file (.pdf)");
      return;
    }

    if (file.size > 35 * 1024 * 1024) {
      setError("File is too large. Maximum size is 35MB.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to parse and upload paper.");
      }

      setUploadedPaper(data.paper);
      onUploadSuccess(data.paper);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to upload and extract PDF.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUploadFile(e.target.files[0]);
    }
  };

  return (
    <div className={styles.overlay} onClick={() => !isUploading && onClose()}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        id="modal-upload-paper"
      >
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>
              <UploadCloud size={24} color="#6366f1" />
              <span>Upload Research Paper</span>
            </h3>
            <p className={styles.subtitle}>
              Upload any PDF paper. Our pipeline will automatically extract the title, authors, year,
              and abstract into your local library.
            </p>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            disabled={isUploading}
            id="btn-close-upload-modal"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* Upload State 1: Dropzone */}
        {!isUploading && !uploadedPaper && (
          <div>
            <div
              className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              id="dropzone-pdf-upload"
            >
              <div className={styles.uploadIcon}>
                <UploadCloud size={28} />
              </div>
              <div>
                <p className={styles.dropzoneText}>Drag & drop PDF here, or click to browse</p>
                <p className={styles.dropzoneSubtext}>Supports academic preprints, conference proceedings & journal articles (up to 35MB)</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: "0.5rem" }}
              >
                Choose PDF File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className={styles.fileInput}
                onChange={handleFileChange}
                id="input-file-pdf"
              />
            </div>
          </div>
        )}

        {/* Upload State 2: Processing & Extraction */}
        {isUploading && (
          <div className={styles.processingBox}>
            <div className={styles.spinner} />
            <h4 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Extracting Paper Metadata...</h4>
            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", maxWidth: "420px" }}>
              Parsing PDF text streams to extract title, author roster, publication year, and abstract section.
            </p>
          </div>
        )}

        {/* Upload State 3: Success & Extracted Metadata Preview */}
        {uploadedPaper && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#6ee7b7", fontSize: "0.9rem" }}>
              <FileCheck2 size={18} />
              <strong>Successfully Extracted & Saved to Library!</strong>
            </div>

            <div className={styles.previewBox}>
              <h4 className={styles.previewTitle}>{uploadedPaper.title}</h4>
              <div className={styles.previewMeta}>
                <span><strong>Authors:</strong> {uploadedPaper.authors.join(", ") || "Unknown"}</span>
                <span>•</span>
                <span className="badge badge-indigo">{uploadedPaper.year}</span>
                <span className="badge badge-emerald">Local PDF</span>
              </div>
              <p className={styles.previewAbstract}>{uploadedPaper.abstract}</p>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setUploadedPaper(null)}
              >
                Upload Another
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                }}
                id="btn-confirm-uploaded-paper"
              >
                <BookOpen size={16} />
                <span>View in My Library</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
