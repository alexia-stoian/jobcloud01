import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { revertLastProfileMutation } from "@/lib/profile/service";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await revertLastProfileMutation(session.user.id);
  return NextResponse.json({ success: true });
}
