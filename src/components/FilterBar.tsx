"use client";

import React from "react";
import styles from "./FilterBar.module.css";
import { SlidersHorizontal, Sparkles } from "lucide-react";

interface FilterBarProps {
  totalResults: number;
  sortBy: "relevance" | "date";
  onSortChange: (sort: "relevance" | "date") => void;
  year: string;
  onYearChange: (year: string) => void;
  provider: "all" | "openalex" | "arxiv";
  onProviderChange: (provider: "all" | "openalex" | "arxiv") => void;
  providerUsed?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  totalResults,
  sortBy,
  onSortChange,
  year,
  onYearChange,
  provider,
  onProviderChange,
  providerUsed,
}) => {
  return (
    <div className={styles.filterBar}>
      <div className={styles.leftGroup}>
        <span className={styles.resultsCount}>
          {totalResults.toLocaleString()} {totalResults === 1 ? "paper" : "papers"} found
        </span>
        {providerUsed && (
          <span className="badge badge-indigo">
            <Sparkles size={11} />
            {providerUsed}
          </span>
        )}
      </div>

      <div className={styles.rightGroup}>
        <div className={styles.selectWrapper}>
          <SlidersHorizontal size={14} />
          <span>Sort:</span>
          <select
            className={styles.select}
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as "relevance" | "date")}
            id="select-sort-by"
          >
            <option value="relevance">Most Relevant</option>
            <option value="date">Most Recent</option>
          </select>
        </div>

        <div className={styles.selectWrapper}>
          <span>Year:</span>
          <select
            className={styles.select}
            value={year}
            onChange={(e) => onYearChange(e.target.value)}
            id="select-year-filter"
          >
            <option value="all">Any Year</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
            <option value="2023">2023</option>
            <option value="2022">2022</option>
            <option value="2020">2020</option>
          </select>
        </div>

        <div className={styles.selectWrapper}>
          <span>Source:</span>
          <select
            className={styles.select}
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as "all" | "openalex" | "arxiv")}
            id="select-provider"
          >
            <option value="all">OpenAlex (Global Index)</option>
            <option value="arxiv">arXiv (Pre-prints)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
