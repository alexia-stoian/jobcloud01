import type { Metadata } from "next";
import Link from "next/link";

type Props = {
  params: Promise<{ feature: string }>;
};

export const metadata: Metadata = {
  title: "Not implemented | JobScout24 Copilot",
  description: "Placeholder error page for unavailable dashboard features"
};

export const dynamic = "force-dynamic";

const featureLabels: Record<string, string> = {
  dashboard: "Dashboard",
  "discover-jobs": "Discover jobs",
  messages: "Messages",
  notifications: "Notifications"
};

export default async function UnavailableFeaturePage({ params }: Props): Promise<React.ReactElement> {
  const { feature } = await params;
  const label = featureLabels[feature] ?? feature;

  return (
    <main className="dashboard-error-page">
      <section className="dashboard-error-card dashboard-error-card--not-found">
        <div className="dashboard-error-card__icon" aria-hidden="true">
          ×
        </div>
        <p className="dashboard-error-card__eyebrow">{label}</p>
        <h1>Page not found</h1>
        <p>
          The page you&apos;re looking for doesn&apos;t exist or may have been moved. Check the URL or head back to the homepage.
        </p>
        <div className="dashboard-error-card__actions">
          <Link href="/profile/summary" className="dashboard-error-card__button dashboard-error-card__button--primary">
            Go to profile
          </Link>
        </div>
      </section>
    </main>
  );
}