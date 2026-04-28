import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface AboutPageProps {
  profileData: ProfileData;
}

function formatRange(start: string, end?: string): string {
  const s = start?.substring(0, 4) || "";
  const e = end ? end.substring(0, 4) : "Present";
  return s && s !== e ? `${s} — ${e}` : s;
}

/**
 * About page — bio + experience timeline. Lighter motion than the
 * home hero (no full-bleed video / blur-text); section-level scroll
 * reveals only.
 */
export function AboutPage({ profileData }: AboutPageProps) {
  const { basics, experience, education } = profileData;

  return (
    <>
      <section aria-label="About">
        <div
          className="section-head animate-blur-fade-up"
          style={{ "--d": "0ms" } as React.CSSProperties}
        >
          <span className="section-eyebrow">About</span>
          <h2>
            <em>{basics.name}</em>
          </h2>
        </div>

        <div
          className="prose animate-blur-fade-up"
          style={{ "--d": "180ms" } as React.CSSProperties}
        >
          {basics.positioning && (
            <p>
              <strong>{basics.positioning}</strong>
            </p>
          )}
          <p>{basics.summary}</p>
          {basics.namedEmployers && basics.namedEmployers.length > 0 && (
            <p>
              Previously at{" "}
              {basics.namedEmployers.map((e, i) => (
                <React.Fragment key={e}>
                  <strong>{e}</strong>
                  {i < (basics.namedEmployers?.length ?? 0) - 1 && ", "}
                </React.Fragment>
              ))}
              .
            </p>
          )}
        </div>
      </section>

      {experience && experience.length > 0 && (
        <section aria-label="Experience" className="scroll-reveal">
          <div className="section-head">
            <span className="section-eyebrow">Experience</span>
            <h2>Where I've worked</h2>
          </div>
          <ol className="experience-list">
            {experience.map((exp, i) => (
              <li className="experience-item" key={`${exp.company}-${i}`}>
                <div className="experience-range">
                  {formatRange(exp.startDate, exp.endDate)}
                </div>
                <div>
                  <h3 className="experience-position">{exp.position}</h3>
                  <p className="experience-company">{exp.company}</p>
                  {exp.summary && (
                    <p className="experience-summary">{exp.summary}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {education && education.length > 0 && (
        <section aria-label="Education" className="scroll-reveal">
          <div className="section-head">
            <span className="section-eyebrow">Education</span>
            <h2>Studied</h2>
          </div>
          <ol className="experience-list">
            {education.map((edu, i) => (
              <li className="experience-item" key={`${edu.institution}-${i}`}>
                <div className="experience-range">
                  {formatRange(edu.startDate || "", edu.endDate)}
                </div>
                <div>
                  <h3 className="experience-position">
                    {edu.studyType} {edu.area && `— ${edu.area}`}
                  </h3>
                  <p className="experience-company">{edu.institution}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
