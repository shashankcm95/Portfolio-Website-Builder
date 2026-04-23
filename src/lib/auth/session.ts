import { auth } from "@/lib/auth"

export async function getCurrentUser() {
  const session = await auth()
  if (!session?.user) return null
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
    githubUsername: session.user.githubUsername as string | undefined,
  }
}
