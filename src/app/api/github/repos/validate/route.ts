import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/log";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    // Accept both "url" and "repoUrl" field names
    const repoUrl = body.url ?? body.repoUrl;

    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 }
      );
    }

    const { parseGitHubUrl } = await import("@/lib/github/url-parser");
    const parsed = parseGitHubUrl(repoUrl);

    if (!parsed) {
      return NextResponse.json(
        { error: "Invalid GitHub repository URL" },
        { status: 400 }
      );
    }

    // Check if repo is accessible
    const response = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "portfolio-builder",
        },
      }
    );

    if (response.status === 404) {
      return NextResponse.json(
        { error: "Repository not found or is private" },
        { status: 404 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to validate repository" },
        { status: 502 }
      );
    }

    const metadata = await response.json();

    // Return shape matching RepoValidationResult expected by the frontend
    return NextResponse.json({
      name: metadata.name,
      fullName: metadata.full_name,
      description: metadata.description,
      stars: metadata.stargazers_count ?? 0,
      forks: metadata.forks_count ?? 0,
      language: metadata.language,
      htmlUrl: metadata.html_url,
      owner: parsed.owner,
      isPrivate: metadata.private ?? false,
      defaultBranch: metadata.default_branch ?? "main",
      topics: metadata.topics ?? [],
    });
  } catch (error: any) {
    logger.error("Repo validation error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Failed to validate repository" },
      { status: 500 }
    );
  }
}
