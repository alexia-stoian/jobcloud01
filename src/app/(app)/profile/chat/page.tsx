import { redirect } from "next/navigation";
import { auth } from "@/auth/config";

export default async function ProfileChatPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/profile/chat");
  }

  redirect("/profile/summary");
}
