"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StructuredResume } from "@/lib/ai/schemas/resume";
import {
  User,
  Mail,
  Phone,
  Globe,
  MapPin,
  Briefcase,
  GraduationCap,
  Code,
  FolderOpen,
  Award,
  ExternalLink,
  Calendar,
} from "lucide-react";

interface ResumePreviewProps {
  data: StructuredResume;
}

function formatDateRange(start?: string, end?: string): string {
  if (!start) return "";
  const endLabel = end ?? "Present";
  return `${start} - ${endLabel}`;
}

function ContactInfoSection({ basics }: { basics: StructuredResume["basics"] }) {
  const location = basics.location;
  const locationStr = [location?.city, location?.region, location?.country]
    .filter(Boolean)
    .join(", ");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl">{basics.name}</CardTitle>
        </div>
        {basics.label && (
          <CardDescription className="text-base">{basics.label}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {basics.email && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 shrink-0" />
              <span className="truncate">{basics.email}</span>
            </div>
          )}
          {basics.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4 shrink-0" />
              <span>{basics.phone}</span>
            </div>
          )}
          {basics.url && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4 shrink-0" />
              <span className="truncate">{basics.url}</span>
            </div>
          )}
          {locationStr && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{locationStr}</span>
            </div>
          )}
        </div>
        {basics.profiles && basics.profiles.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {basics.profiles.map((profile, idx) => (
              <Badge key={idx} variant="outline">
                <ExternalLink className="mr-1 h-3 w-3" />
                {profile.network}: {profile.username}
              </Badge>
            ))}
          </div>
        )}
        {basics.summary && (
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {basics.summary}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SkillsSection({ skills }: { skills: StructuredResume["skills"] }) {
  if (!skills || skills.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl">Skills</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {skills.map((skill, idx) => (
            <div key={idx}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{skill.name}</span>
                {skill.level && (
                  <Badge variant="secondary" className="text-xs">
                    {skill.level}
                  </Badge>
                )}
              </div>
              {skill.keywords && skill.keywords.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {skill.keywords.map((keyword, kidx) => (
                    <Badge key={kidx} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ExperienceSection({ work }: { work: StructuredResume["work"] }) {
  if (!work || work.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl">Experience</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-6">
          {work.map((entry, idx) => (
            <div key={idx} className="relative pl-6">
              {/* Timeline dot and line */}
              <div className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
              {idx < work.length - 1 && (
                <div className="absolute left-[4.5px] top-4 h-[calc(100%+8px)] w-px bg-border" />
              )}

              <div>
                <h4 className="text-sm font-semibold">{entry.position}</h4>
                <p className="text-sm text-muted-foreground">{entry.company}</p>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {formatDateRange(entry.startDate, entry.endDate)}
                  </span>
                </div>
                {entry.summary && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {entry.summary}
                  </p>
                )}
                {entry.highlights && entry.highlights.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {entry.highlights.map((highlight, hidx) => (
                      <li
                        key={hidx}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EducationSection({
  education,
}: {
  education: StructuredResume["education"];
}) {
  if (!education || education.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl">Education</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {education.map((entry, idx) => (
            <div key={idx}>
              <h4 className="text-sm font-semibold">{entry.institution}</h4>
              {(entry.studyType || entry.area) && (
                <p className="text-sm text-muted-foreground">
                  {[entry.studyType, entry.area].filter(Boolean).join(" in ")}
                </p>
              )}
              {(entry.startDate || entry.endDate) && (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {formatDateRange(entry.startDate, entry.endDate)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectsSection({
  projects,
}: {
  projects: StructuredResume["projects"];
}) {
  if (!projects || projects.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl">Projects</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {projects.map((project, idx) => (
            <div key={idx}>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-semibold">{project.name}</h4>
                {project.url && (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {project.description && (
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {project.description}
                </p>
              )}
              {project.highlights && project.highlights.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {project.highlights.map((highlight, hidx) => (
                    <li
                      key={hidx}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              )}
              {project.keywords && project.keywords.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {project.keywords.map((keyword, kidx) => (
                    <Badge key={kidx} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CertificationsSection({
  certifications,
}: {
  certifications: StructuredResume["certifications"];
}) {
  if (!certifications || certifications.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl">Certifications</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {certifications.map((cert, idx) => (
            <div key={idx}>
              <h4 className="text-sm font-semibold">{cert.name}</h4>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {cert.issuer && <span>{cert.issuer}</span>}
                {cert.issuer && cert.date && (
                  <span className="text-border">|</span>
                )}
                {cert.date && <span>{cert.date}</span>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ResumePreview({ data }: ResumePreviewProps) {
  const totalSkills =
    data.skills?.reduce(
      (acc, skill) => acc + 1 + (skill.keywords?.length ?? 0),
      0
    ) ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary stats bar */}
      <div className="flex flex-wrap gap-3">
        {data.work && data.work.length > 0 && (
          <Badge variant="secondary">
            <Briefcase className="mr-1 h-3 w-3" />
            {data.work.length} position{data.work.length !== 1 ? "s" : ""}
          </Badge>
        )}
        {totalSkills > 0 && (
          <Badge variant="secondary">
            <Code className="mr-1 h-3 w-3" />
            {totalSkills} skill{totalSkills !== 1 ? "s" : ""}
          </Badge>
        )}
        {data.education && data.education.length > 0 && (
          <Badge variant="secondary">
            <GraduationCap className="mr-1 h-3 w-3" />
            {data.education.length} degree{data.education.length !== 1 ? "s" : ""}
          </Badge>
        )}
        {data.projects && data.projects.length > 0 && (
          <Badge variant="secondary">
            <FolderOpen className="mr-1 h-3 w-3" />
            {data.projects.length} project{data.projects.length !== 1 ? "s" : ""}
          </Badge>
        )}
        {data.certifications && data.certifications.length > 0 && (
          <Badge variant="secondary">
            <Award className="mr-1 h-3 w-3" />
            {data.certifications.length} certification
            {data.certifications.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Sections */}
      <ContactInfoSection basics={data.basics} />
      <SkillsSection skills={data.skills} />
      <ExperienceSection work={data.work} />
      <EducationSection education={data.education} />
      <ProjectsSection projects={data.projects} />
      <CertificationsSection certifications={data.certifications} />
    </div>
  );
}
