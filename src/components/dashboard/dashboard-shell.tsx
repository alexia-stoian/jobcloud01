"use client";

import Link from "next/link";

type Props = {
  userName: string;
  profileHref: "/profile/summary";
  careerGuideHref: "/onboarding" | "/career-guide";
};

export function DashboardShell({
  userName,
  profileHref,
  careerGuideHref
}: Props): React.ReactElement {
  return (
    <section className="img3-chat">
      <div className="img3-chat__left">
        <p>What&apos;s your name?</p>
        <p>Nice to meet you {userName}. Now can you tell me what is your current job situation ?</p>
        <p>I see, let&apos;s try to help you find a job you&apos;ll love !</p>
        <p>What is your current objective :</p>
        <div className="img3-options">
          <button type="button" className="img3-option">☐ Label</button>
          <button type="button" className="img3-option">☐ Label</button>
          <button type="button" className="img3-option">☐ Label</button>
        </div>
      </div>

      <div className="img3-chat__right">
        <div className="img3-bubble">John Doe</div>
        <div className="img3-bubble">I am unemployed</div>
      </div>

      <div className="img3-bottom-input">
        <span className="img3-bottom-input__plus">+</span>
        <span className="img3-bottom-input__placeholder">Write your answer here</span>
        <button type="button" className="img3-bottom-input__send">↑</button>
      </div>

      <div className="img3-links">
        <Link href={profileHref}>Open profile</Link>
        <Link href={careerGuideHref}>Continue career guide</Link>
      </div>
    </section>
  );
}