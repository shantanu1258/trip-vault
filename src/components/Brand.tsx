import { Link } from "react-router-dom";

export function Brand({
  compact = false,
  mobileHeader = false
}: {
  compact?: boolean;
  mobileHeader?: boolean;
}) {
  return (
    <Link
      to="/"
      className={`group inline-flex items-center rounded-xl ${mobileHeader ? "min-h-11 min-w-0 gap-2 sm:gap-3" : "gap-3"}`}
      aria-label="Trip Vault home"
    >
      <span
        className={`grid shrink-0 place-items-center overflow-hidden rounded-[0.9rem] shadow-soft transition-transform duration-200 ease-settle group-hover:-rotate-2 group-hover:scale-[1.03] motion-reduce:transition-none ${mobileHeader ? "size-8 sm:size-10" : "size-10"}`}
      >
        <img
          src="/icons/wallet-v2-192.png"
          alt=""
          aria-hidden="true"
          width="192"
          height="192"
          className="size-full object-cover"
        />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span
            className={`block font-display font-extrabold leading-none tracking-[-0.03em] ${mobileHeader ? "truncate text-base sm:text-lg" : "text-lg"}`}
          >
            Trip Vault
          </span>
          <span
            className={`mt-1 text-[0.62rem] font-bold uppercase tracking-[0.2em] text-muted ${mobileHeader ? "hidden sm:block" : "block"}`}
          >
            Ready when you are
          </span>
        </span>
      )}
    </Link>
  );
}
