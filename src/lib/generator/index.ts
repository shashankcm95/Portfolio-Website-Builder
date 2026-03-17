import { assembleProfileData } from "./profile-data";
import { renderTemplate } from "./renderer";
import { writeOutput } from "./output";

export async function generatePortfolioSite(
  portfolioId: string,
  templateId: string = "minimal"
): Promise<string> {
  // 1. Assemble ProfileData from database
  const profileData = await assembleProfileData(portfolioId);

  // 2. Render template to static HTML/CSS/JS
  const files = await renderTemplate(templateId, profileData);

  // 3. Write output to temp directory
  const outputDir = await writeOutput(portfolioId, files);

  return outputDir;
}
