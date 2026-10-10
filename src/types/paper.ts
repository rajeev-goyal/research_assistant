export type ReadStatus = "unread" | "reading" | "completed";

export interface Author {
  name: string;
  order?: number;
}

export interface Paper {
  id: string; // e.g. "arxiv:2310.12345"
  title: string;
  abstract: string;
  authors: string[];
  year: number;
  publicationDate?: string;
  venue?: string;
  url: string;
  pdfUrl?: string;
  source: "arxiv" | "semanticscholar" | "manual" | "upload";
  citationCount?: number;
  readStatus?: ReadStatus;
  isSaved?: boolean;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  notesCount?: number;
}

export interface SearchResponse {
  query: string;
  total: number;
  page: number;
  limit: number;
  results: Paper[];
}

export interface LibraryPaper extends Paper {
  readStatus: ReadStatus;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  notesCount: number;
}
