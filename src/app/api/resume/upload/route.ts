import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File | null;

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

    // Structure resume using Claude
    let structuredResume = null;
    try {
      const { callClaudeStructured } = await import("@/lib/ai/claude");
      const { getResumeStructuringSystemPrompt, buildResumeStructuringUserPrompt } =
        await import("@/lib/ai/prompts/resume-structuring");

      structuredResume = await callClaudeStructured({
        systemPrompt: getResumeStructuringSystemPrompt(),
        userPrompt: buildResumeStructuringUserPrompt(rawText),
        maxTokens: 4096,
      });
    } catch (error) {
      console.warn("AI structuring failed, saving raw text only:", error);
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

    return NextResponse.json({
      success: true,
      rawText: rawText.substring(0, 500) + "...",
      structured: structuredResume,
      filename: file.name,
    });
  } catch (error: any) {
    console.error("Resume upload error:", error);
    return NextResponse.json(
      { error: "Failed to process resume" },
      { status: 500 }
    );
  }
}
