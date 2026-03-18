import Image from "next/image";

export default function Footer() {
  return (
    <footer className="mt-16 pb-10">
      <div className="max-w-3xl mx-auto px-6">
        <div className="border-t border-[#E5E5E5] pt-6 flex items-center justify-between">
          <Image
            src="/choquer-logo.svg"
            alt="Choquer Agency"
            width={110}
            height={11}
          />
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
    </footer>
  );
}
