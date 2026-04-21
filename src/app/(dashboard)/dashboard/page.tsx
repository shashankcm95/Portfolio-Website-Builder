export const dynamic = "force-dynamic";

import { Briefcase, FolderGit2, Rocket, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql, eq } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { portfolios, projects, deployments, users } from "@/lib/db/schema";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  // Fetch counts + onboarding flags in parallel
  const [portfolioRows, projectRows, deploymentRows, userRow, firstPortfolio] =
    await Promise.all([
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(portfolios)
        .where(eq(portfolios.userId, session.user.id)),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(projects)
        .innerJoin(portfolios, eq(projects.portfolioId, portfolios.id))
        .where(eq(portfolios.userId, session.user.id)),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(deployments)
        .innerJoin(portfolios, eq(deployments.portfolioId, portfolios.id))
        .where(eq(portfolios.userId, session.user.id)),
      db
        .select({ resumeJson: users.resumeJson })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1),
      db
        .select({ id: portfolios.id })
        .from(portfolios)
        .where(eq(portfolios.userId, session.user.id))
        .limit(1),
    ]);

  const stats = [
    {
      title: "Portfolios",
      value: portfolioRows[0]?.count ?? 0,
      description: "Active portfolios",
      icon: Briefcase,
    },
    {
      title: "Projects",
      value: projectRows[0]?.count ?? 0,
      description: "Total projects",
      icon: FolderGit2,
    },
    {
      title: "Deployments",
      value: deploymentRows[0]?.count ?? 0,
      description: "Total deployments",
      icon: Rocket,
    },
  ];

  const userName = session.user.name?.split(" ")[0] ?? "";

  // Phase 10 — Track H. Post-OAuth welcome toast: first visit only, when
  // the user has no portfolios yet and we know their GitHub login.
  // Emitted via a tiny inline script so we don't need a client component
  // wrapper. sessionStorage makes it idempotent. GitHub usernames are
  // [A-Za-z0-9-]; anything non-matching is rejected so we never inject
  // arbitrary text into inline JS.
  const githubUsername = (session.user as { githubUsername?: string })
    .githubUsername;
  const safeGithubUsername =
    typeof githubUsername === "string" &&
    /^[A-Za-z0-9-]{1,39}$/.test(githubUsername)
      ? githubUsername
      : null;

  // Onboarding: hide the checklist once the user has deployed at least once —
  // by then they've completed all three steps and don't need training wheels.
  const hasResume = !!userRow[0]?.resumeJson;
  const hasPortfolio = (portfolioRows[0]?.count ?? 0) > 0;
  const hasProject = (projectRows[0]?.count ?? 0) > 0;
  const hasDeployment = (deploymentRows[0]?.count ?? 0) > 0;
  const showOnboarding = !hasDeployment;

  const showFirstVisitToast = !hasPortfolio && safeGithubUsername !== null;
  const firstVisitToastScript = showFirstVisitToast
    ? `
      (function() {
        try {
          if (sessionStorage.getItem("pw-first-visit-toast-shown")) return;
          sessionStorage.setItem("pw-first-visit-toast-shown", "1");
          var el = document.createElement("div");
          el.setAttribute("role", "status");
          el.setAttribute("data-testid", "first-visit-toast");
          el.style.cssText =
            "position:fixed;bottom:20px;right:20px;z-index:9999;" +
            "background:#0f172a;color:#f8fafc;padding:12px 16px;" +
            "border-radius:8px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,.2);" +
            "max-width:360px;line-height:1.4;";
          el.textContent = "Signed in as @${safeGithubUsername} — Create your first portfolio";
          document.body.appendChild(el);
          setTimeout(function() { el.style.opacity = "0"; el.style.transition = "opacity .3s"; }, 5000);
          setTimeout(function() { el.remove(); }, 5400);
        } catch (e) { /* sessionStorage may be blocked */ }
      })();
    `.trim()
    : null;

  return (
    <div className="space-y-8">
      {firstVisitToastScript && (
        <script
          // Idempotent: sessionStorage guard prevents repeated firings.
          dangerouslySetInnerHTML={{ __html: firstVisitToastScript }}
        />
      )}
      {/* Welcome section */}
      <PageHeader
        title={`Welcome back${userName ? `, ${userName}` : ""}`}
        description="Here is an overview of your portfolio activity."
      />

      {/* Onboarding checklist (hidden once user has deployed at least once) */}
      {showOnboarding && (
        <OnboardingChecklist
          hasResume={hasResume}
          hasPortfolio={hasPortfolio}
          hasProject={hasProject}
          portfolioId={firstPortfolio[0]?.id ?? null}
        />
      )}

      {/* Stats grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Button asChild>
            <Link href="/portfolios/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Portfolio
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/settings">
              <Upload className="mr-2 h-4 w-4" />
              Upload Resume
            </Link>
          </Button>
        </div>
      </div>

      {/* Recent activity */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Recent Activity</h2>
        <ActivityFeed />
      </div>
    </div>
  );
}
