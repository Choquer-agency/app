import type { Destination, DestinationType } from "./types";
import { notionDestination } from "./notion";
import { sheetsDestination } from "./sheets";
import { bigqueryDestination } from "./bigquery";

const REGISTRY: Record<DestinationType, Destination> = {
  notion: notionDestination,
  sheets: sheetsDestination,
  bigquery: bigqueryDestination,
};

export function getDestination(type: string): Destination {
  const d = REGISTRY[type as DestinationType];
  if (!d) throw new Error(`Unknown destination type: ${type}`);
  return d;
}

export function allDestinationTypes(): DestinationType[] {
  return Object.keys(REGISTRY) as DestinationType[];
}
