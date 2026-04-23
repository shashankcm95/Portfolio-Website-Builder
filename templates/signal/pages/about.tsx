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
 * About page: bio prose + experience timeline + optional education.
 * Skills are intentionally absent; their evidence lives on project cards.
 */
export function AboutPage({ profileData }: AboutPageProps) {
  const { basics, experience, education } = profileData;

  return (
    <>
      <section aria-label="About">
        <div className="section-head">
          <span className="section-eyebrow">About</span>
          <h2>{basics.name}</h2>
        </div>
        <div className="prose">
          {basics.positioning && (
            <p>
              <strong style={{ color: "var(--color-text)" }}>
                {basics.positioning}
              </strong>
            </p>
          )}
          <p>{basics.summary}</p>
          {basics.namedEmployers && basics.namedEmployers.length > 0 && (
            <p>
              Previously at{" "}
              {basics.namedEmployers.map((e, i) => (
                <React.Fragment key={e}>
                  {i > 0 && ", "}
                  <strong>{e}</strong>
                </React.Fragment>
              ))}
              .
            </p>
          )}
        </div>
      </section>

      {experience && experience.length > 0 && (
        <section aria-label="Experience">
          <div className="section-head">
            <span className="section-eyebrow">Path</span>
            <h2>Experience</h2>
          </div>
          <ul className="xp-list">
            {experience.map((x, i) => (
              <li className="xp-item" key={`${x.company}-${i}`}>
                <div className="xp-when">
                  {formatRange(x.startDate, x.endDate)}
                </div>
                <div className="xp-what">
                  <h4>{x.position}</h4>
                  <p className="role-co">{x.company}</p>
                  {x.summary && <p>{x.summary}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {education && education.length > 0 && (
        <section aria-label="Education">
          <div className="section-head">
            <span className="section-eyebrow">Study</span>
            <h2>Education</h2>
          </div>
          <ul className="xp-list">
            {education.map((ed, i) => (
              <li className="xp-item" key={`${ed.institution}-${i}`}>
                <div className="xp-when">
                  {formatRange(ed.startDate ?? "", ed.endDate)}
                </div>
                <div className="xp-what">
                  <h4>
                    {ed.studyType}, {ed.area}
                  </h4>
                  <p className="role-co">{ed.institution}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
