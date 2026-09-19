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
        className={`grid shrink-0 place-items-center rounded-[0.9rem] bg-brand text-surface shadow-soft transition-transform duration-200 ease-settle group-hover:-rotate-2 group-hover:scale-[1.03] motion-reduce:transition-none ${mobileHeader ? "size-8 sm:size-10" : "size-10"}`}
      >
        <svg aria-hidden="true" viewBox="0 0 28 28" className="size-6 fill-none">
          <path
            d="M5 10.5A3.5 3.5 0 0 1 8.5 7h11a3.5 3.5 0 0 1 3.5 3.5V21H5V10.5Z"
            fill="currentColor"
            opacity=".96"
          />
          <path
            d="M10.5 7v-1A2.5 2.5 0 0 1 13 3.5h2A2.5 2.5 0 0 1 17.5 6v1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M5 13.5h18" stroke="rgb(var(--color-coral))" strokeWidth="2.4" />
        </svg>
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
