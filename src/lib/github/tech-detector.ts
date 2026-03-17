import type { DependencyFile } from "@/lib/github/repo-fetcher";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DetectedTech {
  name: string;
  category: "language" | "framework" | "library" | "tool";
  /** Which dependency file the detection came from. */
  source: string;
}

// ---------------------------------------------------------------------------
// Technology mappings
// ---------------------------------------------------------------------------

interface TechMapping {
  name: string;
  category: DetectedTech["category"];
}

/**
 * Node / JavaScript ecosystem (package.json)
 */
const NODE_PACKAGES: Record<string, TechMapping> = {
  // Frameworks
  react: { name: "React", category: "framework" },
  "react-dom": { name: "React", category: "framework" },
  next: { name: "Next.js", category: "framework" },
  vue: { name: "Vue", category: "framework" },
  nuxt: { name: "Nuxt", category: "framework" },
  angular: { name: "Angular", category: "framework" },
  "@angular/core": { name: "Angular", category: "framework" },
  svelte: { name: "Svelte", category: "framework" },
  "@sveltejs/kit": { name: "SvelteKit", category: "framework" },
  express: { name: "Express", category: "framework" },
  fastify: { name: "Fastify", category: "framework" },
  "@nestjs/core": { name: "NestJS", category: "framework" },
  nestjs: { name: "NestJS", category: "framework" },
  "react-native": { name: "React Native", category: "framework" },
  gatsby: { name: "Gatsby", category: "framework" },
  remix: { name: "Remix", category: "framework" },
  "@remix-run/react": { name: "Remix", category: "framework" },
  astro: { name: "Astro", category: "framework" },
  hono: { name: "Hono", category: "framework" },
  koa: { name: "Koa", category: "framework" },

  // Libraries
  tailwindcss: { name: "Tailwind CSS", category: "library" },
  prisma: { name: "Prisma", category: "library" },
  "@prisma/client": { name: "Prisma", category: "library" },
  "drizzle-orm": { name: "Drizzle ORM", category: "library" },
  mongoose: { name: "Mongoose", category: "library" },
  sequelize: { name: "Sequelize", category: "library" },
  typeorm: { name: "TypeORM", category: "library" },
  graphql: { name: "GraphQL", category: "library" },
  "apollo-server": { name: "Apollo GraphQL", category: "library" },
  "@apollo/client": { name: "Apollo Client", category: "library" },
  trpc: { name: "tRPC", category: "library" },
  "@trpc/server": { name: "tRPC", category: "library" },
  zod: { name: "Zod", category: "library" },
  redux: { name: "Redux", category: "library" },
  "@reduxjs/toolkit": { name: "Redux Toolkit", category: "library" },
  zustand: { name: "Zustand", category: "library" },
  "framer-motion": { name: "Framer Motion", category: "library" },
  "three": { name: "Three.js", category: "library" },
  "d3": { name: "D3.js", category: "library" },
  "socket.io": { name: "Socket.IO", category: "library" },
  axios: { name: "Axios", category: "library" },
  "react-query": { name: "React Query", category: "library" },
  "@tanstack/react-query": { name: "TanStack Query", category: "library" },
  storybook: { name: "Storybook", category: "tool" },
  "@storybook/react": { name: "Storybook", category: "tool" },

  // Tools / build
  typescript: { name: "TypeScript", category: "language" },
  webpack: { name: "Webpack", category: "tool" },
  vite: { name: "Vite", category: "tool" },
  esbuild: { name: "esbuild", category: "tool" },
  rollup: { name: "Rollup", category: "tool" },
  turbo: { name: "Turborepo", category: "tool" },
  jest: { name: "Jest", category: "tool" },
  vitest: { name: "Vitest", category: "tool" },
  cypress: { name: "Cypress", category: "tool" },
  playwright: { name: "Playwright", category: "tool" },
  "@playwright/test": { name: "Playwright", category: "tool" },
  eslint: { name: "ESLint", category: "tool" },
  prettier: { name: "Prettier", category: "tool" },
  docker: { name: "Docker", category: "tool" },
};

/**
 * Python ecosystem (requirements.txt, Pipfile, pyproject.toml)
 */
const PYTHON_PACKAGES: Record<string, TechMapping> = {
  flask: { name: "Flask", category: "framework" },
  django: { name: "Django", category: "framework" },
  fastapi: { name: "FastAPI", category: "framework" },
  starlette: { name: "Starlette", category: "framework" },
  tornado: { name: "Tornado", category: "framework" },
  sanic: { name: "Sanic", category: "framework" },
  pandas: { name: "pandas", category: "library" },
  numpy: { name: "NumPy", category: "library" },
  "scikit-learn": { name: "scikit-learn", category: "library" },
  sklearn: { name: "scikit-learn", category: "library" },
  tensorflow: { name: "TensorFlow", category: "library" },
  torch: { name: "PyTorch", category: "library" },
  pytorch: { name: "PyTorch", category: "library" },
  langchain: { name: "LangChain", category: "library" },
  celery: { name: "Celery", category: "library" },
  sqlalchemy: { name: "SQLAlchemy", category: "library" },
  pydantic: { name: "Pydantic", category: "library" },
  requests: { name: "Requests", category: "library" },
  httpx: { name: "HTTPX", category: "library" },
  beautifulsoup4: { name: "Beautiful Soup", category: "library" },
  scrapy: { name: "Scrapy", category: "framework" },
  matplotlib: { name: "Matplotlib", category: "library" },
  seaborn: { name: "Seaborn", category: "library" },
  plotly: { name: "Plotly", category: "library" },
  opencv: { name: "OpenCV", category: "library" },
  "opencv-python": { name: "OpenCV", category: "library" },
  pillow: { name: "Pillow", category: "library" },
  pytest: { name: "pytest", category: "tool" },
  uvicorn: { name: "Uvicorn", category: "tool" },
  gunicorn: { name: "Gunicorn", category: "tool" },
  black: { name: "Black", category: "tool" },
  ruff: { name: "Ruff", category: "tool" },
  mypy: { name: "mypy", category: "tool" },
};

/**
 * Rust ecosystem (Cargo.toml)
 */
const RUST_CRATES: Record<string, TechMapping> = {
  "actix-web": { name: "Actix Web", category: "framework" },
  tokio: { name: "Tokio", category: "library" },
  serde: { name: "Serde", category: "library" },
  clap: { name: "Clap", category: "library" },
  warp: { name: "Warp", category: "framework" },
  rocket: { name: "Rocket", category: "framework" },
  axum: { name: "Axum", category: "framework" },
  diesel: { name: "Diesel", category: "library" },
  sqlx: { name: "SQLx", category: "library" },
  reqwest: { name: "Reqwest", category: "library" },
  hyper: { name: "Hyper", category: "library" },
  tracing: { name: "Tracing", category: "library" },
};

/**
 * Go ecosystem (go.mod)
 */
const GO_MODULES: Record<string, TechMapping> = {
  "github.com/gin-gonic/gin": { name: "Gin", category: "framework" },
  "github.com/labstack/echo": { name: "Echo", category: "framework" },
  "github.com/gofiber/fiber": { name: "Fiber", category: "framework" },
  "github.com/spf13/cobra": { name: "Cobra", category: "library" },
  "gorm.io/gorm": { name: "GORM", category: "library" },
  "github.com/gorilla/mux": { name: "Gorilla Mux", category: "library" },
  "github.com/go-chi/chi": { name: "Chi", category: "library" },
  "google.golang.org/grpc": { name: "gRPC-Go", category: "library" },
};

/**
 * Ruby ecosystem (Gemfile)
 */
const RUBY_GEMS: Record<string, TechMapping> = {
  rails: { name: "Ruby on Rails", category: "framework" },
  sinatra: { name: "Sinatra", category: "framework" },
  sidekiq: { name: "Sidekiq", category: "library" },
  rspec: { name: "RSpec", category: "tool" },
  "rspec-rails": { name: "RSpec", category: "tool" },
  devise: { name: "Devise", category: "library" },
  puma: { name: "Puma", category: "tool" },
  "activerecord": { name: "Active Record", category: "library" },
};

/**
 * Java ecosystem (pom.xml, build.gradle)
 */
const JAVA_ARTIFACTS: Record<string, TechMapping> = {
  "spring-boot": { name: "Spring Boot", category: "framework" },
  "spring-boot-starter": { name: "Spring Boot", category: "framework" },
  "spring-boot-starter-web": { name: "Spring Boot", category: "framework" },
  junit: { name: "JUnit", category: "tool" },
  "junit-jupiter": { name: "JUnit 5", category: "tool" },
  hibernate: { name: "Hibernate", category: "library" },
  "hibernate-core": { name: "Hibernate", category: "library" },
  gradle: { name: "Gradle", category: "tool" },
  lombok: { name: "Lombok", category: "tool" },
  mockito: { name: "Mockito", category: "tool" },
  "jackson-databind": { name: "Jackson", category: "library" },
};

/**
 * PHP ecosystem (composer.json)
 */
const PHP_PACKAGES: Record<string, TechMapping> = {
  "laravel/framework": { name: "Laravel", category: "framework" },
  "laravel/laravel": { name: "Laravel", category: "framework" },
  "symfony/symfony": { name: "Symfony", category: "framework" },
  "symfony/framework-bundle": { name: "Symfony", category: "framework" },
  "slim/slim": { name: "Slim", category: "framework" },
  "phpunit/phpunit": { name: "PHPUnit", category: "tool" },
  "doctrine/orm": { name: "Doctrine ORM", category: "library" },
};

// ---------------------------------------------------------------------------
// Parsers for each dependency file format
// ---------------------------------------------------------------------------

/**
 * Extracts package names from a parsed package.json (handles both
 * `dependencies` and `devDependencies`).
 */
function parsePackageJson(content: string): string[] {
  try {
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

/**
 * Extracts package names from requirements.txt.
 * Each non-empty, non-comment line is treated as `package[==version]`.
 */
function parseRequirementsTxt(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => {
      // Strip version specifiers (==, >=, <=, ~=, !=, [extras])
      const name = line.split(/[=<>!~;@\[]/)[0].trim();
      return name.toLowerCase();
    })
    .filter((name) => name.length > 0);
}

/**
 * Extracts dependency names from a Pipfile.
 * Looks for lines under [packages] and [dev-packages].
 */
function parsePipfile(content: string): string[] {
  const names: string[] = [];
  let inDepsSection = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("[")) {
      inDepsSection =
        line === "[packages]" || line === "[dev-packages]";
      continue;
    }

    if (inDepsSection && line.includes("=")) {
      const name = line.split("=")[0].trim().replace(/"/g, "").toLowerCase();
      if (name.length > 0) names.push(name);
    }
  }

  return names;
}

/**
 * Extracts dependency names from pyproject.toml.
 * Handles the `[project] dependencies = [...]` and
 * `[tool.poetry.dependencies]` formats.
 */
function parsePyprojectToml(content: string): string[] {
  const names: string[] = [];

  // Match items inside dependencies = ["pkg>=1.0", ...]
  const arrayPattern = /dependencies\s*=\s*\[([\s\S]*?)\]/g;
  let match: RegExpExecArray | null;
  while ((match = arrayPattern.exec(content)) !== null) {
    const items = match[1].match(/"([^"]+)"|'([^']+)'/g);
    if (items) {
      for (const item of items) {
        const raw = item.replace(/["']/g, "");
        const name = raw.split(/[=<>!~;\[]/)[0].trim().toLowerCase();
        if (name.length > 0) names.push(name);
      }
    }
  }

  // Also look for [tool.poetry.dependencies] key = "version" lines
  let inPoetryDeps = false;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line.match(/^\[tool\.poetry\.(dependencies|dev-dependencies)\]/)) {
      inPoetryDeps = true;
      continue;
    }
    if (line.startsWith("[")) {
      inPoetryDeps = false;
      continue;
    }
    if (inPoetryDeps && line.includes("=")) {
      const name = line.split("=")[0].trim().toLowerCase();
      if (name.length > 0 && name !== "python") names.push(name);
    }
  }

  return names;
}

/**
 * Extracts crate names from Cargo.toml.
 */
function parseCargoToml(content: string): string[] {
  const names: string[] = [];
  let inDeps = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("[")) {
      inDeps =
        line === "[dependencies]" ||
        line === "[dev-dependencies]" ||
        line === "[build-dependencies]";
      continue;
    }

    if (inDeps && line.includes("=")) {
      const name = line.split("=")[0].trim();
      if (name.length > 0) names.push(name);
    }
  }

  return names;
}

/**
 * Extracts module paths from go.mod (`require` block).
 */
function parseGoMod(content: string): string[] {
  const names: string[] = [];
  let inRequire = false;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("require (")) {
      inRequire = true;
      continue;
    }
    if (line === ")") {
      inRequire = false;
      continue;
    }

    // Single-line require
    if (line.startsWith("require ") && !line.includes("(")) {
      const parts = line.replace("require ", "").trim().split(/\s+/);
      if (parts[0]) names.push(parts[0]);
      continue;
    }

    if (inRequire) {
      const parts = line.split(/\s+/);
      if (parts[0] && !parts[0].startsWith("//")) {
        names.push(parts[0]);
      }
    }
  }

  return names;
}

/**
 * Extracts gem names from a Gemfile.
 * Matches `gem "name"` or `gem 'name'` lines.
 */
function parseGemfile(content: string): string[] {
  const names: string[] = [];
  const gemPattern = /^\s*gem\s+['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null;
  while ((match = gemPattern.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/**
 * Extracts artifact IDs from a pom.xml.
 * Looks for `<artifactId>...</artifactId>` elements.
 */
function parsePomXml(content: string): string[] {
  const names: string[] = [];
  const pattern = /<artifactId>\s*([^<]+)\s*<\/artifactId>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    names.push(match[1].trim());
  }
  return names;
}

/**
 * Extracts dependency names from build.gradle (Groovy or Kotlin DSL).
 * Matches patterns like `implementation 'group:artifact:version'`.
 */
function parseBuildGradle(content: string): string[] {
  const names: string[] = [];
  const pattern =
    /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const parts = match[1].split(":");
    // Use the artifact ID (second part of group:artifact:version)
    if (parts.length >= 2) {
      names.push(parts[1]);
    }
  }
  return names;
}

/**
 * Extracts package names from composer.json.
 */
function parseComposerJson(content: string): string[] {
  try {
    const pkg = JSON.parse(content) as {
      require?: Record<string, string>;
      "require-dev"?: Record<string, string>;
    };
    return [
      ...Object.keys(pkg.require ?? {}),
      ...Object.keys(pkg["require-dev"] ?? {}),
    ];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

/**
 * Analyse an array of dependency files and return the detected technologies.
 *
 * De-duplicates by technology name so the same tech is not reported more than
 * once even if it appears in multiple dependency files.
 */
export function detectTechStack(dependencies: DependencyFile[]): DetectedTech[] {
  const seen = new Set<string>();
  const results: DetectedTech[] = [];

  function addIfNew(tech: TechMapping, source: string): void {
    if (seen.has(tech.name)) return;
    seen.add(tech.name);
    results.push({ name: tech.name, category: tech.category, source });
  }

  for (const dep of dependencies) {
    const packageNames = extractPackageNames(dep);

    const lookupTable = getLookupTable(dep.type);
    if (!lookupTable) continue;

    for (const pkgName of packageNames) {
      const tech = lookupTable[pkgName];
      if (tech) {
        addIfNew(tech, dep.path);
      }
    }
  }

  return results;
}

/**
 * Choose the right parser based on the dependency file type.
 */
function extractPackageNames(dep: DependencyFile): string[] {
  switch (dep.type) {
    case "package_json":
      return parsePackageJson(dep.content);
    case "requirements_txt":
      return parseRequirementsTxt(dep.content);
    case "pipfile":
      return parsePipfile(dep.content);
    case "pyproject_toml":
      return parsePyprojectToml(dep.content);
    case "cargo_toml":
      return parseCargoToml(dep.content);
    case "go_mod":
      return parseGoMod(dep.content);
    case "gemfile":
      return parseGemfile(dep.content);
    case "pom_xml":
      return parsePomXml(dep.content);
    case "build_gradle":
      return parseBuildGradle(dep.content);
    case "composer_json":
      return parseComposerJson(dep.content);
    default:
      return [];
  }
}

/**
 * Return the package-name-to-tech mapping for a given file type.
 */
function getLookupTable(
  type: string,
): Record<string, TechMapping> | null {
  switch (type) {
    case "package_json":
      return NODE_PACKAGES;
    case "requirements_txt":
    case "pipfile":
    case "pyproject_toml":
      return PYTHON_PACKAGES;
    case "cargo_toml":
      return RUST_CRATES;
    case "go_mod":
      return GO_MODULES;
    case "gemfile":
      return RUBY_GEMS;
    case "pom_xml":
    case "build_gradle":
      return JAVA_ARTIFACTS;
    case "composer_json":
      return PHP_PACKAGES;
    default:
      return null;
  }
}
