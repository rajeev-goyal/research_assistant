import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SearchBar } from "@/components/SearchBar";
import { FilterBar } from "@/components/FilterBar";
import { PaperCard } from "@/components/PaperCard";
import { Paper } from "@/types/paper";

describe("Frontend UI Components", () => {
  describe("SearchBar Component", () => {
    it("renders search input and triggers onSearch when submitted", () => {
      const handleSearch = vi.fn();
      render(<SearchBar onSearch={handleSearch} initialQuery="" />);

      const input = screen.getByPlaceholderText(/Search 250M\+ papers/i);
      expect(input).toBeInTheDocument();

      fireEvent.change(input, { target: { value: "Graph Neural Networks" } });
      expect((input as HTMLInputElement).value).toBe("Graph Neural Networks");

      const form = input.closest("form");
      expect(form).not.toBeNull();
      fireEvent.submit(form!);

      expect(handleSearch).toHaveBeenCalledWith("Graph Neural Networks");
    });

    it("triggers onSearch with topic name when quick topic chip is clicked", () => {
      const handleSearch = vi.fn();
      render(<SearchBar onSearch={handleSearch} />);

      const chip = screen.getByText("Large Language Models");
      expect(chip).toBeInTheDocument();

      fireEvent.click(chip);
      expect(handleSearch).toHaveBeenCalledWith("Large Language Models");
    });

    it("clears search input when clear button is clicked", () => {
      const handleSearch = vi.fn();
      render(<SearchBar onSearch={handleSearch} initialQuery="CRISPR" />);

      const clearBtn = screen.getByTitle("Clear search query");
      expect(clearBtn).toBeInTheDocument();

      fireEvent.click(clearBtn);

      const input = screen.getByPlaceholderText(/Search 250M\+ papers/i) as HTMLInputElement;
      expect(input.value).toBe("");
    });
  });

  describe("FilterBar Component", () => {
    it("renders paper count and provider badge", () => {
      render(
        <FilterBar
          totalResults={1240}
          sortBy="relevance"
          onSortChange={vi.fn()}
          year=""
          onYearChange={vi.fn()}
          provider="all"
          onProviderChange={vi.fn()}
          providerUsed="OpenAlex"
        />
      );

      expect(screen.getByText(/1,240 papers found/i)).toBeInTheDocument();
      expect(screen.getByText("OpenAlex")).toBeInTheDocument();
    });

    it("triggers sort change callback when dropdown selection changes", () => {
      const handleSortChange = vi.fn();
      render(
        <FilterBar
          totalResults={5}
          sortBy="relevance"
          onSortChange={handleSortChange}
          year=""
          onYearChange={vi.fn()}
          provider="all"
          onProviderChange={vi.fn()}
        />
      );

      const sortSelect = screen.getByDisplayValue("Most Relevant");
      fireEvent.change(sortSelect, { target: { value: "date" } });

      expect(handleSortChange).toHaveBeenCalledWith("date");
    });

    it("triggers open access toggle when dropdown selection changes", () => {
      const handleOaChange = vi.fn();
      render(
        <FilterBar
          totalResults={10}
          sortBy="relevance"
          onSortChange={vi.fn()}
          year=""
          onYearChange={vi.fn()}
          provider="all"
          onProviderChange={vi.fn()}
          openAccessOnly={false}
          onOpenAccessChange={handleOaChange}
        />
      );

      const accessSelect = screen.getByDisplayValue("All Papers");
      fireEvent.change(accessSelect, { target: { value: "oa" } });

      expect(handleOaChange).toHaveBeenCalledWith(true);
    });
  });

  describe("PaperCard Component", () => {
    const testPaper: Paper = {
      id: "arxiv:2401.12345",
      title: "Self-Discover: Large Language Models Self-Compose Reasoning Structures",
      abstract: "We introduce SELF-DISCOVER, a general framework for LLMs to self-discover reasoning structures. By leveraging reasoning modules such as critical thinking and step-by-step decomposition, this method dramatically improves performance across challenging tasks.",
      authors: ["Pei Zhou", "Jay Pujara", "Xiang Ren"],
      year: 2024,
      venue: "arXiv preprint",
      url: "https://arxiv.org/abs/2401.12345",
      source: "arxiv",
      isSaved: false,
    };

    it("renders paper title, author list, and badges", () => {
      render(<PaperCard paper={testPaper} />);

      expect(screen.getByText(testPaper.title)).toBeInTheDocument();
      expect(screen.getByText("Pei Zhou, Jay Pujara, Xiang Ren")).toBeInTheDocument();
      expect(screen.getByText("2024")).toBeInTheDocument();
      expect(screen.getByText("arXiv preprint")).toBeInTheDocument();
    });

    it("toggles abstract expansion when Show full abstract is clicked", () => {
      render(<PaperCard paper={testPaper} />);

      const toggleBtn = screen.getByText(/Show full abstract/i);
      expect(toggleBtn).toBeInTheDocument();

      fireEvent.click(toggleBtn);
      expect(screen.getByText(/Show less/i)).toBeInTheDocument();
    });

    it("triggers onToggleSave when Save Paper button is clicked", async () => {
      const handleToggleSave = vi.fn().mockResolvedValue(undefined);
      render(<PaperCard paper={testPaper} onToggleSave={handleToggleSave} />);

      const saveBtn = screen.getByTitle("Save to Local Library");
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(handleToggleSave).toHaveBeenCalledWith(testPaper, false);
      expect(saveBtn).toHaveTextContent("Saved");
      expect(saveBtn).toHaveAttribute("title", "Remove from Library");
    });

    it("rolls back optimistic save state when onToggleSave rejects with an error", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const handleToggleSave = vi.fn().mockRejectedValue(new Error("Database write failure"));

      render(<PaperCard paper={{ ...testPaper, isSaved: false }} onToggleSave={handleToggleSave} />);

      const saveBtn = screen.getByTitle("Save to Local Library");
      expect(saveBtn).toHaveTextContent("Save Paper");

      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(handleToggleSave).toHaveBeenCalledWith(
        expect.objectContaining({ id: testPaper.id }),
        false
      );

      // Verify the state has rolled back to "Save Paper" / "Save to Local Library"
      expect(saveBtn).toHaveTextContent("Save Paper");
      expect(saveBtn).toHaveAttribute("title", "Save to Local Library");
      expect(saveBtn).not.toBeDisabled();

      consoleErrorSpy.mockRestore();
    });

    it("rolls back optimistic unsave state when onToggleSave rejects while removing", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const handleToggleSave = vi.fn().mockRejectedValue(new Error("Database delete failure"));

      render(<PaperCard paper={{ ...testPaper, isSaved: true }} onToggleSave={handleToggleSave} />);

      const saveBtn = screen.getByTitle("Remove from Library");
      expect(saveBtn).toHaveTextContent("Saved");

      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(handleToggleSave).toHaveBeenCalledWith(
        expect.objectContaining({ id: testPaper.id }),
        true
      );

      // Verify the state has rolled back to "Saved" / "Remove from Library"
      expect(saveBtn).toHaveTextContent("Saved");
      expect(saveBtn).toHaveAttribute("title", "Remove from Library");
      expect(saveBtn).not.toBeDisabled();

      consoleErrorSpy.mockRestore();
    });

    it("triggers onSelectForAI when AI Summary button is clicked", () => {
      const handleSelectForAI = vi.fn();
      render(<PaperCard paper={testPaper} onSelectForAI={handleSelectForAI} />);

      const summaryBtn = screen.getByTitle("Summarize paper content with Gemini LLM");
      fireEvent.click(summaryBtn);

      expect(handleSelectForAI).toHaveBeenCalledWith(testPaper);
    });

    it("renders selection checkbox when showCheckbox is enabled and triggers onToggleSelect", () => {
      const handleToggleSelect = vi.fn();
      render(
        <PaperCard
          paper={testPaper}
          showCheckbox={true}
          isSelected={false}
          onToggleSelect={handleToggleSelect}
        />
      );

      const checkbox = screen.getByTitle("Select paper");
      expect(checkbox).toBeInTheDocument();

      fireEvent.click(checkbox);
      expect(handleToggleSelect).toHaveBeenCalledWith(testPaper);
    });
  });
});
