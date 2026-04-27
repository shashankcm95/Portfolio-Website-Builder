ALTER TABLE "portfolios" ADD COLUMN "current_role" text;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "current_company" text;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "availability" jsonb;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "role_types" jsonb;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "work_eligibility" jsonb;--> statement-breakpoint
ALTER TABLE "portfolios" ADD COLUMN "location_override" jsonb;