import { GitHubClient } from "@/lib/github/client";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RepoData {
  metadata: RepoMetadata;
  readme: string | null;
  fileTree: FileTreeEntry[];
  dependencies: DependencyFile[];
}

export interface RepoMetadata {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
  topics: string[];
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
  license: { name: string } | null;
  htmlUrl: string;
  /** The repo's declared `homepage` URL, if any. May be "" or null. */
  homepage: string | null;
}

export interface FileTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export interface DependencyFile {
  /** Canonical type key, e.g. `package_json`, `requirements_txt`, etc. */
  type: string;
  /** Raw file content. */
  content: string;
  /** Path inside the repository. */
  path: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** GitHub REST API shape for GET /repos/{owner}/{repo} */
interface GitHubRepoResponse {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  topics: string[];
  default_branch: string;
  created_at: string;
  updated_at: string;
  license: { name: string } | null;
  html_url: string;
  homepage: string | null;
}

/** GitHub REST API shape for a single entry inside a Git tree. */
interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
}

/** GitHub REST API shape for GET /repos/{owner}/{repo}/git/trees/{sha} */
interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

/**
 * Maps a dependency file name to its canonical type key.
 * The order matters: we iterate top-to-bottom.
 */
const DEPENDENCY_FILES: ReadonlyArray<{ filename: string; type: string }> = [
  { filename: "package.json", type: "package_json" },
  { filename: "requirements.txt", type: "requirements_txt" },
  { filename: "Pipfile", type: "pipfile" },
  { filename: "pyproject.toml", type: "pyproject_toml" },
  { filename: "Cargo.toml", type: "cargo_toml" },
  { filename: "go.mod", type: "go_mod" },
  { filename: "Gemfile", type: "gemfile" },
  { filename: "pom.xml", type: "pom_xml" },
  { filename: "build.gradle", type: "build_gradle" },
  { filename: "composer.json", type: "composer_json" },
];

// ---------------------------------------------------------------------------
// RepoFetcher
// ---------------------------------------------------------------------------

/**
 * High-level helper that pulls all the data needed from a GitHub repository
 * so the portfolio builder can analyse it downstream.
 */
export class RepoFetcher {
  private client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  // -------------------------------------------------------------------------
  // Top-level entry point
  // -------------------------------------------------------------------------

  /**
   * Fetch **all** relevant data for a given repository in parallel where
   * possible.
   */
  async fetchRepoData(owner: string, repo: string): Promise<RepoData> {
    // Metadata must come first so we know the default branch.
    const metadata = await this.fetchMetadata(owner, repo);
    const branch = metadata.defaultBranch;

    // The remaining three calls are independent -- fire them concurrently.
    const [readme, fileTree, dependencies] = await Promise.all([
      this.fetchReadme(owner, repo),
      this.fetchFileTree(owner, repo, branch),
      this.fetchDependencies(owner, repo, branch),
    ]);

    return { metadata, readme, fileTree, dependencies };
  }

  // -------------------------------------------------------------------------
  // Individual fetchers
  // -------------------------------------------------------------------------

  /**
   * GET /repos/{owner}/{repo} and normalise the response into our own shape.
   */
  async fetchMetadata(owner: string, repo: string): Promise<RepoMetadata> {
    const data = await this.client.get<GitHubRepoResponse>(
      `/repos/${owner}/${repo}`,
    );

    return {
      name: data.name,
      fullName: data.full_name,
      description: data.description,
      language: data.language,
      stargazersCount: data.stargazers_count,
      forksCount: data.forks_count,
      topics: data.topics ?? [],
      defaultBranch: data.default_branch,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      license: data.license ? { name: data.license.name } : null,
      htmlUrl: data.html_url,
      homepage: data.homepage ?? null,
    };
  }

  /**
   * Attempt to fetch the repository README via raw.githubusercontent.com.
   * Returns `null` when no README is present (404) or when the request fails.
   */
  async fetchReadme(owner: string, repo: string): Promise<string | null> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`;

    try {
      return await this.client.getText(url);
    } catch {
      // 404 or any other error -- the repo simply has no README.
      return null;
    }
  }

  /**
   * Retrieve the full Git tree for the given branch (recursive).
   * The result is capped at 1 000 entries to keep payloads reasonable.
   */
  async fetchFileTree(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<FileTreeEntry[]> {
    try {
      const data = await this.client.get<GitHubTreeResponse>(
        `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      );

      const MAX_ENTRIES = 1_000;
      return data.tree
        .filter(
          (item): item is GitHubTreeItem & { type: "blob" | "tree" } =>
            item.type === "blob" || item.type === "tree",
        )
        .slice(0, MAX_ENTRIES)
        .map((item) => ({
          path: item.path,
          type: item.type,
          ...(item.size !== undefined ? { size: item.size } : {}),
        }));
    } catch {
      // Empty repo or other error -- return an empty tree.
      return [];
    }
  }

  /**
   * Try to fetch well-known dependency/manifest files from the repo root.
   * Files that don't exist are silently skipped.
   */
  async fetchDependencies(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<DependencyFile[]> {
    const results = await Promise.allSettled(
      DEPENDENCY_FILES.map(async ({ filename, type }) => {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filename}`;
        const content = await this.client.getText(url);
        return { type, content, path: filename } satisfies DependencyFile;
      }),
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<DependencyFile> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);
  }
}
