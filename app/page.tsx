import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">InsightPulse</h1>
        <p className="text-muted">SEO Performance Dashboard</p>
        <p className="text-sm text-muted mt-4">
          Access your dashboard at your unique URL.
        </p>
        <Link
          href="/century-plaza"
          className="inline-block mt-6 px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition"
        >
          Demo Dashboard
        </Link>
      </div>
    </div>
  );
}
