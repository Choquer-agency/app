import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-muted mb-4">Dashboard not found.</p>
        <p className="text-sm text-muted">
          Check your URL or contact Choquer Agency for access.
        </p>
        <Link
          href="/"
          className="inline-block mt-6 text-sm text-accent hover:underline"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
