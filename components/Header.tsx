import Image from "next/image";
import { ClientConfig } from "@/types";
import StickyNav from "./StickyNav";

interface HeaderProps {
  client: ClientConfig;
  pendingApprovals?: number;
}

export default function Header({ client, pendingApprovals = 0 }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-[#F0F0F0]">
      <div className="max-w-3xl mx-auto px-6 py-2.5 flex items-center justify-between">
        {/* Left: logo + client name stacked, compact */}
        <div className="flex items-center gap-5">
          <div className="flex flex-col gap-0 leading-none">
            <Image
              src="/choquer-logo.svg"
              alt="Choquer Agency"
              width={100}
              height={10}
              priority
            />
            <h1 className="text-lg font-bold text-[#1A1A1A] tracking-tight -mt-0.5">
              {client.name}
            </h1>
          </div>

          {/* Nav inline */}
          <StickyNav />
        </div>

        {/* Right: Bell + CTA */}
        <div className="flex items-center gap-3">
          {pendingApprovals > 0 && (
            <a
              href="#approvals-section"
              className="relative p-1.5 rounded-lg hover:bg-[#FFF0F0] transition"
              title={`${pendingApprovals} pending approval${pendingApprovals > 1 ? "s" : ""}`}
            >
              <svg className="w-5 h-5 text-[#6b7280]" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.515 1.076 32.91 32.91 0 003.256.508 3.5 3.5 0 006.972 0 32.903 32.903 0 003.256-.508.75.75 0 00.515-1.076A11.448 11.448 0 0116 8a6 6 0 00-6-6zM8.05 14.943a33.54 33.54 0 003.9 0 2 2 0 01-3.9 0z" clipRule="evenodd" />
              </svg>
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#D94040] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {pendingApprovals}
              </span>
            </a>
          )}
          <a
            href="https://cal.com/andres-agudelo-hqlknm/15min"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg text-white text-xs font-medium transition hover:opacity-90 whitespace-nowrap"
            style={{ backgroundColor: "#FF9500" }}
            data-track="link"
          >
            Book Your 15-min Strategy Call
          </a>
        </div>
      </div>
    </header>
  );
}
