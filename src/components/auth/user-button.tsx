"use client"

import { useSession } from "next-auth/react"
import Link from "next/link"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"

export function UserButton() {
  const { data: session, status } = useSession()

  if (status === "loading") {
    return (
      <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
    )
  }

  if (!session?.user) {
    return (
      <Link
        href="/sign-in"
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
      >
        Sign In
      </Link>
    )
  }

  const user = session.user

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          aria-label="User menu"
        >
          {user.image ? (
            <img
              src={user.image}
              alt={user.name || "User avatar"}
              className="h-8 w-8 rounded-full"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-medium text-white">
              {user.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg"
          sideOffset={8}
          align="end"
        >
          <div className="px-3 py-2">
            <p className="text-sm font-medium text-gray-900">
              {user.name || "User"}
            </p>
            {user.email && (
              <p className="text-xs text-gray-500">{user.email}</p>
            )}
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm text-gray-700 outline-none transition-colors hover:bg-gray-100 focus:bg-gray-100"
            >
              Settings
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-gray-200" />

          <DropdownMenu.Item asChild>
            <Link
              href="/sign-out"
              className="flex w-full cursor-pointer items-center rounded-md px-3 py-2 text-sm text-red-600 outline-none transition-colors hover:bg-red-50 focus:bg-red-50"
            >
              Sign Out
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
