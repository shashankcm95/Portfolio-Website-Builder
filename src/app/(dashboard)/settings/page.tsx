export const dynamic = "force-dynamic";

import { Github, AlertTriangle, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser } from "@/lib/auth/session";
import { ResumeUploadForm } from "@/components/resume/upload-form";
import { LlmProviderForm } from "@/components/settings/llm-provider-form";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Manage your account and preferences."
      />

      <div className="max-w-2xl space-y-6">
        {/* Profile section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profile</CardTitle>
            <CardDescription>Your account information from GitHub.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={user?.name ?? "—"} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? "—"} readOnly className="bg-muted" />
            </div>
          </CardContent>
        </Card>

        {/* GitHub section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Github className="h-5 w-5" />
              GitHub
            </CardTitle>
            <CardDescription>
              Your GitHub account is connected via OAuth.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {user?.githubUsername ? (
                <Badge variant="outline">@{user.githubUsername}</Badge>
              ) : (
                <Badge variant="secondary">Connected</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Provider section — Phase 3.5 BYOK */}
        <Card id="ai-provider">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Provider
            </CardTitle>
            <CardDescription>
              Bring your own OpenAI or Anthropic key. Your key is encrypted
              at rest and only used to power this account&apos;s LLM features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LlmProviderForm />
          </CardContent>
        </Card>

        {/* Resume section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Resume</CardTitle>
            <CardDescription>
              Upload your resume to enrich your portfolio with experience data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResumeUploadForm />
          </CardContent>
        </Card>

        <Separator />

        {/* Danger zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Irreversible actions for your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" disabled>
              Delete Account
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
