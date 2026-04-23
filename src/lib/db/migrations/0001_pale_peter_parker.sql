ALTER TABLE "layout_reviews" ALTER COLUMN "started_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "pipeline_jobs" ALTER COLUMN "started_at" SET DEFAULT now();