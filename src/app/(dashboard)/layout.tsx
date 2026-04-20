"use client";

import * as React from "react";
import { useState } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { LlmStatusBanner } from "@/components/settings/llm-status-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar onMenuClick={() => setSidebarOpen((prev) => !prev)} />

          <main className="flex-1 overflow-y-auto p-6">
            <div className="mb-4">
              <LlmStatusBanner />
            </div>
            {children}
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
