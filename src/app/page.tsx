import { getMessages } from "next-intl/server";
import Link from "next/link";
import { RecruiterBanner } from "@/components/marketing/RecruiterBanner";

export default async function HomePage(): Promise<React.ReactElement> {
  const messages = await getMessages();
  const appMessages = messages.app as
    | {
        heroTitle?: string;
        heroSubtitle?: string;
        signupCta?: string;
        loginCta?: string;
        recruiterTitle?: string;
        recruiterSubtitle?: string;
        recruiterDismiss?: string;
      }
    | undefined;

  const jobs = [
    { title: "Nurse", location: "Wallisellen", icon: "│", iconClassName: "job-chip__icon job-chip__icon--line" },
    { title: "Teacher", location: "Geneva", icon: "✧", iconClassName: "job-chip__icon job-chip__icon--gold" },
    { title: "Nurse", location: "Wallisellen", icon: "⚕", iconClassName: "job-chip__icon job-chip__icon--medical" },
    { title: "Nurse", location: "Wallisellen", icon: "⚕", iconClassName: "job-chip__icon job-chip__icon--medical" }
  ];

  return (
    <main className="home-hero">
      <div className="home-hero__content">
        <section className="home-hero__headline">
          <h1 className="home-hero__title">
            {appMessages?.heroTitle ?? "Be at the heart of the swiss job market"}
          </h1>
          <p className="home-hero__summary">
            {appMessages?.heroSubtitle ??
              "The complete inventory of Swiss jobs ads in one place — structured, searchable and kept up to date, so you can scan the whole market in minutes instead of trawling a dozen sites."}
          </p>
        </section>

        <section className="job-chip-row" aria-label="Highlighted roles">
          {jobs.map((job, index) => (
            <article className="job-chip" key={`${job.title}-${job.location}-${index}`}>
              <span className={job.iconClassName} aria-hidden="true">
                {job.icon}
              </span>
              <div className="job-chip__text">
                <span className="job-chip__title">{job.title}</span>
                <span className="job-chip__location">{job.location}</span>
              </div>
            </article>
          ))}
        </section>

        <div className="hero-actions">
          <Link href="/signup" className="hero-button hero-button--primary">
            {appMessages?.signupCta ?? "Create an account"}
          </Link>
          <Link href="/login" className="hero-button">
            {appMessages?.loginCta ?? "Log in"}
          </Link>
        </div>

        <div className="home-hero__footer">
          <RecruiterBanner
            title={appMessages?.recruiterTitle ?? "Your are a recruiter looking to hire someone ?"}
            subtitle={appMessages?.recruiterSubtitle ?? "Post an ad for free"}
            dismissLabel={appMessages?.recruiterDismiss ?? "Dismiss recruiter prompt"}
          />
        </div>
      </div>
    </main>
  );
}
