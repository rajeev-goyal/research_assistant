import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as uploadFileGet } from "@/app/api/uploads/[filename]/route";
import fs from "fs";
import path from "path";
import { UPLOADS_DIR } from "@/lib/db";

describe("Static File Serving & Binary Streaming - GET /api/uploads/[filename]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should serve an existing PDF file with HTTP 200, application/pdf, and inline disposition headers", async () => {
    const mockPdfBuffer = Buffer.from("%PDF-1.4 mock binary stream content for research paper");
    const filename = "sample_paper_12345.pdf";
    const expectedFilePath = path.join(UPLOADS_DIR, filename);

    vi.spyOn(fs, "existsSync").mockImplementation((p) => p === expectedFilePath);
    vi.spyOn(fs.promises, "readFile").mockResolvedValue(mockPdfBuffer);

    const req = new NextRequest(`http://localhost:3000/api/uploads/${filename}`);
    const context = { params: Promise.resolve({ filename }) };

    const response = await uploadFileGet(req, context);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(`inline; filename="${filename}"`);
    expect(response.headers.get("Cache-Control")).toContain("public, max-age=31536000, immutable");

    const arrayBuffer = await response.arrayBuffer();
    expect(Buffer.from(arrayBuffer)).toEqual(mockPdfBuffer);
  });

  it("should return HTTP 404 with descriptive error message when file does not exist on disk", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const filename = "non_existent_paper.pdf";
    const req = new NextRequest(`http://localhost:3000/api/uploads/${filename}`);
    const context = { params: Promise.resolve({ filename }) };

    const response = await uploadFileGet(req, context);

    expect(response.status).toBe(404);
    const text = await response.text();
    expect(text).toBe("PDF File Not Found");
  });

  it("should prevent directory traversal attacks (e.g. ../../../etc/passwd) by resolving only the basename", async () => {
    const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const maliciousPath = "../../../etc/passwd";
    const req = new NextRequest(`http://localhost:3000/api/uploads/${encodeURIComponent(maliciousPath)}`);
    const context = { params: Promise.resolve({ filename: maliciousPath }) };

    const response = await uploadFileGet(req, context);

    // Security invariant: path.basename should sanitize the traversal attempt to just "passwd"
    // and query UPLOADS_DIR/passwd, never escaping into root system paths
    expect(existsSyncSpy).toHaveBeenCalledWith(path.join(UPLOADS_DIR, "passwd"));
    expect(existsSyncSpy).not.toHaveBeenCalledWith("/etc/passwd");
    expect(response.status).toBe(404);
  });

  it("should return HTTP 500 when an unhandled filesystem I/O error occurs", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const filename = "io_error_paper.pdf";
    const expectedFilePath = path.join(UPLOADS_DIR, filename);

    vi.spyOn(fs, "existsSync").mockImplementation((p) => p === expectedFilePath);
    vi.spyOn(fs.promises, "readFile").mockRejectedValue(new Error("EIO: i/o error reading disk sector"));

    const req = new NextRequest(`http://localhost:3000/api/uploads/${filename}`);
    const context = { params: Promise.resolve({ filename }) };

    const response = await uploadFileGet(req, context);

    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toBe("Error reading PDF file");

    consoleErrorSpy.mockRestore();
  });
});

