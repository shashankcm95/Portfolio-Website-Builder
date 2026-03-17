import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { About } from "../components/About";

interface AboutPageProps {
  profileData: ProfileData;
}

/**
 * About page rendering the full About component.
 */
export function AboutPage({ profileData }: AboutPageProps) {
  return <About profileData={profileData} />;
}
