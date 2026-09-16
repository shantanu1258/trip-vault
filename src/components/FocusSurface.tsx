import type { ComponentPropsWithoutRef, ReactNode } from "react";

type FocusSurfaceProps = Omit<ComponentPropsWithoutRef<"article">, "children"> & {
  active: boolean;
  children: ReactNode;
};

export function FocusSurface({ active, children, className = "", ...props }: FocusSurfaceProps) {
  return (
    <article
      {...props}
      aria-current={active ? "step" : undefined}
      className={`surface-card relative transform-gpu overflow-hidden transition-[transform,box-shadow,border-color] duration-200 ease-settle motion-reduce:transition-none ${
        active
          ? "z-10 scale-[1.015] border-coral/70 shadow-focus motion-reduce:scale-100"
          : "scale-100"
      } ${className}`}
    >
      {active && <div className="absolute inset-y-0 left-0 w-1.5 bg-coral" aria-hidden="true" />}
      {children}
    </article>
  );
}
