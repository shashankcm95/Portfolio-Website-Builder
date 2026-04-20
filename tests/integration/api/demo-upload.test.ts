/**
 * @jest-environment node
 *
 * POST /api/portfolios/:pid/projects/:prid/demo/upload — auth, ownership,
 * R2 config gate, file validation, happy-path SDK call. The S3 client is
 * mocked at the module level so the route's putObject path runs end-to-
 * end without a real R2.
 */

const mockAuth = jest.fn();
jest.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => mockAuth(...a) }));

const mockOwnershipRows: unknown[][] = [];

jest.mock("@/lib/db", () => {
  function selectChain() {
    const self: any = {
      from: () => self,
      innerJoin: () => self,
      where: () => self,
      limit: async () => {
        const rows = mockOwnershipRows.shift();
        if (!rows) throw new Error("No ownership rows queued");
        return rows;
      },
    };
    return self;
  }
  return { db: { select: jest.fn(() => selectChain()) } };
});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: jest.fn(() => "eq"),
    and: jest.fn(() => "and"),
  };
});

// Mock the S3 client BEFORE importing the route.
const mockS3Send = jest.fn();
jest.mock("@aws-sdk/client-s3", () => {
  class PutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  class DeleteObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  class S3Client {
    async send(cmd: unknown) {
      return mockS3Send(cmd);
    }
  }
  return { S3Client, PutObjectCommand, DeleteObjectCommand };
});

// Route must be imported AFTER mocks.
import { POST } from "@/app/api/portfolios/[portfolioId]/projects/[projectId]/demo/upload/route";
import { _resetR2ConfigCacheForTests } from "@/lib/storage/r2";

// ─── Test helpers ───────────────────────────────────────────────────────────

const originalEnv = { ...process.env };

function setConfiguredR2() {
  process.env.R2_ACCOUNT_ID = "abc123";
  process.env.R2_ACCESS_KEY_ID = "AKIA_test";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET = "demos";
  process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev";
}

function clearR2Env() {
  delete process.env.R2_ACCOUNT_ID;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  delete process.env.R2_BUCKET;
  delete process.env.R2_PUBLIC_BASE_URL;
}

function makeFileFormData(file: File): FormData {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
}

function makeRequest(body?: FormData) {
  const init: RequestInit = body ? { method: "POST", body } : { method: "POST" };
  return new Request(
    "http://localhost/api/portfolios/pf1/projects/pr1/demo/upload",
    init
  );
}

beforeEach(() => {
  mockAuth.mockReset();
  mockOwnershipRows.length = 0;
  mockS3Send.mockReset();
  mockS3Send.mockResolvedValue({}); // happy default
  process.env = { ...originalEnv };
  _resetR2ConfigCacheForTests();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /demo/upload", () => {
  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest() as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the project does not exist", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([]);
    const res = await POST(makeRequest() as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the project belongs to another user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u2" },
    ]);
    const res = await POST(makeRequest() as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(403);
  });

  it("returns 503 when R2 is not configured", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    clearR2Env();
    const file = new File(["hello"], "shot.png", { type: "image/png" });
    const res = await POST(makeRequest(makeFileFormData(file)) as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("not_configured");
  });

  it("returns 400 when no file is supplied", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    setConfiguredR2();
    const res = await POST(makeRequest(new FormData()) as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 for an oversized file (>10 MB)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    setConfiguredR2();
    const bigBuf = new Uint8Array(11 * 1024 * 1024); // 11 MB of zeros
    const file = new File([bigBuf], "big.png", { type: "image/png" });
    const res = await POST(makeRequest(makeFileFormData(file)) as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("too_large");
  });

  it("returns 400 for a disallowed MIME type", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    setConfiguredR2();
    const file = new File(["<script>"], "page.html", {
      type: "text/html",
    });
    const res = await POST(makeRequest(makeFileFormData(file)) as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("bad_mime");
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it("uploads a valid PNG and returns the public URL", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    setConfiguredR2();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "shot.png", {
      type: "image/png",
    });
    const res = await POST(makeRequest(makeFileFormData(file)) as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(
      /^https:\/\/pub-xyz\.r2\.dev\/u\/u1\/p\/pr1\/[0-9a-f-]{36}\.png$/
    );
    expect(body.contentType).toBe("image/png");
    expect(body.bytes).toBe(4);

    // S3 client was called with PutObject
    expect(mockS3Send).toHaveBeenCalledTimes(1);
    const cmd = mockS3Send.mock.calls[0][0];
    expect(cmd.input.Bucket).toBe("demos");
    expect(cmd.input.ContentType).toBe("image/png");
    expect(cmd.input.Key).toMatch(/^u\/u1\/p\/pr1\/[0-9a-f-]{36}\.png$/);
    expect(cmd.input.CacheControl).toBe(
      "public, max-age=31536000, immutable"
    );
  });

  it("surfaces a 500 when the S3 client throws", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    mockOwnershipRows.push([
      { projectId: "pr1", portfolioUserId: "u1" },
    ]);
    setConfiguredR2();
    mockS3Send.mockRejectedValue(new Error("503 service unavailable"));
    const file = new File(["abc"], "shot.png", { type: "image/png" });
    const res = await POST(makeRequest(makeFileFormData(file)) as any, {
      params: { portfolioId: "pf1", projectId: "pr1" },
    } as any);
    expect(res.status).toBe(500);
  });
});
