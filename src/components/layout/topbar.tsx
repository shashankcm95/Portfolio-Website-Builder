"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserButton } from "@/components/auth/user-button";

interface TopbarProps {
  onMenuClick?: () => void;
  children?: React.ReactNode;
}

export function Topbar({ onMenuClick, children }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      {/* Page title / children slot */}
      <div className="flex-1">{children}</div>

      {/* User button */}
      <UserButton />
    </header>
  );
}
