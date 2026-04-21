import { mkdtemp, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import type { GeneratedFiles } from "./renderer";

export async function writeOutput(
  portfolioId: string,
  files: GeneratedFiles
): Promise<string> {
  const outputDir = await mkdtemp(
    path.join(os.tmpdir(), `portfolio-${portfolioId}-`)
  );

  for (const [filePath, content] of files) {
    const fullPath = path.join(outputDir, filePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    // Phase 8.5 — binary files (e.g. baked og.png Buffer) write raw;
    // text files (HTML/CSS/XML) write as UTF-8.
    if (Buffer.isBuffer(content)) {
      await writeFile(fullPath, content);
    } else {
      await writeFile(fullPath, content, "utf-8");
    }
  }

  return outputDir;
}
