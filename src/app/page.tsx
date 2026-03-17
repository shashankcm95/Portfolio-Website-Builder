import Link from "next/link";
import {
  Brain,
  ShieldCheck,
  Rocket,
  MessageSquare,
  Upload,
  Github,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    icon: Brain,
    title: "AI-Powered Narratives",
    description:
      "Automatically generate compelling project descriptions from your codebase with AI analysis.",
  },
  {
    icon: ShieldCheck,
    title: "Proof-Backed Portfolio",
    description:
      "Every claim in your portfolio is backed by real code evidence from your repositories.",
  },
  {
    icon: Rocket,
    title: "One-Click Deploy",
    description:
      "Deploy your portfolio to the web with a single click. No configuration needed.",
  },
  {
    icon: MessageSquare,
    title: "Portfolio Agent",
    description:
      "An AI agent that answers questions about your work, backed by your actual code.",
  },
];

const steps = [
  {
    number: 1,
    icon: Upload,
    title: "Upload Resume",
    description:
      "Upload your resume to provide context about your experience and skills.",
  },
  {
    number: 2,
    icon: Github,
    title: "Connect GitHub",
    description:
      "Connect your GitHub account to import and analyze your repositories.",
  },
  {
    number: 3,
    icon: Globe,
    title: "Publish Portfolio",
    description:
      "Review the AI-generated content and publish your portfolio to the web.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Your code tells a story.{" "}
          <span className="text-primary">We help the world understand it.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Transform your resume and GitHub repositories into a professional
          portfolio website with AI-generated narratives backed by real code
          evidence.
        </p>
        <div className="mt-10 flex gap-4">
          <Button size="lg" asChild>
            <Link href="/sign-in">Get Started</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#features">Learn More</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t bg-muted/50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to stand out
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Powerful features to build a portfolio that truly represents your
              work.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="border-0 shadow-none bg-transparent">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 mb-2">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Three simple steps to your professional portfolio.
            </p>
          </div>
          <div className="grid gap-12 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="flex flex-col items-center text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold mb-4">
                  {step.number}
                </div>
                <step.icon className="h-8 w-8 text-muted-foreground mb-3" />
                <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-muted/50 px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to build your portfolio?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Get started for free and have your portfolio live in minutes.
          </p>
          <div className="mt-8">
            <Button size="lg" asChild>
              <Link href="/sign-in">Get Started</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Portfolio Builder. All rights
            reserved.
          </p>
          <div className="flex gap-6">
            {/* TODO: Add actual links */}
            <Link
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </Link>
            <Link
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </Link>
            <Link
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
