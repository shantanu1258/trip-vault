import { useEffect, useRef } from "react";

const PREFIX = "trip-vault:form-draft:";

type DraftValues = Record<string, string | string[]>;

export function clearFormDraft(key: string) {
  localStorage.removeItem(`${PREFIX}${key}`);
}

export function useFormDraft(key: string) {
  const formRef = useRef<HTMLFormElement>(null);
  const clearedRef = useRef(false);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    clearedRef.current = false;

    try {
      const values = JSON.parse(localStorage.getItem(`${PREFIX}${key}`) ?? "{}") as DraftValues;
      for (const [name, raw] of Object.entries(values)) {
        const escapedName = name.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
        const fields = form.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >(`[name="${escapedName}"]`);
        fields.forEach((field) => {
          if (
            field instanceof HTMLInputElement &&
            (field.type === "checkbox" || field.type === "radio")
          )
            field.checked = Array.isArray(raw) && raw.includes(field.value || "on");
          else if (!Array.isArray(raw)) field.value = raw;
        });
      }
    } catch {
      clearFormDraft(key);
    }

    const persist = () => {
      if (clearedRef.current) return;
      try {
        const data = new FormData(form);
        const values: DraftValues = {};
        for (const [name, raw] of data.entries()) {
          if (raw instanceof File) continue;
          const prior = values[name];
          if (prior === undefined) values[name] = raw;
          else values[name] = Array.isArray(prior) ? [...prior, raw] : [prior, raw];
        }
        localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(values));
      } catch {
        // A draft is a convenience. Storage restrictions must never block the form.
      }
    };

    const persistFromForm = () => {
      clearedRef.current = false;
      persist();
    };

    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") persist();
    };

    form.addEventListener("input", persistFromForm);
    form.addEventListener("change", persistFromForm);
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persistWhenHidden);

    return () => {
      persist();
      form.removeEventListener("input", persistFromForm);
      form.removeEventListener("change", persistFromForm);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persistWhenHidden);
    };
  }, [key]);
  return {
    formRef,
    clearDraft: () => {
      clearedRef.current = true;
      clearFormDraft(key);
    }
  };
}
