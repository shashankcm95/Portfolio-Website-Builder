/**
 * @jest-environment node
 *
 * Anthropic client's forced-tool-use strict-JSON path. SDK is fully mocked;
 * we assert the client:
 *   - calls messages.create with the right `tools` / `tool_choice`
 *   - returns the parsed `input` from the tool_use block
 *   - falls back to fenced-JSON extraction when no schema is supplied
 *   - maps 401 / authentication_error → LlmInvalidKeyError
 */

const mockCreate = jest.fn();

/**
 * Phase 5.1: `text()` now runs through `textStream()` which calls
 * `messages.stream(...)`. The mock below translates whatever `mockCreate`
 * is scripted to return into a stream of `content_block_delta` events
 * — so existing tests that script `{content: [{type:"text", text:"x"}]}`
 * keep working via the streaming path, AND error rejection still surfaces.
 */
const mockStream = jest.fn((args: unknown) => {
  const settled = mockCreate(args); // returns a resolved/rejected value
  if (
    settled &&
    typeof (settled as { then?: unknown }).then === "function"
  ) {
    // It's a promise: if rejected, throw from the async iterator.
    return (async function* () {
      const resolved = await settled;
      for (const block of resolved.content ?? []) {
        if (block.type === "text") {
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: block.text },
          };
        }
      }
    })();
  }
  // Non-promise (shouldn't happen with mockResolvedValue/mockRejectedValue,
  // but be safe).
  return (async function* () {})();
});

jest.mock("@anthropic-ai/sdk", () => {
  return {
    __esModule: true,
    default: class MockAnthropic {
      messages = { create: mockCreate, stream: mockStream };
    },
  };
});

import { AnthropicClient } from "@/lib/ai/providers/anthropic-client";
import { LlmInvalidKeyError } from "@/lib/ai/providers/types";

beforeEach(() => {
  mockCreate.mockReset();
});

describe("AnthropicClient.structured with jsonSchema", () => {
  it("returns the parsed tool_use input object", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "storyboard_payload",
          input: { schemaVersion: 1, cards: [] },
        },
      ],
    });

    const client = new AnthropicClient("sk-ant-test", "claude-haiku-4-5");
    const result = await client.structured<{ schemaVersion: number }>({
      systemPrompt: "sys",
      userPrompt: "user",
      jsonSchema: {
        name: "storyboard_payload",
        schema: { type: "object", additionalProperties: false, properties: {}, required: [] },
      },
    });

    expect(result).toEqual({ schemaVersion: 1, cards: [] });

    // Verify the call shape
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0][0];
    expect(callArg.model).toBe("claude-haiku-4-5");
    expect(callArg.tools).toHaveLength(1);
    expect(callArg.tools[0].name).toBe("storyboard_payload");
    expect(callArg.tool_choice).toEqual({
      type: "tool",
      name: "storyboard_payload",
    });
  });

  it("throws when the API returns no tool_use block", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "the model ignored the tool" }],
    });
    const client = new AnthropicClient("sk-ant-test", "claude-haiku-4-5");
    await expect(
      client.structured({
        systemPrompt: "s",
        userPrompt: "u",
        jsonSchema: { name: "x", schema: {} },
      })
    ).rejects.toThrow(/no tool_use block/);
  });
});

describe("AnthropicClient.structured without jsonSchema — fenced JSON fallback", () => {
  it("extracts JSON from a markdown-fenced text block", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: 'Here is the result:\n```json\n{"ok": true}\n```',
        },
      ],
    });
    const client = new AnthropicClient("sk-ant-test", "claude-haiku-4-5");
    const result = await client.structured<{ ok: boolean }>({
      systemPrompt: "s",
      userPrompt: "u",
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("AnthropicClient.text", () => {
  it("concatenates text blocks", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "text", text: "hello " },
        { type: "text", text: "world" },
      ],
    });
    const client = new AnthropicClient("sk-ant-test", "claude-haiku-4-5");
    const result = await client.text({ systemPrompt: "s", userPrompt: "u" });
    expect(result).toBe("hello world");
  });

  it("ignores non-text blocks in the response", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", name: "t", input: {} },
        { type: "text", text: "only this" },
      ],
    });
    const client = new AnthropicClient("sk-ant-test", "claude-haiku-4-5");
    const result = await client.text({ systemPrompt: "s", userPrompt: "u" });
    expect(result).toBe("only this");
  });
});

describe("AnthropicClient error mapping", () => {
  it("maps 401 → LlmInvalidKeyError", async () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    mockCreate.mockRejectedValue(err);
    const client = new AnthropicClient("sk-ant-bogus", "claude-haiku-4-5");
    await expect(
      client.text({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toThrow(LlmInvalidKeyError);
  });

  it("maps authentication_error → LlmInvalidKeyError", async () => {
    const err = Object.assign(new Error("bad key"), {
      error: { type: "authentication_error" },
    });
    mockCreate.mockRejectedValue(err);
    const client = new AnthropicClient("sk-ant-bogus", "claude-haiku-4-5");
    await expect(
      client.text({ systemPrompt: "s", userPrompt: "u" })
    ).rejects.toThrow(LlmInvalidKeyError);
  });

  it("redacts the API key from non-auth error messages", async () => {
    mockCreate.mockRejectedValue(
      new Error("Rate-limited on key sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV")
    );
    const client = new AnthropicClient(
      "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV",
      "claude-haiku-4-5"
    );
    try {
      await client.text({ systemPrompt: "s", userPrompt: "u" });
      fail("expected rejection");
    } catch (e) {
      expect((e as Error).message).not.toMatch(/ABCDEFGHIJKLMNOPQRSTUV/);
      expect((e as Error).message).toMatch(/\*\*\*/);
    }
  });
});
