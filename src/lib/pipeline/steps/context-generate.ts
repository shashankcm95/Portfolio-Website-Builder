import type { LlmClient } from "@/lib/ai/providers/types";
import { contextPackSchema, type ContextPack } from "@/lib/ai/schemas/context-pack";
import {
  getContextGenerationSystemPrompt,
  buildContextGenerationUserPrompt,
} from "@/lib/ai/prompts/context-generation";
import { throwIfAborted } from "@/lib/pipeline/abort";

/**
 * Maps common npm packages to their categories for rule-based tech stack detection.
 */
const DEPENDENCY_MAP: Record<string, { category: keyof ContextPack["techStack"]; name: string }> = {
  // Frameworks
  next: { category: "frameworks", name: "Next.js" },
  react: { category: "frameworks", name: "React" },
  "react-dom": { category: "frameworks", name: "React" },
  vue: { category: "frameworks", name: "Vue.js" },
  nuxt: { category: "frameworks", name: "Nuxt.js" },
  angular: { category: "frameworks", name: "Angular" },
  "@angular/core": { category: "frameworks", name: "Angular" },
  svelte: { category: "frameworks", name: "Svelte" },
  express: { category: "frameworks", name: "Express.js" },
  fastify: { category: "frameworks", name: "Fastify" },
  nestjs: { category: "frameworks", name: "NestJS" },
  "@nestjs/core": { category: "frameworks", name: "NestJS" },
  gatsby: { category: "frameworks", name: "Gatsby" },
  remix: { category: "frameworks", name: "Remix" },
  "@remix-run/node": { category: "frameworks", name: "Remix" },
  astro: { category: "frameworks", name: "Astro" },
  hono: { category: "frameworks", name: "Hono" },

  // Libraries
  tailwindcss: { category: "libraries", name: "Tailwind CSS" },
  "styled-components": { category: "libraries", name: "styled-components" },
  "@emotion/react": { category: "libraries", name: "Emotion" },
  axios: { category: "libraries", name: "Axios" },
  lodash: { category: "libraries", name: "Lodash" },
  zod: { category: "libraries", name: "Zod" },
  yup: { category: "libraries", name: "Yup" },
  "react-query": { category: "libraries", name: "React Query" },
  "@tanstack/react-query": { category: "libraries", name: "TanStack Query" },
  swr: { category: "libraries", name: "SWR" },
  "react-hook-form": { category: "libraries", name: "React Hook Form" },
  formik: { category: "libraries", name: "Formik" },
  "framer-motion": { category: "libraries", name: "Framer Motion" },
  "react-router-dom": { category: "libraries", name: "React Router" },
  "date-fns": { category: "libraries", name: "date-fns" },
  dayjs: { category: "libraries", name: "Day.js" },
  moment: { category: "libraries", name: "Moment.js" },
  "socket.io": { category: "libraries", name: "Socket.IO" },
  "socket.io-client": { category: "libraries", name: "Socket.IO" },
  graphql: { category: "libraries", name: "GraphQL" },
  "@apollo/client": { category: "libraries", name: "Apollo Client" },
  prisma: { category: "libraries", name: "Prisma" },
  "@prisma/client": { category: "libraries", name: "Prisma" },
  "drizzle-orm": { category: "libraries", name: "Drizzle ORM" },
  sequelize: { category: "libraries", name: "Sequelize" },
  typeorm: { category: "libraries", name: "TypeORM" },
  mongoose: { category: "libraries", name: "Mongoose" },
  redis: { category: "libraries", name: "Redis" },
  ioredis: { category: "libraries", name: "Redis (ioredis)" },
  "next-auth": { category: "libraries", name: "NextAuth.js" },
  passport: { category: "libraries", name: "Passport.js" },
  jsonwebtoken: { category: "libraries", name: "JWT" },
  bcrypt: { category: "libraries", name: "bcrypt" },
  sharp: { category: "libraries", name: "Sharp" },
  "openai": { category: "libraries", name: "OpenAI SDK" },
  "@anthropic-ai/sdk": { category: "libraries", name: "Anthropic Claude SDK" },
  langchain: { category: "libraries", name: "LangChain" },
  stripe: { category: "libraries", name: "Stripe" },

  // Tools
  typescript: { category: "tools", name: "TypeScript" },
  eslint: { category: "tools", name: "ESLint" },
  prettier: { category: "tools", name: "Prettier" },
  jest: { category: "tools", name: "Jest" },
  vitest: { category: "tools", name: "Vitest" },
  "@testing-library/react": { category: "tools", name: "React Testing Library" },
  playwright: { category: "tools", name: "Playwright" },
  "@playwright/test": { category: "tools", name: "Playwright" },
  cypress: { category: "tools", name: "Cypress" },
  webpack: { category: "tools", name: "Webpack" },
  vite: { category: "tools", name: "Vite" },
  esbuild: { category: "tools", name: "esbuild" },
  turbo: { category: "tools", name: "Turborepo" },
  docker: { category: "tools", name: "Docker" },
  "drizzle-kit": { category: "tools", name: "Drizzle Kit" },
  wrangler: { category: "tools", name: "Wrangler (Cloudflare)" },
  husky: { category: "tools", name: "Husky" },
  "lint-staged": { category: "tools", name: "lint-staged" },
  storybook: { category: "tools", name: "Storybook" },
  "@storybook/react": { category: "tools", name: "Storybook" },
};

/**
 * Detects tech stack from package.json dependencies using rule-based mapping.
 */
function detectTechStackFromDependencies(dependencies: Record<string, string>): {
  frameworks: string[];
  libraries: string[];
  tools: string[];
} {
  const frameworks = new Set<string>();
  const libraries = new Set<string>();
  const tools = new Set<string>();

  for (const pkg of Object.keys(dependencies)) {
    const mapping = DEPENDENCY_MAP[pkg];
    if (mapping) {
      switch (mapping.category) {
        case "frameworks":
          frameworks.add(mapping.name);
          break;
        case "libraries":
          libraries.add(mapping.name);
          break;
        case "tools":
          tools.add(mapping.name);
          break;
      }
    }
  }

  return {
    frameworks: Array.from(frameworks),
    libraries: Array.from(libraries),
    tools: Array.from(tools),
  };
}

/**
 * Detects languages from file extensions in the file tree.
 */
function detectLanguagesFromFileTree(fileTree: string): string[] {
  const extensionMap: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".rb": "Ruby",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".kt": "Kotlin",
    ".swift": "Swift",
    ".cs": "C#",
    ".cpp": "C++",
    ".c": "C",
    ".php": "PHP",
    ".scala": "Scala",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".clj": "Clojure",
    ".hs": "Haskell",
    ".css": "CSS",
    ".scss": "SCSS",
    ".html": "HTML",
    ".sql": "SQL",
  };

  const languages = new Set<string>();
  const lines = fileTree.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    for (const [ext, lang] of Object.entries(extensionMap)) {
      if (trimmed.endsWith(ext)) {
        languages.add(lang);
        break;
      }
    }
  }

  return Array.from(languages);
}

export interface ContextGenerateInput {
  fileTree: string;
  dependenciesRaw: string;
  dependenciesParsed?: Record<string, string>;
  readme: string;
}

/**
 * Generates a context pack by combining rule-based tech stack detection
 * with Claude-powered architecture signal extraction.
 */
export async function generateContextPack(
  input: ContextGenerateInput,
  llm: LlmClient,
  signal?: AbortSignal
): Promise<ContextPack> {
  throwIfAborted(signal);
  // Step 1: Rule-based tech stack detection from dependencies
  const detectedLanguages = detectLanguagesFromFileTree(input.fileTree);
  let ruleBasedStack = { frameworks: [] as string[], libraries: [] as string[], tools: [] as string[] };

  if (input.dependenciesParsed) {
    ruleBasedStack = detectTechStackFromDependencies(input.dependenciesParsed);
  }

  // Step 2: Claude for architecture signal extraction and enrichment
  const systemPrompt = getContextGenerationSystemPrompt();
  const userPrompt = buildContextGenerationUserPrompt({
    fileTree: input.fileTree,
    dependencies: input.dependenciesRaw,
    readme: input.readme,
  });

  let claudeContextPack: ContextPack;
  try {
    claudeContextPack = await llm.structured<ContextPack>({
      systemPrompt,
      userPrompt,
      maxTokens: 4096,
    });

    // Validate against schema
    claudeContextPack = contextPackSchema.parse(claudeContextPack);
  } catch (error) {
    console.warn(
      "[context-generate] Claude analysis failed, using rule-based fallback:",
      error instanceof Error ? error.message : error
    );

    // Fallback to purely rule-based context pack
    return {
      techStack: {
        languages: detectedLanguages,
        ...ruleBasedStack,
      },
      architecture: {
        type: "unknown",
        pattern: "unknown",
        signals: [],
      },
      complexity: {
        fileCount: input.fileTree.split("\n").filter((l) => l.trim()).length,
        languages: {},
      },
      keyFeatures: [],
    };
  }

  // Step 3: Merge rule-based and Claude results (rule-based takes precedence for tech stack)
  const mergedLanguages = Array.from(
    new Set([...detectedLanguages, ...claudeContextPack.techStack.languages])
  );
  const mergedFrameworks = Array.from(
    new Set([...ruleBasedStack.frameworks, ...claudeContextPack.techStack.frameworks])
  );
  const mergedLibraries = Array.from(
    new Set([...ruleBasedStack.libraries, ...claudeContextPack.techStack.libraries])
  );
  const mergedTools = Array.from(
    new Set([...ruleBasedStack.tools, ...claudeContextPack.techStack.tools])
  );

  return {
    techStack: {
      languages: mergedLanguages,
      frameworks: mergedFrameworks,
      libraries: mergedLibraries,
      tools: mergedTools,
    },
    architecture: claudeContextPack.architecture,
    complexity: claudeContextPack.complexity,
    keyFeatures: claudeContextPack.keyFeatures,
  };
}
