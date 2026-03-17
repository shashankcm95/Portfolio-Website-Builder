import { Plus, Briefcase } from "lucide-react";
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

// TODO: Replace with actual portfolio data from the database
const portfolios: Array<{
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
}> = [];

export default function PortfoliosPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Portfolios"
        description="Manage your portfolio websites."
        action={
          <Button asChild>
            <Link href="/portfolios/new">
              <Plus className="mr-2 h-4 w-4" />
              New Portfolio
            </Link>
          </Button>
        }
      />

      {portfolios.length === 0 ? (
        /* Empty state */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Briefcase className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="mb-2 text-xl">No portfolios yet</CardTitle>
            <CardDescription className="mb-6 text-center max-w-sm">
              Create your first portfolio to showcase your projects with
              AI-generated narratives backed by code evidence.
            </CardDescription>
            <Button asChild>
              <Link href="/portfolios/new">
                <Plus className="mr-2 h-4 w-4" />
                Create your first portfolio
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Portfolio grid */
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* TODO: Map over portfolios and render portfolio cards */}
          {portfolios.map((portfolio) => (
            <Link key={portfolio.id} href={`/portfolios/${portfolio.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg">{portfolio.name}</CardTitle>
                  <CardDescription>/{portfolio.slug}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {portfolio.status}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
