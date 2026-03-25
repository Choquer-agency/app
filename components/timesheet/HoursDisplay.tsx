"use client";

export default function HoursDisplay({ minutes }: { minutes: number }) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return <span>{h}h {m}m</span>;
}
