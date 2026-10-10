"use client";

import React from "react";
import styles from "./PaperCard.module.css";

export const SearchSkeleton: React.FC = () => {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className={styles.card} style={{ opacity: 0.8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div className="skeleton" style={{ height: "24px", width: "75%" }} />
              <div className="skeleton" style={{ height: "16px", width: "40%" }} />
            </div>
            <div className="skeleton" style={{ height: "36px", width: "100px", borderRadius: "10px" }} />
          </div>
          <div className="skeleton" style={{ height: "64px", width: "100%", borderRadius: "8px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "0.75rem" }}>
            <div className="skeleton" style={{ height: "30px", width: "180px", borderRadius: "8px" }} />
            <div className="skeleton" style={{ height: "30px", width: "80px", borderRadius: "8px" }} />
          </div>
        </div>
      ))}
    </div>
  );
};
