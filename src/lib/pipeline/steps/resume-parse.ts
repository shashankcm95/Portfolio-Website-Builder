import { throwIfAborted } from "@/lib/pipeline/abort";
import { logger } from "@/lib/log";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (
  buffer: Buffer
) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require("mammoth") as {
  extractRawText: (options: { buffer: Buffer }) => Promise<{
    value: string;
    messages: Array<{ type: string; message: string }>;
  }>;
};

export interface ResumeParseResult {
  rawText: string;
  pageCount?: number;
  wordCount: number;
}

/**
 * Extracts raw text from an uploaded PDF or DOCX file buffer.
 * Handles errors for corrupt files and unsupported formats.
 */
export async function parseResume(
  fileBuffer: Buffer,
  mimeType: string,
  signal?: AbortSignal
): Promise<ResumeParseResult> {
  throwIfAborted(signal);
  if (
    mimeType === "application/pdf" ||
    mimeType === "application/x-pdf"
  ) {
    return parsePdf(fileBuffer);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword"
  ) {
    return parseDocx(fileBuffer);
  }

  throw new Error(
    `Unsupported file type: ${mimeType}. Only PDF and DOCX files are supported.`
  );
}

async function parsePdf(fileBuffer: Buffer): Promise<ResumeParseResult> {
  try {
    const data = await pdfParse(fileBuffer);

    if (!data.text || data.text.trim().length === 0) {
      throw new Error(
        "PDF appears to contain no extractable text. It may be scanned or image-based."
      );
    }

    const rawText = data.text.trim();
    return {
      rawText,
      pageCount: data.numpages,
      wordCount: countWords(rawText),
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("password")) {
        throw new Error(
          "PDF is password-protected. Please provide an unprotected file."
        );
      }
      if (
        error.message.includes("Invalid") ||
        error.message.includes("corrupt")
      ) {
        throw new Error(
          "PDF file appears to be corrupted or invalid. Please re-upload."
        );
      }
      throw error;
    }
    throw new Error("Failed to parse PDF file.");
  }
}

async function parseDocx(fileBuffer: Buffer): Promise<ResumeParseResult> {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });

    if (!result.value || result.value.trim().length === 0) {
      throw new Error("DOCX file appears to contain no text content.");
    }

    const rawText = result.value.trim();

    if (result.messages && result.messages.length > 0) {
      const warnings = result.messages
        .filter((m) => m.type === "warning")
        .map((m) => m.message);
      if (warnings.length > 0) {
        logger.warn("[resume-parse] DOCX warnings", {
          warnings: warnings.join("; "),
        });
      }
    }

    return {
      rawText,
      wordCount: countWords(rawText),
    };
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes("Could not find") ||
        error.message.includes("corrupt")
      ) {
        throw new Error(
          "DOCX file appears to be corrupted or invalid. Please re-upload."
        );
      }
      throw error;
    }
    throw new Error("Failed to parse DOCX file.");
  }
}

function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}
