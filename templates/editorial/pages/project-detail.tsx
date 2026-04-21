import React from "react";
import type { Project } from "@/templates/_shared/types";
import { ProjectDetail } from "../components/ProjectDetail";

interface ProjectDetailPageProps {
  project: Project;
}

export function ProjectDetailPage({ project }: ProjectDetailPageProps) {
  return <ProjectDetail project={project} />;
}
