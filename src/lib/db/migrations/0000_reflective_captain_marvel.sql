CREATE TABLE "chatbot_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"visitor_id" text,
	"messages" jsonb DEFAULT '[]',
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "claim_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"sentence_index" integer NOT NULL,
	"sentence_text" text NOT NULL,
	"fact_ids" text NOT NULL,
	"verification" text DEFAULT 'pending' NOT NULL,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"cf_project_name" text NOT NULL,
	"cf_deployment_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"url" text,
	"custom_domain" text,
	"error_message" text,
	"deployed_at" timestamp with time zone,
	"profile_data_hash" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "derived_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"claim" text NOT NULL,
	"derivation_rule" text NOT NULL,
	"source_fact_ids" text NOT NULL,
	"confidence" real DEFAULT 0.7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"verification_status" text DEFAULT 'pending',
	"ssl_status" text DEFAULT 'pending',
	"dns_record_type" text DEFAULT 'CNAME',
	"dns_target" text,
	"last_checked" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chunk_type" text NOT NULL,
	"chunk_text" text NOT NULL,
	"source_ref" text,
	"embedding" text NOT NULL,
	"metadata" jsonb DEFAULT '{}',
	"embedding_bge" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"claim" text NOT NULL,
	"category" text NOT NULL,
	"confidence" real DEFAULT 0.8 NOT NULL,
	"evidence_type" text NOT NULL,
	"evidence_ref" text,
	"evidence_text" text,
	"source_id" uuid,
	"is_verified" boolean DEFAULT false,
	"owner_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "generated_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"section_type" text NOT NULL,
	"variant" text DEFAULT 'recruiter' NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_user_edited" boolean DEFAULT false,
	"user_content" text,
	"model_used" text,
	"prompt_hash" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "layout_review_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_id" uuid NOT NULL,
	"rule" text NOT NULL,
	"tier" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"page" text,
	"viewport" integer,
	"element_selector" text,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "layout_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"template_id" text NOT NULL,
	"status" text NOT NULL,
	"score" integer,
	"tier2_available" boolean DEFAULT false NOT NULL,
	"tier3_available" boolean DEFAULT false NOT NULL,
	"ai_summary" text,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pipeline_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "pipeline_jobs_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "pipeline_step_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"step_name" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"model_used" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd_micros" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"template_id" text DEFAULT 'minimal' NOT NULL,
	"profile_data" jsonb,
	"status" text DEFAULT 'draft',
	"settings" jsonb DEFAULT '{}',
	"chatbot_enabled" boolean DEFAULT true NOT NULL,
	"chatbot_greeting" text,
	"chatbot_starters" jsonb DEFAULT '[]' NOT NULL,
	"self_hosted_chatbot" boolean DEFAULT false NOT NULL,
	"positioning" text,
	"named_employers" jsonb DEFAULT '[]' NOT NULL,
	"hire_status" text DEFAULT 'not-looking' NOT NULL,
	"hire_cta_text" text,
	"hire_cta_href" text,
	"anchor_stat_override" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_demos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"thumbnail_url" text,
	"oembed_title" text,
	"oembed_fetched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"repo_url" text,
	"repo_owner" text,
	"repo_name" text,
	"display_name" text,
	"display_order" integer DEFAULT 0,
	"is_visible" boolean DEFAULT true,
	"is_featured" boolean DEFAULT false,
	"repo_metadata" jsonb,
	"source_type" text DEFAULT 'github' NOT NULL,
	"manual_description" text,
	"image_url" text,
	"external_url" text,
	"tech_stack" jsonb DEFAULT '[]',
	"pipeline_status" text DEFAULT 'pending',
	"pipeline_error" text,
	"last_analyzed" timestamp with time zone,
	"credibility_signals" jsonb,
	"credibility_fetched_at" timestamp with time zone,
	"project_category" text DEFAULT 'unspecified',
	"project_category_source" text DEFAULT 'auto',
	"dismissed_suggestions" jsonb DEFAULT '[]',
	"show_characterization_on_portfolio" boolean DEFAULT false,
	"outcomes" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "repo_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"content" text,
	"content_hash" text,
	"fetched_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "share_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"token" text NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "share_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"preview_url" text,
	"is_active" boolean DEFAULT true,
	"is_premium" boolean DEFAULT false,
	"config" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"quote" text NOT NULL,
	"author_name" text NOT NULL,
	"author_title" text,
	"author_company" text,
	"author_url" text,
	"avatar_url" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" text NOT NULL,
	"email" text,
	"name" text,
	"avatar_url" text,
	"github_username" text NOT NULL,
	"github_token" text,
	"resume_raw_text" text,
	"resume_json" jsonb,
	"resume_filename" text,
	"onboarding_step" text DEFAULT 'initial',
	"byok_provider" text,
	"byok_key_encrypted" text,
	"byok_model" text,
	"byok_key_last_validated_at" timestamp with time zone,
	"byok_key_last_failure_at" timestamp with time zone,
	"byok_key_last_failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "visitor_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"path" text,
	"referrer" text,
	"user_agent_bucket" text,
	"country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chatbot_sessions" ADD CONSTRAINT "chatbot_sessions_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_map" ADD CONSTRAINT "claim_map_section_id_generated_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."generated_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_facts" ADD CONSTRAINT "derived_facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_id_repo_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."repo_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_sections" ADD CONSTRAINT "generated_sections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layout_review_issues" ADD CONSTRAINT "layout_review_issues_review_id_layout_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."layout_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layout_reviews" ADD CONSTRAINT "layout_reviews_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_jobs" ADD CONSTRAINT "pipeline_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_demos" ADD CONSTRAINT "project_demos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_sources" ADD CONSTRAINT "repo_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_tokens" ADD CONSTRAINT "share_tokens_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_events" ADD CONSTRAINT "visitor_events_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chatbot_sessions_portfolio_id_idx" ON "chatbot_sessions" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "chatbot_sessions_portfolio_visitor_idx" ON "chatbot_sessions" USING btree ("portfolio_id","visitor_id");--> statement-breakpoint
CREATE INDEX "claim_map_section_id_idx" ON "claim_map" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "deployments_portfolio_id_idx" ON "deployments" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "domains_portfolio_id_idx" ON "domains" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "embeddings_project_id_idx" ON "embeddings" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "facts_project_id_idx" ON "facts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "facts_category_idx" ON "facts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "generated_sections_project_id_idx" ON "generated_sections" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_sections_project_section_variant_version_unique" ON "generated_sections" USING btree ("project_id","section_type","variant","version");--> statement-breakpoint
CREATE INDEX "layout_review_issues_review_id_idx" ON "layout_review_issues" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "layout_reviews_portfolio_id_idx" ON "layout_reviews" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "layout_reviews_portfolio_status_idx" ON "layout_reviews" USING btree ("portfolio_id","status");--> statement-breakpoint
CREATE INDEX "pipeline_jobs_project_id_idx" ON "pipeline_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pipeline_jobs_created_at_idx" ON "pipeline_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pipeline_step_runs_job_id_idx" ON "pipeline_step_runs" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolios_user_id_slug_unique" ON "portfolios" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "project_demos_project_id_idx" ON "project_demos" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_demos_project_id_order_idx" ON "project_demos" USING btree ("project_id","order");--> statement-breakpoint
CREATE INDEX "repo_sources_project_id_idx" ON "repo_sources" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "share_tokens_portfolio_id_idx" ON "share_tokens" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "testimonials_portfolio_id_idx" ON "testimonials" USING btree ("portfolio_id");--> statement-breakpoint
CREATE INDEX "visitor_events_portfolio_created_idx" ON "visitor_events" USING btree ("portfolio_id","created_at");