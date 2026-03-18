import Image from "next/image";
import { ClientConfig } from "@/types";
import StickyNav from "./StickyNav";

interface HeaderProps {
  client: ClientConfig;
}

export default function Header({ client }: HeaderProps) {
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

        {/* Right: CTA */}
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
    </header>
  );
}
