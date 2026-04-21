import React from "react";
import type { ProfileData, Skill } from "@/templates/_shared/types";

interface AboutProps {
  profileData: ProfileData;
}

/**
 * Phase 7 — Research template About.
 *
 * Compact academic CV layout: bio paragraph, skills as inline lists
 * (no chips), career timeline with year-left / role-right grid. No
 * card chrome, no badges, no spacing flourishes.
 */
export function About({ profileData }: AboutProps) {
  const { basics, skills, experience, education } = profileData;

  // Group skills by category for inline rendering.
  const skillsByCategory = skills.reduce<Record<string, Skill[]>>(
    (acc, skill) => {
      (acc[skill.category] ??= []).push(skill);
      return acc;
    },
    {}
  );

  const categoryLabels: Record<string, string> = {
    language: "Languages",
    framework: "Frameworks",
    tool: "Tools",
    concept: "Concepts",
    other: "Other",
  };

  return (
    <div className="container">
      <section className="section">
        <h2>About</h2>
        <p>{basics.summary}</p>
      </section>

      {skills.length > 0 && (
        <section className="section">
          <h2>Areas</h2>
          {Object.entries(skillsByCategory).map(([category, list]) => (
            <div key={category} className="skills-group">
              <p className="skills-group-title">
                {categoryLabels[category] ?? category}
              </p>
              <p className="skills-inline">
                {list.map((s) => (
                  <span key={s.name}>{s.name}</span>
                ))}
              </p>
            </div>
          ))}
        </section>
      )}

      {experience && experience.length > 0 && (
        <section className="section">
          <h2>Experience</h2>
          <div className="timeline">
            {experience.map((exp, i) => (
              <div key={i} className="timeline-item">
                <div className="timeline-date">
                  {formatDateRange(exp.startDate, exp.endDate)}
                </div>
                <div>
                  <h3 className="timeline-title">{exp.position}</h3>
                  <div className="timeline-subtitle">{exp.company}</div>
                  {exp.summary && (
                    <p className="timeline-content">{exp.summary}</p>
                  )}
                  {exp.highlights && exp.highlights.length > 0 && (
                    <ul className="timeline-highlights">
                      {exp.highlights.map((h, hi) => (
                        <li key={hi}>{h}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {education && education.length > 0 && (
        <section className="section">
          <h2>Education</h2>
          <div className="timeline">
            {education.map((edu, i) => (
              <div key={i} className="timeline-item">
                <div className="timeline-date">
                  {formatDateRange(edu.startDate, edu.endDate)}
                </div>
                <div>
                  <h3 className="timeline-title">{edu.institution}</h3>
                  <div className="timeline-subtitle">
                    {edu.studyType} in {edu.area}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return "";
  const s = (start ?? "").slice(0, 4) || "";
  const e = end ? end.slice(0, 4) : start ? "Present" : "";
  return s && e ? `${s} – ${e}` : s || e;
}
