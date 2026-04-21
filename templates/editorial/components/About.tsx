import React from "react";
import type { ProfileData, Skill } from "@/templates/_shared/types";

interface AboutProps {
  profileData: ProfileData;
}

/**
 * Phase 7 — Editorial About.
 *
 * Display-face section opens with neo-brutalist accent rule, skills
 * as bordered cards in a grid, timeline rows with serif titles +
 * sans-serif eyebrows.
 */
export function About({ profileData }: AboutProps) {
  const { basics, skills, experience, education } = profileData;

  const byCategory = skills.reduce<Record<string, Skill[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});
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
        <div className="section-header">
          <p className="section-eyebrow">Profile</p>
          <h2>About</h2>
        </div>
        <p className="about-summary">{basics.summary}</p>
      </section>

      {skills.length > 0 && (
        <section className="section">
          <div className="section-header">
            <p className="section-eyebrow">Stack</p>
            <h2>Skills &amp; Tools</h2>
          </div>
          <div className="skills-grid">
            {Object.entries(byCategory).map(([category, list]) => (
              <div key={category} className="skills-card">
                <p className="skills-card-title">
                  {categoryLabels[category] ?? category}
                </p>
                <p className="skills-card-list">
                  {list.map((s) => s.name).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {experience && experience.length > 0 && (
        <section className="section">
          <div className="section-header">
            <p className="section-eyebrow">Career</p>
            <h2>Experience</h2>
          </div>
          <div>
            {experience.map((exp, i) => (
              <div key={i} className="timeline-row">
                <div className="timeline-when">
                  {exp.startDate?.slice(0, 4) ?? ""}
                  {exp.endDate ? ` — ${exp.endDate.slice(0, 4)}` : " — Present"}
                </div>
                <div>
                  <h3 className="timeline-title">{exp.position}</h3>
                  <p className="timeline-where">{exp.company}</p>
                  {exp.summary && <p>{exp.summary}</p>}
                  {exp.highlights && exp.highlights.length > 0 && (
                    <ul style={{ paddingLeft: "1.2em", marginTop: "0.6em" }}>
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
          <div className="section-header">
            <p className="section-eyebrow">School</p>
            <h2>Education</h2>
          </div>
          <div>
            {education.map((edu, i) => (
              <div key={i} className="timeline-row">
                <div className="timeline-when">
                  {edu.startDate?.slice(0, 4) ?? ""}
                  {edu.endDate ? ` — ${edu.endDate.slice(0, 4)}` : ""}
                </div>
                <div>
                  <h3 className="timeline-title">{edu.institution}</h3>
                  <p className="timeline-where">
                    {edu.studyType} in {edu.area}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
