import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";

export default function NewPortfolioPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Create Portfolio"
        description="Set up a new portfolio website."
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Portfolio Details</CardTitle>
          <CardDescription>
            Fill in the details below to create your new portfolio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Portfolio Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Portfolio Name</Label>
            <Input
              id="name"
              placeholder="My Developer Portfolio"
              // TODO: Wire up with react-hook-form and server action
            />
          </div>

          {/* URL Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug</Label>
            <Input
              id="slug"
              placeholder="my-portfolio"
              // TODO: Auto-generate from portfolio name
            />
            <p className="text-xs text-muted-foreground">
              Your portfolio will be available at: yoursite.com/
              <span className="font-medium">my-portfolio</span>
            </p>
          </div>

          {/* Template */}
          <div className="space-y-2">
            <Label>Template</Label>
            <div className="flex items-center gap-3 rounded-md border p-4">
              <div className="flex-1">
                <p className="text-sm font-medium">Minimal</p>
                <p className="text-xs text-muted-foreground">
                  A clean, minimal portfolio template focused on content.
                </p>
              </div>
              <Badge variant="secondary">Selected</Badge>
            </div>
            {/* TODO: Add more template options */}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="ghost" asChild>
            <Link href="/portfolios">Cancel</Link>
          </Button>
          <Button>
            {/* TODO: Wire up form submission */}
            Create Portfolio
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
