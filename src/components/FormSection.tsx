import {
  Children,
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement
} from "react";

/** Shared optional-section affordance; inputs remain mounted for FormData and drafts. */
export function FormSection({
  children,
  open: initialOpen,
  className = "",
  ...props
}: ComponentProps<"details">) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(Boolean(initialOpen));
  const [filled, setFilled] = useState(0);
  const countFields = () => {
    const fields = ref.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea"
    );
    return [...(fields ?? [])].filter((field) => field.value.trim() !== "" && field.value !== "0")
      .length;
  };
  useLayoutEffect(() => {
    const count = countFields();
    setFilled(count);
    if (count || ref.current?.querySelector("[required]")) setOpen(true);
  }, []);
  return (
    <details
      {...props}
      ref={ref}
      open={open}
      className={`form-disclosure ${className}`}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        props.onToggle?.(event);
      }}
      onInput={(event) => {
        setFilled(countFields());
        props.onInput?.(event);
      }}
      onInvalidCapture={(event) => {
        // Native validation focuses immediately after this event: reveal synchronously.
        event.currentTarget.open = true;
        setOpen(true);
        props.onInvalidCapture?.(event);
      }}
    >
      {Children.map(children, (child) =>
        isValidElement(child) && child.type === "summary"
          ? cloneElement(child as ReactElement<{ className?: string; children: React.ReactNode }>, {
              className: "form-disclosure-summary",
              children: (
                <>
                  <span>{(child.props as { children: React.ReactNode }).children}</span>
                  {filled > 0 && (
                    <span className="ml-auto whitespace-nowrap text-xs font-medium text-muted">
                      {filled} filled
                    </span>
                  )}
                </>
              )
            })
          : child
      )}
    </details>
  );
}
