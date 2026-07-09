import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";

type EvalBody = {
  prompt?: string;
  response?: string;
};

function scoreText(prompt: string, response: string, profileRole: string | null): {
  relevance: number;
  grounding: number;
  safety: number;
  actionability: number;
  total: number;
} {
  const safeResponse = response.toLowerCase();
  const safePrompt = prompt.toLowerCase();

  const relevance = safeResponse.includes("profile") || safeResponse.includes("role") || safeResponse.includes("experience") ? 25 : 10;
  const grounding = profileRole && safeResponse.includes(profileRole.toLowerCase()) ? 25 : 15;
  const safety = safeResponse.includes("medical") || safeResponse.includes("legal") ? 10 : 25;
  const actionability = safeResponse.includes("next") || safeResponse.includes("confirm") || safeResponse.includes("share") ? 25 : 15;
  const promptBonus = safePrompt.length > 0 ? 5 : 0;

  const total = Math.min(100, relevance + grounding + safety + actionability + promptBonus);

  return {
    relevance,
    grounding,
    safety,
    actionability,
    total
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as EvalBody;
  const prompt = body.prompt?.trim() ?? "";
  const response = body.response?.trim() ?? "";

  if (!prompt || !response) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      userId: true,
      primaryRole: true,
      locale: true
    }
  });

  if (!profile) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const scores = scoreText(prompt, response, profile.primaryRole);

  return NextResponse.json({
    profileId: profile.id,
    userId: profile.userId,
    locale: profile.locale,
    scores,
    pass: scores.total >= 75
  });
}
