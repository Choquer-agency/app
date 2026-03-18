"use client";

import { useState } from "react";
import VisitorIdentifier from "./VisitorIdentifier";
import ActivityTracker from "./ActivityTracker";
import { VisitorIdentification } from "@/types";

interface ClientDashboardTrackerProps {
  slug: string;
}

export default function ClientDashboardTracker({ slug }: ClientDashboardTrackerProps) {
  const [visitor, setVisitor] = useState<VisitorIdentification | null>(null);

  return (
    <>
      <VisitorIdentifier slug={slug} onIdentified={setVisitor} />
      <ActivityTracker
        slug={slug}
        visitorId={visitor?.visitorId}
        deviceId={visitor?.deviceId}
      />
    </>
  );
}
