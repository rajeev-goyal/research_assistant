import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchArxiv } from "@/lib/arxiv";

describe("arXiv Literature Client - searchArxiv", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return empty result set without network call if query is empty or whitespace", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const emptyResult = await searchArxiv({ query: "" });
    expect(emptyResult.results).toEqual([]);
    expect(emptyResult.total).toBe(0);

    const spaceResult = await searchArxiv({ query: "   \n\t  " });
    expect(spaceResult.results).toEqual([]);
    expect(spaceResult.total).toBe(0);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should format query with field prefixes properly", async () => {
    const mockXml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
        <opensearch:totalResults>1</opensearch:totalResults>
        <entry>
          <id>http://arxiv.org/abs/2401.00001v1</id>
          <title>Diffusion Transformers for Video</title>
          <summary>We explore diffusion transformers scaling.</summary>
          <published>2024-01-10T12:00:00Z</published>
          <author><name>Jane Doe</name></author>
          <link rel="alternate" type="text/html" href="http://arxiv.org/abs/2401.00001v1"/>
          <link title="pdf" rel="related" type="application/pdf" href="http://arxiv.org/pdf/2401.00001v1"/>
        </entry>
      </feed>`;

    let requestedUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (urlInput) => {
      requestedUrl = urlInput.toString();
      return new Response(mockXml, { status: 200 });
    });

    // Test with title filter
    await searchArxiv({ query: "diffusion", field: "title", page: 2, limit: 10 });
    expect(requestedUrl).toContain("search_query=ti%3A%22diffusion%22");
    expect(requestedUrl).toContain("start=10");
    expect(requestedUrl).toContain("max_results=10");

    // Test with author filter
    await searchArxiv({ query: "lecun", field: "author" });
    expect(requestedUrl).toContain("search_query=au%3A%22lecun%22");

    // Test with abstract filter
    await searchArxiv({ query: "transformer", field: "abstract" });
    expect(requestedUrl).toContain("search_query=abs%3A%22transformer%22");
  });

  it("should parse arXiv Atom XML correctly into structured Paper objects", async () => {
    const mockXml = `<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
        <opensearch:totalResults>2</opensearch:totalResults>
        <entry>
          <id>http://arxiv.org/abs/2303.18223v1</id>
          <title>
            A Survey of Large Language Models &amp; Reasoning
          </title>
          <summary>
            Large Language Models (LLMs) have demonstrated remarkable capabilities &quot;in-context&quot;.
          </summary>
          <published>2023-03-31T18:00:00Z</published>
          <author><name>Wayne Xin Zhao</name></author>
          <author><name>Kun Zhou</name></author>
          <link rel="alternate" type="text/html" href="http://arxiv.org/abs/2303.18223v1"/>
          <link title="pdf" rel="related" type="application/pdf" href="http://arxiv.org/pdf/2303.18223v1"/>
          <arxiv:journal_ref xmlns:arxiv="http://arxiv.org/schemas/atom">arXiv:2303.18223</arxiv:journal_ref>
        </entry>
      </feed>`;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(mockXml, { status: 200 }));

    const res = await searchArxiv({ query: "large language models" });
    expect(res.total).toBe(2);
    expect(res.results).toHaveLength(1);

    const paper = res.results[0];
    expect(paper.id).toBe("arxiv:2303.18223v1");
    expect(paper.title).toBe("A Survey of Large Language Models & Reasoning");
    expect(paper.abstract).toBe('Large Language Models (LLMs) have demonstrated remarkable capabilities "in-context".');
    expect(paper.authors).toEqual(["Wayne Xin Zhao", "Kun Zhou"]);
    expect(paper.year).toBe(2023);
    expect(paper.publicationDate).toBe("2023-03-31");
    expect(paper.url).toBe("http://arxiv.org/abs/2303.18223v1");
    expect(paper.pdfUrl).toBe("http://arxiv.org/pdf/2303.18223v1");
    expect(paper.source).toBe("arxiv");
  });

  it("should handle HTTP errors gracefully from arXiv export API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Service Unavailable", { status: 503, statusText: "Service Unavailable" })
    );

    await expect(searchArxiv({ query: "machine learning" })).rejects.toThrow(
      "arXiv API responded with status 503"
    );
  });
});

