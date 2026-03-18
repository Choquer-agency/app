"use client";

import Image from "next/image";
import { useState } from "react";

export default function Footer() {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <footer className="mt-16 pb-10">
      <div className="max-w-3xl mx-auto px-6">
        <div className="border-t border-[#E5E5E5] pt-6 flex items-center justify-between">
          <Image
            src="/choquer-logo.svg"
            alt="Choquer Agency"
            width={132}
            height={13}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleShare}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#A69FFF] text-white hover:bg-[#5B52B6] transition"
            >
              {copied ? "Link Copied!" : "Share This Report"}
            </button>
            <a
              href="https://cal.com/andres-agudelo-hqlknm/15min"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted hover:text-[#FF9500] transition font-medium"
            >
              Book Your 15-min Strategy Call
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
