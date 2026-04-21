import React from "react";
import type { ProfileData } from "@/templates/_shared/types";
import { ContactSection } from "../components/ContactSection";

interface ContactPageProps {
  profileData: ProfileData;
}

export function ContactPage({ profileData }: ContactPageProps) {
  return <ContactSection basics={profileData.basics} />;
}
