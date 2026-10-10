"use client";

import React, { useState, useEffect } from "react";
import styles from "./SearchBar.module.css";
import { Search, X, ArrowRight } from "lucide-react";

interface SearchBarProps {
  initialQuery?: string;
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

const QUICK_TOPICS = [
  "Large Language Models",
  "Quantum Error Correction",
  "Reinforcement Learning",
  "CRISPR Cas9",
  "Diffusion Generative Models",
  "Graph Neural Networks",
];

export const SearchBar: React.FC<SearchBarProps> = ({
  initialQuery = "",
  onSearch,
  isLoading = false,
}) => {
  const [query, setQuery] = useState(initialQuery);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleChipClick = (topic: string) => {
    setQuery(topic);
    onSearch(topic);
  };

  return (
    <div className={styles.searchContainer}>
      <form onSubmit={handleSubmit} className={styles.inputWrapper}>
        <Search size={20} className={styles.searchIcon} />
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search 250M+ papers by keyword, topic, or title..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          id="input-paper-search"
        />
        {query && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => setQuery("")}
            title="Clear search query"
            id="btn-clear-search"
          >
            <X size={16} />
          </button>
        )}
        <button
          type="submit"
          className={`btn btn-primary ${styles.submitBtn}`}
          disabled={isLoading || !query.trim()}
          id="btn-submit-search"
        >
          <span>{isLoading ? "Searching..." : "Search"}</span>
          <ArrowRight size={15} />
        </button>
      </form>

      <div className={styles.topicChips}>
        <span className={styles.topicLabel}>Quick Topics:</span>
        {QUICK_TOPICS.map((topic) => (
          <button
            key={topic}
            type="button"
            className={styles.chip}
            onClick={() => handleChipClick(topic)}
          >
            {topic}
          </button>
        ))}
      </div>
    </div>
  );
};
