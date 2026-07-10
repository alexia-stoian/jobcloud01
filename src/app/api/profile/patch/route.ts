import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const source = request.headers.get("x-profile-write-source");
  if (source !== "chat_confirmed" && source !== "system_revert") {
    return NextResponse.json(
      {
        error: "chat_only_editing_enforced",
        message: "Profile updates are accepted only from confirmed chat intents in Phase 1."
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ success: true, acceptedSource: source });
}
