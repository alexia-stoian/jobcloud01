/**
 * Greeting Handlers
 * 
 * First-time vs. returning user greetings with session awareness
 */

import type { CandidateProfile } from "@prisma/client";
import type { AssistantState } from "@/types/assistant-state";
import { getResumablePhase } from "@/types/assistant-state";

export interface GreetingResponse {
  message: string;
  nextPhase: "profile-collection" | "services";
  isFirstTime: boolean;
}

/**
 * Generate first-time user greeting
 */
export function generateFirstTimeGreeting(): GreetingResponse {
  return {
    message: `Welcome to JobCloud! 🎉 I'm your personal career assistant, here to help you land your dream job! 🚀

I can help you with:
- 📝 Cover letters tailored to specific roles
- ✨ CV improvements and optimization
- 🎤 Interview preparation and practice

But first, let me get to know you! What's your name? 😊`,
    nextPhase: "profile-collection",
    isFirstTime: true
  };
}

/**
 * Generate returning user greeting
 */
export function generateReturningGreeting(
  state: AssistantState,
  profile?: CandidateProfile
): GreetingResponse {
  const resumable = getResumablePhase(state);
  const userName = profile?.fullName ? ` ${profile.fullName.split(" ")[0]}` : "";

  let contextMessage = "";
  switch (resumable.phase) {
    case "profile-collection":
      contextMessage = `Last time we were collecting your profile information. Let's continue! ✨`;
      break;
    case "cv-extraction":
      contextMessage = `Last time we were extracting and analyzing your CV. Ready to dive back in? 📄`;
      break;
    case "services":
      contextMessage = `You can now access our services: 📝 cover letters, ✨ CV enhancement, or 🎤 interview prep!`;
      break;
    default:
      contextMessage = `Welcome back to your career journey! 💼`;
  }

  return {
    message: `Welcome back${userName}! 👋 Great to see you again! 💼

${contextMessage}

What would you like to work on? 🎯`,
    nextPhase: resumable.phase === "profile-collection" ? "profile-collection" : "services",
    isFirstTime: false
  };
}

/**
 * Route greeting based on session state
 */
export function routeGreeting(
  state: AssistantState,
  profile?: CandidateProfile
): GreetingResponse {
  if (state.isFirstTime) {
    return generateFirstTimeGreeting();
  } else {
    return generateReturningGreeting(state, profile);
  }
}

/**
 * Generate prompt for profile collection phase
 */
export function generateProfileCollectionPrompt(
  userResponse?: string,
  step?: "name" | "status" | "industry" | "location" | "salary" | "complete"
): {
  message: string;
  nextStep: string;
} {
  const prompts: Record<string, { message: string; nextStep: string }> = {
    name: {
      message: `Great! Now I'd like to learn more about you. What's your current job status?

Are you:
- 💼 Employed and looking to change roles
- 🔄 Between jobs right now
- 🎓 Recently graduated or still studying
- 🚀 Self-employed or freelancing
- 📍 Transitioning careers

Let me know! 🎯`,
      nextStep: "status"
    },
    status: {
      message: `Perfect! 🌟 What industries or fields are you interested in?

For example: Tech, Finance, Healthcare, Marketing, Design, etc.

You can mention multiple if you're open! 🔍`,
      nextStep: "industry"
    },
    industry: {
      message: `Excellent! 💡 Any location preferences? Are you looking for:
- 📍 Specific cities or regions
- 🌍 Remote work
- 🤝 Hybrid arrangements
- 📌 Willing to relocate

Tell me what works for you! 🗺️`,
      nextStep: "location"
    },
    location: {
      message: `Great! 💪 One more thing - what salary range are you targeting?

This helps me find roles that match your expectations! (You can give a range or approximate number) 💰`,
      nextStep: "salary"
    },
    salary: {
      message: `Perfect! 🎉 I've got everything I need for now!

Next, let's extract and analyze your CV so I can tailor everything to your background. 📄✨

Do you have your CV ready to share? (You can paste it, upload a file, or describe your experience) 🚀`,
      nextStep: "complete"
    },
    complete: {
      message: `Awesome! Your profile is all set! 🌟

Now you can access all my services:
- 📝 Cover letters tailored to specific roles
- ✨ CV enhancement with targeted suggestions
- 🎤 Interview preparation and mock interviews

What would you like to work on first? 🎯`,
      nextStep: "services"
    }
  };

  const prompt = prompts[step || "name"];
  return {
    message: prompt.message,
    nextStep: prompt.nextStep
  };
}
