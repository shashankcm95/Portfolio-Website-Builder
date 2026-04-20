import React from "react";
import type { ProfileData, Skill } from "@/templates/_shared/types";

interface AboutProps {
  profileData: ProfileData;
}

/**
 * About section displaying summary, skills, experience, and education.
 */
export function About({ profileData }: AboutProps) {
  const { basics, skills, experience, education } = profileData;

  // Group skills by category
  const skillsByCategory = skills.reduce<Record<string, Skill[]>>(
    (acc, skill) => {
      const category = skill.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(skill);
      return acc;
    },
    {}
  );

  const categoryLabels: Record<string, string> = {
    language: "Languages",
    framework: "Frameworks & Libraries",
    tool: "Tools & Infrastructure",
    concept: "Concepts & Patterns",
    other: "Other",
  };

  return (
    <div>
      {/* Summary */}
      <section className="section">
        <div className="container container-narrow">
          <div className="section-header">
            <h2>About Me</h2>
          </div>
          <p>{basics.summary}</p>
        </div>
      </section>

      {/* Skills */}
      {skills.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2>Skills</h2>
              <p>Technologies and concepts I work with</p>
            </div>
            {Object.entries(skillsByCategory).map(
              ([category, categorySkills]) => (
                <div key={category} className="skills-group">
                  <h4 className="skills-group-title">
                    {categoryLabels[category] || category}
                  </h4>
                  <div className="badge-group">
                    {categorySkills.map((skill) => (
                      <span key={skill.name} className="badge">
                        {skill.name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {/* Experience */}
      {experience && experience.length > 0 && (
        <section className="section">
          <div className="container container-narrow">
            <div className="section-header">
              <h2>Experience</h2>
            </div>
            <div className="timeline">
              {experience.map((exp, index) => (
                <div key={index} className="timeline-item">
                  <div className="timeline-date">
                    {exp.startDate}
                    {exp.endDate ? ` — ${exp.endDate}` : " — Present"}
                  </div>
                  <h3 className="timeline-title">{exp.position}</h3>
                  <div className="timeline-subtitle">{exp.company}</div>
                  {exp.summary && (
                    <p className="timeline-content">{exp.summary}</p>
                  )}
                  {exp.highlights && exp.highlights.length > 0 && (
                    <ul className="timeline-highlights">
                      {exp.highlights.map((highlight, hIndex) => (
                        <li key={hIndex}>{highlight}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Education */}
      {education && education.length > 0 && (
        <section className="section">
          <div className="container container-narrow">
            <div className="section-header">
              <h2>Education</h2>
            </div>
            <div className="timeline">
              {education.map((edu, index) => (
                <div key={index} className="timeline-item">
                  {(edu.startDate || edu.endDate) && (
                    <div className="timeline-date">
                      {edu.startDate || ""}
                      {edu.endDate ? ` — ${edu.endDate}` : ""}
                    </div>
                  )}
                  <h3 className="timeline-title">{edu.institution}</h3>
                  <div className="timeline-subtitle">
                    {edu.studyType} in {edu.area}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
