"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  X,
  Copy,
  Check,
  RefreshCw,
  FileText,
  BookOpen,
  Cpu,
  Database,
  AlertTriangle,
  Key,
  MessageSquare,
  Send,
  Trash2,
  User,
  Bot,
  HelpCircle,
} from "lucide-react";
import { Paper } from "@/types/paper";
import styles from "./SummaryModal.module.css";

interface SummaryModalProps {
  paper: Paper | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenApiKeySettings?: () => void;
  initialTab?: "summary" | "chat";
}

interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

const HANDOUT_SUGGESTED_QUESTIONS = [
  "What problem does this paper address?",
  "What is the main idea of the proposed approach?",
  "What datasets are used?",
  "What are the major limitations?",
  "How does this method compare with the baselines?",
];

export function SummaryModal({
  paper,
  isOpen,
  onClose,
  onOpenApiKeySettings,
  initialTab = "summary",
}: SummaryModalProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "chat">(initialTab);

  // Summary State
  const [summary, setSummary] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [sourceType, setSourceType] = useState<"full_pdf" | "abstract" | "partial">("full_pdf");
  const [charCount, setCharCount] = useState<number>(0);
  const [model, setModel] = useState<string>("gemini-3.5-flash-lite");
  const [isCached, setIsCached] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Chat / Q&A State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>("");
  const [isChatStreaming, setIsChatStreaming] = useState<boolean>(false);
  const [streamingAnswer, setStreamingAnswer] = useState<string>("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isClearingChat, setIsClearingChat] = useState<boolean>(false);
  const [clearedNotice, setClearedNotice] = useState<boolean>(false);
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  const summaryAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync initial tab when opened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab, paper?.id]);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Load summary and chat history when modal opens with a paper
  useEffect(() => {
    if (!isOpen || !paper) {
      if (summaryAbortRef.current) summaryAbortRef.current.abort();
      if (chatAbortRef.current) chatAbortRef.current.abort();
      return;
    }

    fetchOrGenerateSummary(false);
    fetchChatHistory(paper.id);

    return () => {
      if (summaryAbortRef.current) summaryAbortRef.current.abort();
      if (chatAbortRef.current) chatAbortRef.current.abort();
    };
  }, [isOpen, paper?.id]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeTab === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, streamingAnswer, activeTab]);

  // Auto-reset confirmation state after 5 seconds if not confirmed
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 5000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  // SUMMARY LOGIC
  const fetchOrGenerateSummary = async (forceRefresh = false) => {
    if (!paper) return;

    if (summaryAbortRef.current) {
      summaryAbortRef.current.abort();
    }
    const controller = new AbortController();
    summaryAbortRef.current = controller;

    setSummaryError(null);
    setCopied(false);

    if (!forceRefresh) {
      try {
        const cacheRes = await fetch(`/api/ai/summarize?paperId=${encodeURIComponent(paper.id)}`, {
          signal: controller.signal,
        });
        if (cacheRes.ok) {
          const cacheData = await cacheRes.json();
          if (cacheData?.summary?.summary) {
            setSummary(cacheData.summary.summary);
            setSourceType(cacheData.summary.sourceType || "full_pdf");
            setCharCount(cacheData.summary.charCount || cacheData.summary.summary.length);
            setModel(cacheData.summary.model || "gemini-3.5-flash-lite");
            setIsCached(true);
            setIsStreaming(false);
            return;
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
      }
    }

    setSummary("");
    setIsStreaming(true);
    setIsCached(false);

    try {
      const storedKey = typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") || undefined : undefined;

      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paper,
          apiKey: storedKey,
          forceRefresh,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to generate summary`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        setSummary(json.summary || "");
        setSourceType(json.sourceType || "full_pdf");
        setModel(json.model || "gemini-3.5-flash-lite");
        setIsCached(Boolean(json.cached));
        setIsStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body stream");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "meta") {
              setSourceType(event.sourceType || "full_pdf");
              setCharCount(event.charCount || 0);
              setModel(event.model || "gemini-3.5-flash-lite");
            } else if (event.type === "chunk" && event.text) {
              accumulated += event.text;
              setSummary(accumulated);
            } else if (event.type === "done") {
              setSummary(event.fullSummary || accumulated);
              setIsStreaming(false);
            } else if (event.type === "error") {
              throw new Error(event.message || "An error occurred during summarization.");
            }
          } catch (e: any) {
            if (e.message && e.message.includes("An error")) {
              throw e;
            }
          }
        }
      }

      setIsStreaming(false);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setSummaryError(err?.message || "Failed to generate summary");
      setIsStreaming(false);
    }
  };

  // CHAT / Q&A LOGIC
  const fetchChatHistory = async (paperId: string) => {
    try {
      const res = await fetch(`/api/ai/chat?paperId=${encodeURIComponent(paperId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          setChatMessages(data.messages);
        }
      }
    } catch (err) {
      console.warn("[SummaryModal] Could not load chat history:", err);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const question = (textToSend || inputMessage).trim();
    if (!question || isChatStreaming || !paper) return;

    setInputMessage("");
    setChatError(null);

    // Optimistic user bubble
    const userMsg: ChatMessage = { role: "user", content: question };
    setChatMessages((prev) => [...prev, userMsg]);

    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
    }
    const controller = new AbortController();
    chatAbortRef.current = controller;

    setIsChatStreaming(true);
    setStreamingAnswer("");

    try {
      const storedKey = typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") || undefined : undefined;

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper,
          message: question,
          apiKey: storedKey,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Failed to get answer`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "chunk" && event.text) {
              accumulated += event.text;
              setStreamingAnswer(accumulated);
            } else if (event.type === "done") {
              const fullAns = event.fullAnswer || accumulated;
              setChatMessages((prev) => [...prev, { role: "assistant", content: fullAns }]);
              setStreamingAnswer("");
              setIsChatStreaming(false);
            } else if (event.type === "error") {
              throw new Error(event.message || "An error occurred during response generation.");
            }
          } catch (e: any) {
            if (e.message && e.message.includes("An error")) {
              throw e;
            }
          }
        }
      }

      if (accumulated && isChatStreaming) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: accumulated }]);
        setStreamingAnswer("");
        setIsChatStreaming(false);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setChatError(err?.message || "Failed to get answer");
      setIsChatStreaming(false);
      setStreamingAnswer("");
    }
  };

  const executeClearChat = async () => {
    if (!paper || isClearingChat) return;

    if (chatAbortRef.current) {
      chatAbortRef.current.abort();
    }
    setIsChatStreaming(false);
    setIsClearingChat(true);
    setConfirmClear(false);

    try {
      const res = await fetch(`/api/ai/chat?paperId=${encodeURIComponent(paper.id)}`, { method: "DELETE" });
      if (res.ok) {
        setChatMessages([]);
        setStreamingAnswer("");
        setChatError(null);
        setClearedNotice(true);
        setTimeout(() => setClearedNotice(false), 3000);
      }
    } catch (err) {
      console.error("Failed to clear chat:", err);
    } finally {
      setIsClearingChat(false);
    }
  };

  const handleClearChat = () => {
    if (chatMessages.length === 0) return;
    setConfirmClear(true);
  };

  const handleCopy = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const renderFormattedMarkdown = (text: string) => {
    if (!text) return null;

    const rawLines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let currentList: string[] = [];
    let currentParagraph: string[] = [];

    const flushParagraph = (key: string) => {
      if (currentParagraph.length > 0) {
        const pText = currentParagraph.join(" ").trim();
        if (pText) {
          elements.push(
            <p
              key={key}
              className={styles.paragraph}
              dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(pText) }}
            />
          );
        }
        currentParagraph = [];
      }
    };

    const flushList = (key: string) => {
      if (currentList.length > 0) {
        elements.push(
          <ul key={key} className={styles.list}>
            {currentList.map((item, idx) => (
              <li
                key={idx}
                className={styles.listItem}
                dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(item) }}
              />
            ))}
          </ul>
        );
        currentList = [];
      }
    };

    rawLines.forEach((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph(`p-${index}`);
        flushList(`l-${index}`);
        return;
      }

      if (trimmed.startsWith("###") || trimmed.startsWith("##") || trimmed.startsWith("#")) {
        flushParagraph(`p-${index}`);
        flushList(`l-${index}`);
        const headerText = trimmed.replace(/^#+\s*/, "");
        elements.push(
          <h3 key={`h-${index}`} className={styles.sectionHeader}>
            {headerText}
          </h3>
        );
        return;
      }

      if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
        flushParagraph(`p-${index}`);
        currentList.push(trimmed.replace(/^[*-]\s*/, ""));
        return;
      }

      currentParagraph.push(trimmed);
    });

    flushParagraph("p-final");
    flushList("l-final");

    return elements;
  };

  function formatInlineMarkdown(str: string): string {
    return str
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  if (!isOpen || !paper) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className={styles.header}>
          <div className={styles.topBar}>
            <div className={styles.titleTag}>
              <Sparkles size={14} />
              AI Paper Workspace
            </div>
            <div className={styles.headerActions}>
              <button
                className={styles.actionIconBtn}
                title="API Key Settings"
                onClick={onOpenApiKeySettings}
              >
                <Key size={16} />
              </button>
              {activeTab === "summary" ? (
                <button
                  className={styles.actionIconBtn}
                  title="Regenerate Summary"
                  onClick={() => fetchOrGenerateSummary(true)}
                  disabled={isStreaming}
                >
                  <RefreshCw size={16} className={isStreaming ? styles.pulseDot : ""} />
                </button>
              ) : (
                <button
                  className={styles.actionIconBtn}
                  title="Clear Chat History"
                  onClick={handleClearChat}
                  disabled={chatMessages.length === 0 || isChatStreaming}
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">
                <X size={18} />
              </button>
            </div>
          </div>

          <h2 className={styles.paperTitle}>{paper.title}</h2>
          <p className={styles.paperMeta}>
            <span>{paper.authors?.slice(0, 4).join(", ") || "Unknown Authors"}</span>
            {paper.year && <span>• {paper.year}</span>}
            {paper.venue && <span>• {paper.venue}</span>}
          </p>

          <div className={styles.badgesRow}>
            {activeTab === "summary" && (
              sourceType === "full_pdf" ? (
                <span className={`${styles.badge} ${styles.badgeFullPdf}`}>
                  <FileText size={12} />
                  Full-text PDF extracted {charCount > 0 ? `(${charCount.toLocaleString()} chars)` : ""}
                </span>
              ) : (
                <span className={`${styles.badge} ${styles.badgeAbstract}`}>
                  <BookOpen size={12} />
                  Verified Abstract & Metadata {charCount > 0 ? `(${charCount.toLocaleString()} chars)` : ""}
                </span>
              )
            )}
            <span className={`${styles.badge} ${styles.badgeModel}`}>
              <Cpu size={12} />
              Gemini 3.5 Flash
            </span>
            {activeTab === "summary" && isCached && (
              <span className={`${styles.badge} ${styles.badgeCached}`}>
                <Database size={12} />
                Saved in SQLite
              </span>
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className={styles.tabsBar}>
          <div className={styles.tabButtonsGroup}>
            <button
              className={`${styles.tabBtn} ${activeTab === "summary" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("summary")}
              id="tab-summary"
            >
              <BookOpen size={15} />
              <span>Summary & Synthesis</span>
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === "chat" ? styles.tabBtnActive : ""}`}
              onClick={() => setActiveTab("chat")}
              id="tab-chat"
            >
              <MessageSquare size={15} />
              <span>Ask Questions ({chatMessages.length})</span>
            </button>
          </div>

          {activeTab === "chat" && chatMessages.length > 0 && (
            confirmClear ? (
              <div className={styles.confirmClearGroup}>
                <span className={styles.confirmClearPrompt}>Clear messages?</span>
                <button
                  className={styles.confirmClearYesBtn}
                  onClick={executeClearChat}
                  disabled={isClearingChat}
                  id="btn-confirm-clear-yes"
                >
                  <Trash2 size={12} />
                  <span>Yes, Clear</span>
                </button>
                <button
                  className={styles.confirmClearCancelBtn}
                  onClick={() => setConfirmClear(false)}
                  id="btn-confirm-clear-cancel"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className={styles.clearChatBtn}
                onClick={handleClearChat}
                disabled={isClearingChat || isChatStreaming}
                title="Clear conversation history for this paper"
                id="btn-clear-chat-history"
              >
                <Trash2 size={13} />
                <span>{isClearingChat ? "Clearing..." : "Clear History"}</span>
              </button>
            )
          )}
        </div>

        {/* TAB 1: SUMMARY */}
        {activeTab === "summary" && (
          <>
            <div className={styles.contentScroll}>
              {isStreaming && (
                <div className={styles.streamingIndicator}>
                  <span className={styles.pulseDot} />
                  {summary ? "Synthesizing research findings..." : "Extracting paper content & generating analysis with Gemini..."}
                </div>
              )}

              {summaryError ? (
                <div className={styles.errorBox}>
                  <AlertTriangle size={36} color="#ef4444" />
                  <h3 className={styles.errorTitle}>Could Not Generate Summary</h3>
                  <p className={styles.errorMsg}>{summaryError}</p>
                  {onOpenApiKeySettings && (
                    <button className={styles.errorBtn} onClick={onOpenApiKeySettings}>
                      Configure Gemini API Key
                    </button>
                  )}
                </div>
              ) : !summary && isStreaming ? (
                <div className={styles.skeletonContainer}>
                  <div className={styles.skeletonLine} style={{ width: "45%", height: "24px" }} />
                  <div className={styles.skeletonLine} style={{ width: "95%" }} />
                  <div className={styles.skeletonLine} style={{ width: "88%" }} />
                  <div className={styles.skeletonLine} style={{ width: "70%" }} />
                  <div className={styles.skeletonLine} style={{ width: "40%", height: "24px", marginTop: "1rem" }} />
                  <div className={styles.skeletonLine} style={{ width: "92%" }} />
                  <div className={styles.skeletonLine} style={{ width: "85%" }} />
                  <div className={styles.skeletonLine} style={{ width: "60%" }} />
                </div>
              ) : (
                <div className={styles.markdownBody}>
                  {renderFormattedMarkdown(summary)}
                </div>
              )}
            </div>

            <div className={styles.footer}>
              <div className={styles.footerLeft}>
                {summary && (
                  <span>{summary.split(/\s+/).length} words • Grounded on paper content</span>
                )}
              </div>
              <div className={styles.footerRight}>
                <button className={styles.btnSecondary} onClick={handleCopy} disabled={!summary}>
                  {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copied ? "Copied to Clipboard!" : "Copy Summary"}
                </button>
                <button className={styles.btnPrimary} onClick={() => setActiveTab("chat")}>
                  Ask Questions ➔
                </button>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: ASK QUESTIONS (CHAT) */}
        {activeTab === "chat" && (
          <div className={styles.chatContainer}>
            <div className={styles.chatMessagesScroll}>
              {clearedNotice && (
                <div className={styles.clearedBanner}>
                  <Check size={14} color="#10b981" />
                  <span>Conversation history cleared</span>
                </div>
              )}

              {/* Suggested Questions Section */}
              <div className={styles.suggestedHeader}>Suggested Questions:</div>
              <div className={styles.chipsGrid}>
                {HANDOUT_SUGGESTED_QUESTIONS.map((q, qIdx) => (
                  <button
                    key={qIdx}
                    className={styles.promptChip}
                    onClick={() => handleSendMessage(q)}
                    disabled={isChatStreaming}
                  >
                    <HelpCircle size={13} color="#818cf8" />
                    <span>{q}</span>
                  </button>
                ))}
              </div>

              {/* Chat Message Stream */}
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`${styles.chatBubbleRow} ${
                    msg.role === "user" ? styles.chatBubbleRowUser : styles.chatBubbleRowAssistant
                  }`}
                >
                  <div className={styles.bubbleSenderTag}>
                    {msg.role === "user" ? (
                      <>
                        <User size={12} />
                        <span>You</span>
                      </>
                    ) : (
                      <>
                        <Bot size={12} color="#818cf8" />
                        <span>Gemini Assistant</span>
                      </>
                    )}
                  </div>
                  {msg.role === "user" ? (
                    <div className={styles.userBubble}>{msg.content}</div>
                  ) : (
                    <div className={styles.assistantBubble}>
                      <div className={styles.markdownBody}>
                        {renderFormattedMarkdown(msg.content)}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Active Streaming Assistant Bubble */}
              {isChatStreaming && (
                <div className={`${styles.chatBubbleRow} ${styles.chatBubbleRowAssistant}`}>
                  <div className={styles.bubbleSenderTag}>
                    <Bot size={12} color="#818cf8" />
                    <span>Gemini Assistant (thinking...)</span>
                  </div>
                  <div className={styles.assistantBubble}>
                    {streamingAnswer ? (
                      <div className={styles.markdownBody}>
                        {renderFormattedMarkdown(streamingAnswer)}
                      </div>
                    ) : (
                      <div className={styles.streamingIndicator}>
                        <span className={styles.pulseDot} />
                        Analyzing paper content...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {chatError && (
                <div className={styles.errorBox} style={{ padding: "1.5rem" }}>
                  <AlertTriangle size={24} color="#ef4444" />
                  <p className={styles.errorMsg}>{chatError}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Sticky Input Bar */}
            <div className={styles.chatInputBar}>
              <div className={styles.chatInputWrapper}>
                <textarea
                  ref={chatTextareaRef}
                  className={styles.chatTextarea}
                  placeholder="Ask any question about this paper... (Press Enter to send)"
                  rows={2}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isChatStreaming}
                />
                <button
                  className={styles.sendBtn}
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isChatStreaming}
                  title="Send Question (Enter)"
                >
                  <Send size={15} />
                </button>
              </div>
              <div className={styles.chatInputHint}>
                <span>Grounded on paper manuscript • Answers cite sections & metrics</span>
                <span>Shift + Enter for new line</span>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
