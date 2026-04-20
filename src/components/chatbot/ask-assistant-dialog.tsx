"use client";

/**
 * Phase 5.2 — Owner-facing Ask Assistant modal.
 *
 * Opens from the "Ask the assistant" button on a credibility suggestion.
 * The GitHub suggestion's title + description are seeded as `seedContext`
 * on the first message so the model knows what the owner is working on.
 *
 * Shares the SSE transport with the visitor widget
 * (`src/lib/chatbot/sse-client.ts`). Unlike the visitor chat:
 *   - owner turns are ephemeral (no `chatbot_sessions` row)
 *   - target endpoint: /api/chatbot/owner-ask/stream (auth-gated)
 *   - conversation state is discarded on dialog close
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  type ChatMessage,
} from "@/lib/chatbot/types";

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
  "pre",
];

export interface AskAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  portfolioId: string;
  suggestion: {
    id: string;
    title: string;
    description: string;
    helpUrl?: string | null;
  };
}

export function AskAssistantDialog({
  open,
  onOpenChange,
  portfolioId,
  suggestion,
}: AskAssistantDialogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollBottomRef = useRef<HTMLDivElement | null>(null);

  // Discard conversation state when the dialog closes so reopening
  // starts fresh (matches plan §Decision 11).
  useEffect(() => {
    if (!open) {
      setMessages([]);
      setDraft("");
      setSending(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (open) scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const seedContext = `${suggestion.title}\n\n${suggestion.description}${
    suggestion.helpUrl ? `\n\nReference: ${suggestion.helpUrl}` : ""
  }`;

  const sendMessage = useCallback(
    async (text: string) => {
      if (sending) return;
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
      const isFirst = messages.length === 0;
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
          "/api/chatbot/owner-ask/stream",
          {
            portfolioId,
            message: trimmed,
            // seedContext only flows on the first turn (plan §Decision 10).
            ...(isFirst ? { seedContext } : {}),
          },
          {
            onToken: (chunk) => {
              setMessages((m) => {
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
        let msg = "Something went wrong. Try again.";
        if (e instanceof StreamHttpError) {
          const body = e.body as { error?: string; code?: string };
          if (body?.code === "rate_limited") {
            msg = "You're asking too many questions in a short window. Wait a minute.";
          } else if (body?.code === "not_configured") {
            msg =
              "No AI provider is configured for your account. Add one in Settings → AI Provider.";
          } else if (body?.error) {
            msg = body.error;
          }
        } else if (e instanceof StreamError) {
          msg =
            e.code === "not_configured"
              ? "No AI provider is configured for your account."
              : "The assistant hit an error mid-reply. Please try again.";
        }
        setError(msg);
        // Drop the empty assistant placeholder if no tokens arrived.
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
    [sending, messages.length, portfolioId, seedContext]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[600px] max-h-[80vh] flex-col p-0 sm:max-w-[640px]">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Ask the assistant
          </DialogTitle>
          <DialogDescription className="line-clamp-2 text-left">
            <span className="font-medium text-foreground">{suggestion.title}.</span>{" "}
            {suggestion.description}
          </DialogDescription>
        </DialogHeader>

        {/* Transcript */}
        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-3">
            {messages.length === 0 && (
              <p
                className="text-sm text-muted-foreground"
                data-testid="ask-assistant-empty"
              >
                Ask for specific guidance on this suggestion — the assistant
                can look at your project facts and narrative. Try:{" "}
                <em>&quot;What change should I make first?&quot;</em>
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
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {m.role === "assistant" ? (
                    m.content === "" && sending && i === messages.length - 1 ? (
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
            placeholder="Ask for specific help…"
            maxLength={MAX_VISITOR_MESSAGE_CHARS}
            disabled={sending}
            aria-label="Message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || draft.trim().length === 0}
            aria-label="Send"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
