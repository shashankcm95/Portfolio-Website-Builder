"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { RepoAddForm } from "@/components/github/repo-add-form";
import { RepoList } from "@/components/github/repo-list";

export default function ProjectsPage() {
  const params = useParams<{ portfolioId: string }>();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projects"
        description="Manage the projects in your portfolio."
      />

      <RepoAddForm
        portfolioId={params.portfolioId}
        onProjectAdded={() => setRefreshKey((k) => k + 1)}
      />

      <RepoList key={refreshKey} portfolioId={params.portfolioId} />
    </div>
  );
}
