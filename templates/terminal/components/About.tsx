import React from "react";
import type { ProfileData, Skill } from "@/templates/_shared/types";

interface AboutProps {
  profileData: ProfileData;
}

/**
 * Phase 7 — Terminal About. Frame each section as a shell command +
 * its output. Skills group renders as `[bracketed]` tag chips.
 */
export function About({ profileData }: AboutProps) {
  const { basics, skills, experience, education } = profileData;
  const byCategory = skills.reduce<Record<string, Skill[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});
  const categoryOrder = ["language", "framework", "tool", "concept", "other"];

  return (
    <div className="container">
      <section className="section">
        <p className="prompt">cat about.md</p>
        <p>{basics.summary}</p>
      </section>

      {skills.length > 0 && (
        <section className="section">
          <p className="prompt">ls skills/</p>
          {categoryOrder
            .filter((c) => byCategory[c]?.length)
            .map((category) => (
              <div key={category}>
                <h3>{category}/</h3>
                <div className="tag-group">
                  {byCategory[category].map((s) => (
                    <span key={s.name} className="tag">{s.name}</span>
                  ))}
                </div>
              </div>
            ))}
        </section>
      )}

      {experience && experience.length > 0 && (
        <section className="section">
          <p className="prompt">history --experience</p>
          <div>
            {experience.map((exp, i) => (
              <div key={i} className="timeline-row">
                <div className="timeline-when">
                  {exp.startDate?.slice(0, 4) ?? ""}
                  {exp.endDate ? ` → ${exp.endDate.slice(0, 4)}` : " → present"}
                </div>
                <div>
                  <div className="timeline-what">
                    {exp.position}{" "}
                    <span className="timeline-where">@ {exp.company}</span>
                  </div>
                  {exp.summary && (
                    <p style={{ margin: "4px 0", color: "var(--text-dim)" }}>
                      {exp.summary}
                    </p>
                  )}
                  {exp.highlights && exp.highlights.length > 0 && (
                    <ul className="facts-list">
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
          <p className="prompt">cat education.md</p>
          <div>
            {education.map((edu, i) => (
              <div key={i} className="timeline-row">
                <div className="timeline-when">
                  {edu.startDate?.slice(0, 4) ?? ""}
                  {edu.endDate ? ` → ${edu.endDate.slice(0, 4)}` : ""}
                </div>
                <div>
                  <div className="timeline-what">{edu.institution}</div>
                  <div style={{ color: "var(--text-dim)" }}>
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
