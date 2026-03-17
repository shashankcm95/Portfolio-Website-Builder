import React from "react";
import type { Project } from "@/templates/_shared/types";
import { ProjectDetail } from "../components/ProjectDetail";

interface ProjectDetailPageProps {
  project: Project;
}

/**
 * Individual project detail page.
 */
export function ProjectDetailPage({ project }: ProjectDetailPageProps) {
  return (
    <section className="section">
      <ProjectDetail project={project} />
    </section>
  );
}
