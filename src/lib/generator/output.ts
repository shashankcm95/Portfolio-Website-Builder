import { mkdtemp, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";

export async function writeOutput(
  portfolioId: string,
  files: Map<string, string>
): Promise<string> {
  const outputDir = await mkdtemp(
    path.join(os.tmpdir(), `portfolio-${portfolioId}-`)
  );

  for (const [filePath, content] of files) {
    const fullPath = path.join(outputDir, filePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf-8");
  }

  return outputDir;
}
