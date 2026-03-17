"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ResumePreview } from "@/components/resume/resume-preview";
import type { StructuredResume } from "@/lib/ai/schemas/resume";
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
} from "lucide-react";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

type UploadStatus = "idle" | "selected" | "uploading" | "success" | "error";

interface UploadResponse {
  resume: StructuredResume;
  parseInfo?: {
    wordCount: number;
    pageCount?: number;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function ResumeUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resumeData, setResumeData] = useState<UploadResponse | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((f: File): string | null => {
    const ext = getFileExtension(f.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext) && !ACCEPTED_TYPES.includes(f.type)) {
      return `Invalid file type "${ext || f.type}". Please upload a PDF or DOCX file.`;
    }
    if (f.size > MAX_FILE_SIZE) {
      return `File is too large (${formatFileSize(f.size)}). Maximum size is 5 MB.`;
    }
    if (f.size === 0) {
      return "File is empty. Please select a valid resume file.";
    }
    return null;
  }, []);

  const handleFileSelect = useCallback(
    (f: File) => {
      const validationError = validateFile(f);
      if (validationError) {
        setError(validationError);
        setStatus("error");
        setFile(null);
        return;
      }
      setFile(f);
      setError(null);
      setStatus("selected");
      setResumeData(null);
    },
    [validateFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) {
        handleFileSelect(selected);
      }
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect]
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setStatus("uploading");
    setProgress(0);
    setError(null);

    // Simulate initial progress since fetch does not expose upload progress natively
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) {
          clearInterval(progressInterval);
          return 85;
        }
        // Gradually slow down as we approach 85%
        const increment = Math.max(1, Math.floor((85 - prev) / 8));
        return Math.min(prev + increment, 85);
      });
    }, 300);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/resume/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message =
          body?.error ?? `Upload failed with status ${response.status}`;
        throw new Error(message);
      }

      setProgress(95);

      const data: UploadResponse = await response.json();

      setProgress(100);
      setResumeData(data);
      setStatus("success");
    } catch (err) {
      clearInterval(progressInterval);
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
      setStatus("error");
      setProgress(0);
    }
  }, [file]);

  const handleReset = useCallback(() => {
    setFile(null);
    setStatus("idle");
    setProgress(0);
    setError(null);
    setResumeData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleRetry = useCallback(() => {
    setError(null);
    if (file) {
      setStatus("selected");
      setProgress(0);
    } else {
      handleReset();
    }
  }, [file, handleReset]);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Your Resume</CardTitle>
          <CardDescription>
            Upload a PDF or DOCX file (max 5 MB). We will parse it and extract
            your professional details automatically.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Drag-and-drop zone */}
          {status !== "success" && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed
                px-6 py-10 text-center transition-colors cursor-pointer
                ${
                  isDragOver
                    ? "border-primary bg-primary/5"
                    : status === "error"
                      ? "border-destructive/50 bg-destructive/5"
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/50"
                }
                ${status === "uploading" ? "pointer-events-none opacity-60" : ""}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleInputChange}
                className="sr-only"
                aria-label="Select resume file"
                disabled={status === "uploading"}
              />

              {!file ? (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground/60 mb-3" />
                  <p className="text-sm font-medium">
                    {isDragOver
                      ? "Drop your resume here"
                      : "Drag and drop your resume here"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    or click to browse
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      PDF
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      DOCX
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Max 5 MB
                    </Badge>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-primary shrink-0" />
                  <div className="text-left min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  {status !== "uploading" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReset();
                      }}
                      className="ml-auto rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      aria-label="Remove selected file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Upload progress */}
          {status === "uploading" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {progress < 85
                    ? "Uploading..."
                    : progress < 100
                      ? "Analyzing resume..."
                      : "Complete!"}
                </span>
                <span className="font-medium tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Error state */}
          {status === "error" && error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">
                  Upload Failed
                </p>
                <p className="mt-1 text-sm text-destructive/80">{error}</p>
              </div>
            </div>
          )}

          {/* Success state summary */}
          {status === "success" && resumeData && (
            <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  Resume Parsed Successfully
                </p>
                <p className="mt-1 text-sm text-green-600/80 dark:text-green-400/80">
                  Extracted data for{" "}
                  <span className="font-medium">
                    {resumeData.resume.basics.name}
                  </span>
                  {resumeData.parseInfo && (
                    <>
                      {" "}
                      ({resumeData.parseInfo.wordCount.toLocaleString()} words
                      {resumeData.parseInfo.pageCount
                        ? `, ${resumeData.parseInfo.pageCount} page${resumeData.parseInfo.pageCount !== 1 ? "s" : ""}`
                        : ""}
                      )
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between gap-3">
          {status === "selected" && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Cancel
              </Button>
              <Button onClick={handleUpload}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Resume
              </Button>
            </>
          )}

          {status === "uploading" && (
            <Button disabled className="ml-auto">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </Button>
          )}

          {status === "error" && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRetry}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </>
          )}

          {status === "success" && (
            <Button variant="outline" onClick={handleReset} className="ml-auto">
              Upload a Different Resume
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Resume preview section */}
      {status === "success" && resumeData && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Parsed Resume Preview
          </h2>
          <ResumePreview data={resumeData.resume} />
        </div>
      )}
    </div>
  );
}
