import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { repoUrl } = await req.json();

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

    // Check if repo is accessible (public)
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

    return NextResponse.json({
      valid: true,
      owner: parsed.owner,
      repo: parsed.repo,
      metadata: {
        name: metadata.name,
        description: metadata.description,
        language: metadata.language,
        stargazersCount: metadata.stargazers_count,
        topics: metadata.topics || [],
      },
    });
  } catch (error: any) {
    console.error("Repo validation error:", error);
    return NextResponse.json(
      { error: "Failed to validate repository" },
      { status: 500 }
    );
  }
}
