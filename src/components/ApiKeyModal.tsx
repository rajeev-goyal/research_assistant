"use client";

import React, { useState, useEffect } from "react";
import { Key, X, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import styles from "./ApiKeyModal.module.css";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: () => void;
}

export function ApiKeyModal({ isOpen, onClose, onKeySaved }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [isServerConfigured, setIsServerConfigured] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Check stored custom key
      const stored = localStorage.getItem("gemini_api_key") || "";
      setApiKey(stored);
      setSaveSuccess(false);

      // Check server status
      fetch("/api/ai/status")
        .then((res) => res.json())
        .then((data) => {
          setIsServerConfigured(Boolean(data.configured));
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (apiKey.trim()) {
      localStorage.setItem("gemini_api_key", apiKey.trim());
    } else {
      localStorage.removeItem("gemini_api_key");
    }
    setSaveSuccess(true);
    setTimeout(() => {
      onKeySaved?.();
      onClose();
    }, 600);
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <div className={styles.iconWrapper}>
              <Key size={18} />
            </div>
            <h3 className={styles.title}>Gemini API Settings</h3>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          {isServerConfigured ? (
            <div className={styles.statusCard}>
              <CheckCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>Connected via Environment:</strong> A valid Gemini API key is detected in the backend. AI summarization is active and ready.
              </div>
            </div>
          ) : (
            <div className={`${styles.statusCard} ${styles.statusCardWarning}`}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>No Key Detected:</strong> Enter your Google Gemini API key below to unlock AI summaries.
              </div>
            </div>
          )}

          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="gemini-key-input">
              {isServerConfigured ? "Custom Override API Key (Optional)" : "Gemini API Key"}
            </label>
            <p className={styles.hint}>
              Don't have a key? Get one for free at{" "}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className={styles.link}
              >
                Google AI Studio <ExternalLink size={12} style={{ display: "inline", verticalAlign: "middle" }} />
              </a>
              . Your key is saved locally in your browser.
            </p>
            <input
              id="gemini-key-input"
              type="password"
              className={styles.input}
              placeholder="Paste AIzaSy... key here"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.saveBtn} onClick={handleSave}>
            {saveSuccess ? "Saved!" : "Save Key"}
          </button>
        </div>
      </div>
    </div>
  );
}
