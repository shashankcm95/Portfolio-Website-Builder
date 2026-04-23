import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/log";

// Prevents static prerender during `next build` — this route queries
// Postgres at request time, so there is nothing meaningful to bake.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = (formData.get("file") ?? formData.get("resume")) as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF and DOCX files are supported" },
        { status: 400 }
      );
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be under 5MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Extract text based on file type
    let rawText: string;
    if (file.type === "application/pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      rawText = parsed.text;
    } else {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    }

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text from file" },
        { status: 400 }
      );
    }

    // Structure resume using the user's LLM provider. Non-fatal: on any
    // failure (including LlmNotConfiguredError) we fall through and save
    // the raw text only — the user can retry from Settings once they've
    // configured a provider.
    let structuredResume: unknown = null;
    try {
      const { getLlmClientForUser } = await import(
        "@/lib/ai/providers/factory"
      );
      const { getResumeStructuringSystemPrompt, buildResumeStructuringUserPrompt } =
        await import("@/lib/ai/prompts/resume-structuring");

      const llm = await getLlmClientForUser(session.user.id);
      structuredResume = await llm.structured({
        systemPrompt: getResumeStructuringSystemPrompt(),
        userPrompt: buildResumeStructuringUserPrompt(rawText),
        maxTokens: 4096,
      });
    } catch (error) {
      logger.warn("AI structuring failed, saving raw text only", { error: error instanceof Error ? error.message : String(error) });
    }

    // Save to database
    await db
      .update(users)
      .set({
        resumeRawText: rawText,
        resumeJson: structuredResume,
        resumeFilename: file.name,
        updatedAt: new Date(),
      })
      .where(eq(users.id, session.user.id));

    const wordCount = rawText.split(/\s+/).filter(Boolean).length;

    return NextResponse.json({
      resume: structuredResume,
      structuringFailed: structuredResume === null,
      parseInfo: {
        wordCount,
      },
    });
  } catch (error: any) {
    logger.error("Resume upload error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to process resume" },
      { status: 500 }
    );
  }
}
