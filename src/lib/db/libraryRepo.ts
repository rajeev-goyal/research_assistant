import { getDatabase } from "./index";
import { Paper, LibraryPaper, ReadStatus } from "@/types/paper";

export function getSavedPaperIds(ids: string[]): Set<string> {
  if (!ids.length) return new Set();
  const db = getDatabase();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT id FROM papers WHERE id IN (${placeholders})`)
    .all(...ids) as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

export function isPaperSaved(id: string): boolean {
  const db = getDatabase();
  const row = db.prepare("SELECT 1 FROM papers WHERE id = ?").get(id);
  return Boolean(row);
}

export function savePaper(paper: Paper): void {
  const db = getDatabase();

  const insertPaper = db.prepare(`
    INSERT INTO papers (
      id, title, abstract, year, publication_date, venue, url, pdf_url, source, citation_count, read_status, file_path, file_name, file_size, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      abstract = excluded.abstract,
      year = excluded.year,
      venue = excluded.venue,
      url = excluded.url,
      pdf_url = excluded.pdf_url,
      source = excluded.source,
      file_path = excluded.file_path,
      file_name = excluded.file_name,
      file_size = excluded.file_size,
      updated_at = datetime('now')
  `);

  const deleteAuthors = db.prepare(`DELETE FROM paper_authors WHERE paper_id = ?`);
  const insertAuthor = db.prepare(`
    INSERT INTO paper_authors (paper_id, name, author_order) VALUES (?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertPaper.run(
      paper.id,
      paper.title,
      paper.abstract || "",
      paper.year || null,
      paper.publicationDate || null,
      paper.venue || null,
      paper.url,
      paper.pdfUrl || null,
      paper.source || "arxiv",
      paper.citationCount || 0,
      paper.readStatus || "unread",
      paper.filePath || null,
      paper.fileName || null,
      paper.fileSize || null
    );

    deleteAuthors.run(paper.id);
    if (paper.authors && paper.authors.length) {
      paper.authors.forEach((name, idx) => {
        insertAuthor.run(paper.id, name, idx);
      });
    }
  });

  transaction();
}

export function savePapersBatch(papers: Paper[]): number {
  if (!papers.length) return 0;
  const db = getDatabase();

  const insertPaper = db.prepare(`
    INSERT INTO papers (
      id, title, abstract, year, publication_date, venue, url, pdf_url, source, citation_count, read_status, file_path, file_name, file_size, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      abstract = excluded.abstract,
      year = excluded.year,
      venue = excluded.venue,
      url = excluded.url,
      pdf_url = excluded.pdf_url,
      source = excluded.source,
      file_path = excluded.file_path,
      file_name = excluded.file_name,
      file_size = excluded.file_size,
      updated_at = datetime('now')
  `);

  const deleteAuthors = db.prepare(`DELETE FROM paper_authors WHERE paper_id = ?`);
  const insertAuthor = db.prepare(`
    INSERT INTO paper_authors (paper_id, name, author_order) VALUES (?, ?, ?)
  `);

  const batchTransaction = db.transaction(() => {
    for (const paper of papers) {
      insertPaper.run(
        paper.id,
        paper.title,
        paper.abstract || "",
        paper.year || null,
        paper.publicationDate || null,
        paper.venue || null,
        paper.url,
        paper.pdfUrl || null,
        paper.source || "arxiv",
        paper.citationCount || 0,
        paper.readStatus || "unread",
        paper.filePath || null,
        paper.fileName || null,
        paper.fileSize || null
      );

      deleteAuthors.run(paper.id);
      if (paper.authors && paper.authors.length) {
        paper.authors.forEach((name, idx) => {
          insertAuthor.run(paper.id, name, idx);
        });
      }
    }
  });

  batchTransaction();
  return papers.length;
}

export function deletePaper(id: string): void {
  const db = getDatabase();
  db.prepare("DELETE FROM papers WHERE id = ?").run(id);
}

export function updatePaperStatus(id: string, readStatus: ReadStatus): void {
  const db = getDatabase();
  db.prepare("UPDATE papers SET read_status = ?, updated_at = datetime('now') WHERE id = ?").run(
    readStatus,
    id
  );
}

export function getLibraryPapers(): LibraryPaper[] {
  const db = getDatabase();
  const papers = db
    .prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM notes n WHERE n.paper_id = p.id) as notesCount
      FROM papers p
      ORDER BY p.created_at DESC
    `)
    .all() as any[];

  if (!papers.length) return [];

  const authorsStmt = db.prepare(`
    SELECT paper_id, name FROM paper_authors ORDER BY author_order ASC
  `);
  const allAuthors = authorsStmt.all() as { paper_id: string; name: string }[];
  const authorMap = new Map<string, string[]>();
  for (const a of allAuthors) {
    if (!authorMap.has(a.paper_id)) authorMap.set(a.paper_id, []);
    authorMap.get(a.paper_id)!.push(a.name);
  }

  const tagsStmt = db.prepare(`
    SELECT pt.paper_id, t.name 
    FROM paper_tags pt 
    JOIN tags t ON pt.tag_id = t.id
  `);
  const allTags = tagsStmt.all() as { paper_id: string; name: string }[];
  const tagMap = new Map<string, string[]>();
  for (const t of allTags) {
    if (!tagMap.has(t.paper_id)) tagMap.set(t.paper_id, []);
    tagMap.get(t.paper_id)!.push(t.name);
  }

  return papers.map((p) => ({
    id: p.id,
    title: p.title,
    abstract: p.abstract || "",
    year: p.year,
    publicationDate: p.publication_date,
    venue: p.venue,
    url: p.url,
    pdfUrl: p.pdf_url,
    source: p.source,
    citationCount: p.citation_count || 0,
    readStatus: p.read_status as ReadStatus,
    filePath: p.file_path || undefined,
    fileName: p.file_name || undefined,
    fileSize: p.file_size || undefined,
    isSaved: true,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    authors: authorMap.get(p.id) || [],
    tags: tagMap.get(p.id) || [],
    notesCount: p.notesCount || 0,
  }));
}

export interface PaperSummaryRecord {
  paperId: string;
  title?: string;
  summary: string;
  model: string;
  sourceType: string;
  charCount: number;
  createdAt: string;
  updatedAt: string;
}

export function getPaperSummary(paperId: string): PaperSummaryRecord | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT paper_id, title, summary, model, source_type, char_count, created_at, updated_at
    FROM paper_summaries
    WHERE paper_id = ?
  `).get(paperId) as any;

  if (!row) return null;
  return {
    paperId: row.paper_id,
    title: row.title || undefined,
    summary: row.summary,
    model: row.model,
    sourceType: row.source_type,
    charCount: row.char_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function savePaperSummary(params: {
  paperId: string;
  title?: string;
  summary: string;
  model?: string;
  sourceType?: string;
  charCount?: number;
}): void {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO paper_summaries (paper_id, title, summary, model, source_type, char_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(paper_id) DO UPDATE SET
      title = excluded.title,
      summary = excluded.summary,
      model = excluded.model,
      source_type = excluded.source_type,
      char_count = excluded.char_count,
      updated_at = datetime('now')
  `);
  stmt.run(
    params.paperId,
    params.title || null,
    params.summary,
    params.model || "gemini-3.5-flash-lite",
    params.sourceType || "full_pdf",
    params.charCount || params.summary.length
  );
}

export function deletePaperSummary(paperId: string): void {
  const db = getDatabase();
  db.prepare(`DELETE FROM paper_summaries WHERE paper_id = ?`).run(paperId);
}

export interface ChatMessageRecord {
  id: number;
  paperId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export function getChatMessages(paperId: string): ChatMessageRecord[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, paper_id, role, content, created_at
    FROM chat_messages
    WHERE paper_id = ?
    ORDER BY created_at ASC, id ASC
  `).all(paperId) as any[];

  return rows.map((r) => ({
    id: r.id,
    paperId: r.paper_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
}

export function saveChatMessage(params: {
  paperId: string;
  role: "user" | "assistant" | "system";
  content: string;
}): ChatMessageRecord {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO chat_messages (paper_id, role, content)
    VALUES (?, ?, ?)
  `);
  const info = stmt.run(params.paperId, params.role, params.content);
  return {
    id: Number(info.lastInsertRowid),
    paperId: params.paperId,
    role: params.role,
    content: params.content,
    createdAt: new Date().toISOString(),
  };
}

export function clearChatMessages(paperId: string): void {
  const db = getDatabase();
  db.prepare(`DELETE FROM chat_messages WHERE paper_id = ?`).run(paperId);
}

