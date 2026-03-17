export interface PipelineJob {
  id: string;
  projectId: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

const jobs = new Map<string, PipelineJob>();

export function enqueueJob(projectId: string): string {
  const id = crypto.randomUUID();
  jobs.set(id, { id, projectId, status: "queued" });
  return id;
}

export function getJob(jobId: string): PipelineJob | undefined {
  return jobs.get(jobId);
}

export function updateJob(jobId: string, updates: Partial<PipelineJob>): void {
  const job = jobs.get(jobId);
  if (job) {
    jobs.set(jobId, { ...job, ...updates });
  }
}

export function getJobsByProject(projectId: string): PipelineJob[] {
  return Array.from(jobs.values()).filter((j) => j.projectId === projectId);
}

export function clearCompletedJobs(): void {
  for (const [id, job] of jobs.entries()) {
    if (job.status === "completed" || job.status === "failed") {
      jobs.delete(id);
    }
  }
}
