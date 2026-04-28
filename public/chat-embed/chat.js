/* Phase 9 — Vanilla-JS chat widget for the static iframe.
 *
 * Runs inside an iframe served by Cloudflare Pages at the same origin as
 * the published portfolio. Talks to `/api/chat/stream` — a Pages Function
 * co-deployed with the static site. No dependencies, no framework, no
 * bundler; ships as plain JS so the deploy stays tiny.
 *
 * Wire contract matches the builder-side `/api/chatbot/stream`:
 *
 *   event: token     → data: {"text":"<chunk>"}
 *   event: done      → data: {"sessionId":"<id>"}
 *   event: error     → data: {"code":"...","error":"<msg>"}
 *
 * The parent page (the published portfolio) expects `postMessage` events
 * named `chatbot-resize` so the bootstrap can size the iframe 72×72
 * (closed) vs 400×600 (open).
 */

(function () {
  "use strict";

  var VISITOR_STORAGE_KEY = "portfolio-chatbot-visitor-id";
  var MAX_CHARS = 500;
  // Phase E8g — session continuity. Track recent turns in-memory and
  // replay the last MAX_HISTORY_TURNS user/assistant pairs with each
  // new request so the model can resolve "his" / "those projects".
  // Server caps this at MAX_HISTORY_MESSAGES (6 entries = 3 turns); we
  // mirror it client-side to avoid sending oversize bodies that get
  // truncated. The history dies when the page reloads — there's no
  // localStorage persistence by design (visitor's chat is ephemeral).
  var MAX_HISTORY_TURNS = 3;
  var MAX_HISTORY_MESSAGE_CHARS = 800;
  // sessionHistory is an array of { role: "user" | "assistant", content }
  // ordered oldest → newest. Pushed to whenever a turn completes.
  var sessionHistory = [];

  // ── Config + DOM handles ────────────────────────────────────────────
  var config = readConfig();
  if (!config || !config.portfolioId) {
    // Without a portfolio id we can't hit /api/chat/stream meaningfully.
    // Leave the DOM alone — visitor sees an empty iframe.
    return;
  }

  var root = document.getElementById("chat-root");
  var launcher = document.getElementById("chat-launcher");
  var panel = document.getElementById("chat-panel");
  var closeBtn = document.getElementById("chat-close");
  var transcript = document.getElementById("chat-transcript");
  var starters = document.getElementById("chat-starters");
  var form = document.getElementById("chat-form");
  var input = document.getElementById("chat-input");
  var sendBtn = document.getElementById("chat-send");

  var visitorId = resolveVisitorId();
  var streaming = false;

  // ── Bootstrap: render greeting + starters, bind listeners ───────────
  if (config.greeting) {
    appendAssistantMessage(config.greeting, { final: true });
  }
  renderStarters(config.starters || []);

  launcher.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);
  form.addEventListener("submit", onSubmit);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePanel();
  });

  // Initial state — closed.
  notifyResize(false);

  // ──────────────────────────────────────────────────────────────────
  // Panel open/close + iframe resize postMessage
  // ──────────────────────────────────────────────────────────────────

  function openPanel() {
    root.classList.remove("closed");
    root.classList.add("open");
    panel.hidden = false;
    notifyResize(true);
    setTimeout(function () {
      try { input.focus(); } catch (e) {}
    }, 60);
  }

  function closePanel() {
    root.classList.remove("open");
    root.classList.add("closed");
    panel.hidden = true;
    notifyResize(false);
  }

  function notifyResize(open) {
    try {
      // The bootstrap in `templates/_shared/chatbot-snippet.ts` listens
      // on window.message for these frames; `event.origin` check there
      // validates it's from our iframe.
      parent.postMessage({ type: "chatbot-resize", open: !!open }, "*");
    } catch (e) { /* no-op */ }
  }

  // ──────────────────────────────────────────────────────────────────
  // Visitor id + config
  // ──────────────────────────────────────────────────────────────────

  function resolveVisitorId() {
    try {
      var existing = localStorage.getItem(VISITOR_STORAGE_KEY);
      if (existing) return existing;
    } catch (e) { /* private mode / sandboxed iframe */ }
    var id =
      (window.crypto && typeof window.crypto.randomUUID === "function")
        ? window.crypto.randomUUID()
        : "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    try { localStorage.setItem(VISITOR_STORAGE_KEY, id); } catch (e) {}
    return id;
  }

  function readConfig() {
    var script = document.getElementById("chat-config");
    if (!script || !script.textContent) return null;
    try {
      return JSON.parse(script.textContent);
    } catch (e) {
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // Transcript rendering
  // ──────────────────────────────────────────────────────────────────

  function renderStarters(items) {
    starters.innerHTML = "";
    if (!items || items.length === 0) return;
    items.forEach(function (q) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chat-starter";
      btn.textContent = String(q);
      btn.addEventListener("click", function () {
        if (streaming) return;
        input.value = String(q);
        form.requestSubmit();
      });
      starters.appendChild(btn);
    });
  }

  function clearStarters() {
    starters.innerHTML = "";
  }

  function appendUserMessage(text) {
    var el = document.createElement("div");
    el.className = "chat-msg user";
    el.textContent = text;
    transcript.appendChild(el);
    scrollToBottom();
  }

  function appendAssistantMessage(text, opts) {
    var el = document.createElement("div");
    el.className = "chat-msg assistant";
    el.textContent = text || "";
    if (opts && opts.final === false) el.classList.add("streaming");
    transcript.appendChild(el);
    scrollToBottom();
    return el;
  }

  function appendErrorMessage(text) {
    var el = document.createElement("div");
    el.className = "chat-msg error";
    el.textContent = text;
    transcript.appendChild(el);
    scrollToBottom();
  }

  function scrollToBottom() {
    try {
      transcript.scrollTop = transcript.scrollHeight;
    } catch (e) {}
  }

  // ──────────────────────────────────────────────────────────────────
  // Send + stream
  // ──────────────────────────────────────────────────────────────────

  function onSubmit(e) {
    e.preventDefault();
    if (streaming) return;
    var message = (input.value || "").trim();
    if (!message) return;
    if (message.length > MAX_CHARS) {
      appendErrorMessage("Message too long (max " + MAX_CHARS + " characters).");
      return;
    }
    clearStarters();
    appendUserMessage(message);
    input.value = "";
    sendToServer(message);
  }

  /**
   * Phase E8g — build the history payload from the last
   * MAX_HISTORY_TURNS user/assistant pairs, capped at the
   * server-imposed length per entry. Always returns an array (empty
   * for the very first message of a session).
   */
  function buildHistoryPayload() {
    if (sessionHistory.length === 0) return [];
    var maxEntries = MAX_HISTORY_TURNS * 2;
    var slice =
      sessionHistory.length > maxEntries
        ? sessionHistory.slice(-maxEntries)
        : sessionHistory.slice();
    var out = [];
    for (var i = 0; i < slice.length; i++) {
      var entry = slice[i];
      var content =
        entry.content.length > MAX_HISTORY_MESSAGE_CHARS
          ? entry.content.slice(0, MAX_HISTORY_MESSAGE_CHARS)
          : entry.content;
      out.push({ role: entry.role, content: content });
    }
    return out;
  }

  function sendToServer(message) {
    streaming = true;
    sendBtn.disabled = true;
    input.disabled = true;

    var assistantEl = appendAssistantMessage("", { final: false });
    var buffered = "";

    // Phase E8g — capture the history payload BEFORE pushing the new
    // user message to it. The server replays history then appends the
    // current message; if we pushed first, the model would see the
    // user turn twice.
    var historyPayload = buildHistoryPayload();

    fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({
        portfolioId: config.portfolioId,
        visitorId: visitorId,
        message: message,
        history: historyPayload,
      }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (text) {
            var code = "http_" + res.status;
            var msg;
            try { msg = JSON.parse(text).error || text; } catch (e) { msg = text; }
            throw { code: code, message: msg, status: res.status };
          });
        }
        if (!res.body) throw { code: "no_body", message: "Empty response" };
        return consumeStream(res.body, {
          onToken: function (text) {
            buffered += text;
            assistantEl.textContent = buffered;
            scrollToBottom();
          },
          onDone: function () {
            assistantEl.classList.remove("streaming");
            // Phase E8g — push BOTH the user turn and the completed
            // assistant turn to the session history so the next
            // request replays them. Trim if we've exceeded the
            // server-side cap so the next buildHistoryPayload doesn't
            // truncate-and-lose anything important.
            sessionHistory.push({ role: "user", content: message });
            if (buffered) {
              sessionHistory.push({ role: "assistant", content: buffered });
            }
            var maxEntries = MAX_HISTORY_TURNS * 2;
            if (sessionHistory.length > maxEntries) {
              sessionHistory = sessionHistory.slice(-maxEntries);
            }
          },
          onError: function (code, msg) {
            assistantEl.remove();
            var label =
              code === "rate_limited"
                ? "You're sending messages too quickly. Try again in a moment."
                : code === "not_configured"
                  ? "The chatbot isn't configured on this site yet."
                  : msg || "Something went wrong. Please try again.";
            appendErrorMessage(label);
          },
        });
      })
      .catch(function (err) {
        assistantEl.remove();
        var msg =
          err && err.message
            ? err.message
            : "Network error. Check your connection and try again.";
        appendErrorMessage(msg);
      })
      .then(function () {
        streaming = false;
        sendBtn.disabled = false;
        input.disabled = false;
        try { input.focus(); } catch (e) {}
      });
  }

  // Parse SSE records out of a `ReadableStream<Uint8Array>` and route
  // each frame through the provided callbacks.
  function consumeStream(body, handlers) {
    var reader = body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";

    function pump() {
      return reader.read().then(function (result) {
        if (result.done) return;
        buffer += decoder.decode(result.value, { stream: true });
        var sep;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          var record = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          processRecord(record, handlers);
        }
        return pump();
      });
    }
    return pump();
  }

  function processRecord(record, handlers) {
    var event = null;
    var data = null;
    var lines = record.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf("event:") === 0) {
        event = line.slice(6).trim();
      } else if (line.indexOf("data:") === 0) {
        data = line.slice(5).trim();
      }
    }
    if (!event || !data) return;
    var parsed;
    try { parsed = JSON.parse(data); } catch (e) { return; }
    if (event === "token" && typeof parsed.text === "string") {
      handlers.onToken(parsed.text);
    } else if (event === "done") {
      handlers.onDone();
    } else if (event === "error") {
      handlers.onError(
        String(parsed.code || "internal"),
        String(parsed.error || "")
      );
    }
  }
})();
