import { Github, Upload, AlertTriangle } from "lucide-react";
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

export default function SettingsPage() {
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
            <CardDescription>Your account information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              {/* TODO: Replace with actual user data */}
              <Input value="User Name" readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              {/* TODO: Replace with actual user data */}
              <Input value="user@example.com" readOnly className="bg-muted" />
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
              Connect your GitHub account to import repositories.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* TODO: Show actual connection status */}
              <Badge variant="outline">Not connected</Badge>
            </div>
            <Button variant="outline">
              {/* TODO: Wire up GitHub OAuth connection */}
              Connect GitHub
            </Button>
          </CardContent>
        </Card>

        {/* Resume section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Resume
            </CardTitle>
            <CardDescription>
              Upload your resume to enrich your portfolio with experience data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* TODO: Wire up file upload functionality */}
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
              <Upload className="h-8 w-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium mb-1">
                Drop your resume here or click to upload
              </p>
              <p className="text-xs text-muted-foreground">
                Supports PDF and DOCX files up to 10MB
              </p>
              <Button variant="outline" size="sm" className="mt-4">
                Choose File
              </Button>
            </div>
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
              {/* TODO: Wire up account deletion with confirmation dialog */}
              Delete Account
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
