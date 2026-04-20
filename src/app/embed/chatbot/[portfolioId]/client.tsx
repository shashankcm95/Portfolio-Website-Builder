"use client";

/**
 * Phase 5 + 5.1 + 5.2 — Client chat UI inside the iframe.
 *
 * Visual states:
 *   - **closed**: floating 56×56 launcher button (bottom-right)
 *   - **open**: 380×560 panel with message list + input + starter chips
 *
 * Data flow:
 *   - `ChatbotPublicConfig` props land from the parent server component.
 *   - Visitor UUID persists in `localStorage['portfolio-chatbot-visitor-id']`.
 *   - On send: POST to `/api/chatbot/stream`, progressively render tokens
 *     as they arrive. On `done` the assistant message is finalized.
 *
 * Greeting (5.2): when present, renders as the first assistant message
 * when the transcript is empty. Starter chips (5.2): render above the
 * input on an empty transcript; clicking one sends it as a user message.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  streamChat,
  StreamError,
  StreamHttpError,
} from "@/lib/chatbot/sse-client";
import {
  MAX_VISITOR_MESSAGE_CHARS,
  type ChatbotPublicConfig,
  type ChatMessage,
} from "@/lib/chatbot/types";

const VISITOR_STORAGE_KEY = "portfolio-chatbot-visitor-id";

/**
 * Restrict markdown rendering to a tiny safe-list. Anything else falls
 * through to plain text. Links are forced to https-only + noopener.
 */
const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children, ...rest }) => {
    const safe =
      typeof href === "string" &&
      (href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:"));
    if (!safe) return <>{children}</>;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
        className="underline hover:no-underline"
      >
        {children}
      </a>
    );
  },
  img: () => null,
  iframe: () => null,
  script: () => null,
};

const MARKDOWN_ALLOWED = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
  "br",
  "code",
];

// ─── Component ──────────────────────────────────────────────────────────────

interface EmbedChatbotClientProps {
  portfolioId: string;
  config: ChatbotPublicConfig;
}

export function EmbedChatbotClient({
  portfolioId,
  config,
}: EmbedChatbotClientProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    config.greeting
      ? [
          {
            role: "assistant",
            content: config.greeting,
            createdAt: new Date().toISOString(),
          },
        ]
      : []
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);

  /** True when the visitor hasn't sent anything yet — drives starter chip visibility. */
  const hasVisitorSent = messages.some((m) => m.role === "user");

  // Load / generate visitor UUID on mount.
  useEffect(() => {
    try {
      let id = localStorage.getItem(VISITOR_STORAGE_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(VISITOR_STORAGE_KEY, id);
      }
      setVisitorId(id);
    } catch {
      setVisitorId(crypto.randomUUID());
    }
  }, []);

  // postMessage to parent on open/close for iframe resize.
  useEffect(() => {
    try {
      window.parent?.postMessage(
        { type: "chatbot-resize", open },
        "*"
      );
    } catch {
      /* ignored */
    }
  }, [open]);

  // Auto-scroll to bottom on new messages / open.
  useEffect(() => {
    if (open) scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Core send: POST to stream endpoint, append tokens as they arrive.
  const sendMessage = useCallback(
    async (text: string) => {
      if (!visitorId || sending) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_VISITOR_MESSAGE_CHARS) {
        setError(
          `Please keep messages under ${MAX_VISITOR_MESSAGE_CHARS} characters.`
        );
        return;
      }

      setError(null);
      setSending(true);
      const nowIso = new Date().toISOString();

      // Append the visitor turn AND an empty placeholder for the assistant
      // we're about to stream into. We'll mutate its content as tokens arrive.
      const userTurn: ChatMessage = {
        role: "user",
        content: trimmed,
        createdAt: nowIso,
      };
      const assistantTurn: ChatMessage = {
        role: "assistant",
        content: "",
        createdAt: nowIso,
      };
      setMessages((m) => [...m, userTurn, assistantTurn]);
      setDraft("");

      try {
        await streamChat(
          "/api/chatbot/stream",
          { portfolioId, visitorId, message: trimmed },
          {
            onToken: (chunk) => {
              setMessages((m) => {
                // Streaming assistant message is always the last one.
                const copy = m.slice();
                const last = copy[copy.length - 1];
                if (last && last.role === "assistant") {
                  copy[copy.length - 1] = {
                    ...last,
                    content: last.content + chunk,
                  };
                }
                return copy;
              });
            },
          }
        );
      } catch (e) {
        if (e instanceof StreamHttpError) {
          const code = (e.body as { code?: string })?.code;
          if (code === "not_configured" || code === "not_found") {
            setUnavailable("Chat is unavailable on this portfolio.");
          } else if (code === "rate_limited") {
            setError("You're sending messages too quickly — please slow down.");
          } else {
            setError(
              (e.body as { error?: string })?.error ?? "Something went wrong."
            );
          }
        } else if (e instanceof StreamError) {
          if (e.code === "not_configured") {
            setUnavailable("Chat is unavailable on this portfolio.");
          } else {
            setError("The assistant hit an error mid-reply. Please try again.");
          }
        } else {
          setError("Network error. Try again.");
        }
        // Drop the empty assistant placeholder if it never streamed anything.
        setMessages((m) => {
          const last = m[m.length - 1];
          if (last && last.role === "assistant" && last.content === "") {
            return m.slice(0, -1);
          }
          return m;
        });
      } finally {
        setSending(false);
      }
    },
    [portfolioId, visitorId, sending]
  );

  // ── Closed state: floating launcher ──────────────────────────────────────
  if (!open) {
    return (
      <div className="fixed bottom-0 right-0 h-14 w-14">
        <button
          type="button"
          aria-label="Open chatbot"
          onClick={() => setOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          data-testid="chatbot-launcher"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      </div>
    );
  }

  // ── Open state: panel ────────────────────────────────────────────────────
  return (
    <div
      className="fixed bottom-0 right-0 flex h-full w-full flex-col rounded-t-xl border bg-background text-foreground shadow-2xl"
      data-testid="chatbot-panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Ask the portfolio</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(false)}
          aria-label="Close chatbot"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {unavailable ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {unavailable}
        </div>
      ) : (
        <>
          {/* Transcript */}
          <ScrollArea className="flex-1 px-4 py-3">
            <div className="space-y-3">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Ask about this developer&apos;s projects, skills, or work
                  history. Answers are grounded in their verified facts.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {m.role === "assistant" ? (
                      m.content === "" && sending && i === messages.length - 1 ? (
                        /* Empty streaming placeholder — bouncing dots until first token. */
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                          <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                          <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                        </span>
                      ) : (
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown
                            components={MARKDOWN_COMPONENTS}
                            allowedElements={MARKDOWN_ALLOWED}
                            unwrapDisallowed
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      )
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}
              <div ref={scrollBottomRef} />
            </div>
          </ScrollArea>

          {/* Starter chips — visible only before the visitor's first message */}
          {!hasVisitorSent && config.starters.length > 0 && (
            <div
              className="flex flex-wrap gap-1.5 border-t px-3 py-2"
              data-testid="chatbot-starters"
            >
              {config.starters.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => sendMessage(s)}
                  disabled={sending || !visitorId}
                  className="rounded-full border px-3 py-1 text-xs text-foreground/80 hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          )}

          <form
            className="flex items-center gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(draft);
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a question…"
              maxLength={MAX_VISITOR_MESSAGE_CHARS}
              disabled={sending || !visitorId}
              aria-label="Message"
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || !visitorId || draft.trim().length === 0}
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
