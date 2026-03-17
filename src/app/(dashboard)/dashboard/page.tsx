import { Briefcase, FolderGit2, Rocket, Plus, Upload } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";

const stats = [
  {
    title: "Portfolios",
    value: 0,
    description: "Active portfolios",
    icon: Briefcase,
  },
  {
    title: "Projects",
    value: 0,
    description: "Total projects",
    icon: FolderGit2,
  },
  {
    title: "Deployments",
    value: 0,
    description: "Live deployments",
    icon: Rocket,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Welcome section */}
      <PageHeader
        title="Welcome back"
        description="Here is an overview of your portfolio activity."
      />

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
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No recent activity</p>
            <p className="text-sm text-muted-foreground">
              Create a portfolio to get started.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
