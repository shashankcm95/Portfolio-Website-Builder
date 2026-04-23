import React from "react";
import type { ProfileData } from "@/templates/_shared/types";

interface AboutPageProps {
  profileData: ProfileData;
}

function fmt(start?: string, end?: string): string {
  const s = start?.substring(0, 4) || "";
  const e = end ? end.substring(0, 4) : "Present";
  return s && s !== e ? `${s} – ${e}` : s;
}

export function AboutPage({ profileData }: AboutPageProps) {
  const { basics, experience, education } = profileData;

  return (
    <section className="section">
      <div className="container">
        <div className="section-header">
          <h2>About</h2>
          <p>{basics.positioning || basics.label}</p>
        </div>

        <div className="prose" style={{ marginBottom: "48px" }}>
          <p>{basics.summary}</p>
          {basics.namedEmployers && basics.namedEmployers.length > 0 && (
            <p>
              Has worked with{" "}
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

        {experience && experience.length > 0 && (
          <>
            <div className="section-header" style={{ marginBottom: "24px" }}>
              <h2 style={{ fontSize: "1.5rem" }}>Path</h2>
            </div>
            <ul className="xp-list">
              {experience.map((x, i) => (
                <li className="xp-item" key={`${x.company}-${i}`}>
                  <div className="xp-when">{fmt(x.startDate, x.endDate)}</div>
                  <div className="xp-what">
                    <h4>{x.position}</h4>
                    <p className="xp-role-co">{x.company}</p>
                    {x.summary && <p>{x.summary}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {education && education.length > 0 && (
          <>
            <div
              className="section-header"
              style={{ marginBottom: "24px", marginTop: "56px" }}
            >
              <h2 style={{ fontSize: "1.5rem" }}>Education</h2>
            </div>
            <ul className="xp-list">
              {education.map((ed, i) => (
                <li className="xp-item" key={`${ed.institution}-${i}`}>
                  <div className="xp-when">{fmt(ed.startDate, ed.endDate)}</div>
                  <div className="xp-what">
                    <h4>
                      {ed.studyType}, {ed.area}
                    </h4>
                    <p className="xp-role-co">{ed.institution}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
