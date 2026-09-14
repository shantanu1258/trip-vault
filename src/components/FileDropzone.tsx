import { FileCheck2, FileUp, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";

export const DOCUMENT_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const DOCUMENT_FILE_ACCEPT = DOCUMENT_FILE_TYPES.join(",");
export const DOCUMENT_FILE_MAX_BYTES = 5_000_000;

const inferredMimeTypes: Record<string, (typeof DOCUMENT_FILE_TYPES)[number]> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

function fileExtension(filename: string) {
  return filename.toLowerCase().split(".").pop() ?? "";
}

export function prepareDocumentFile(file: File, maxBytes = DOCUMENT_FILE_MAX_BYTES) {
  if (!file.size) throw new Error("This file is empty. Choose the original PDF or image again.");
  if (file.size >= maxBytes) throw new Error(`${file.name} is ${(file.size / 1_000_000).toFixed(2)} MB. Choose a file smaller than 5 MB.`);
  if (DOCUMENT_FILE_TYPES.includes(file.type as (typeof DOCUMENT_FILE_TYPES)[number])) return file;

  const inferredType = inferredMimeTypes[fileExtension(file.name)];
  if (inferredType && (!file.type || file.type === "application/octet-stream")) {
    return new File([file], file.name, { type: inferredType, lastModified: file.lastModified });
  }

  throw new Error("Use a PDF, JPEG, PNG, or WebP file.");
}

type FileDropzoneProps = {
  name: string;
  label: string;
  prompt?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  description?: string;
  onValidationError?: (message: string) => void;
};

export function FileDropzone({ name, label, prompt, file, onFileChange, disabled = false, busy = false, compact = false, description = "PDF, JPEG, PNG, or WebP under 5 MB", onValidationError }: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [validationError, setValidationError] = useState("");
  const unavailable = disabled || busy;

  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = "";
  }, [file]);

  const choose = (candidate?: File) => {
    setDragging(false);
    if (!candidate) { onFileChange(null); return; }
    try {
      const prepared = prepareDocumentFile(candidate);
      setValidationError("");
      onValidationError?.("");
      onFileChange(prepared);
    } catch (error) {
      const message = error instanceof Error ? error.message : "This file could not be selected.";
      if (inputRef.current) inputRef.current.value = "";
      setValidationError(message);
      onValidationError?.(message);
      onFileChange(null);
    }
  };

  const drop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!unavailable) choose(event.dataTransfer.files?.[0]);
  };

  return <div className="min-w-0">
    <input
      ref={inputRef}
      id={inputId}
      className="sr-only"
      type="file"
      name={name}
      accept={DOCUMENT_FILE_ACCEPT}
      tabIndex={-1}
      disabled={unavailable}
      aria-label={label}
      onChange={(event) => choose(event.currentTarget.files?.[0])}
    />
    <button
      type="button"
      disabled={unavailable}
      aria-describedby={`${inputId}-description${validationError ? ` ${inputId}-error` : ""}`}
      onClick={() => {
        if (!inputRef.current) return;
        inputRef.current.value = "";
        inputRef.current.click();
      }}
      onDragEnter={(event) => { event.preventDefault(); if (!unavailable) setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); if (!unavailable) event.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={drop}
      className={`${compact ? "min-h-14 px-4 py-3" : "min-h-32 px-5 py-6 sm:min-h-40"} tap-target flex w-full min-w-0 items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${dragging ? "border-brand bg-brand-soft" : file ? "border-success/50 bg-success/5" : "border-line bg-elevated hover:border-brand/50 hover:bg-brand-soft/40"}`}
    >
      <span className={`flex min-w-0 ${compact ? "items-center gap-3 text-left" : "flex-col items-center"}`}>
        <span className={`${compact ? "grid size-9" : "grid size-12"} shrink-0 place-items-center rounded-2xl ${file ? "bg-success/10 text-success" : "bg-brand-soft text-brand"}`}>
          {busy ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" /> : file ? <FileCheck2 className="size-5" /> : <FileUp className="size-5" />}
        </span>
        <span className="min-w-0">
          <strong className={`${compact ? "truncate" : "mt-3"} block text-sm`}>{busy ? "Saving file…" : file ? file.name : prompt ?? label}</strong>
          <span id={`${inputId}-description`} className={`${compact ? "mt-0.5" : "mt-1"} block text-xs font-medium text-muted`}>{file ? `${(file.size / 1_000_000).toFixed(2)} MB · Select to choose a different file` : `${description}${compact ? "" : " · tap or drop it here"}`}</span>
        </span>
      </span>
    </button>
    <p className="sr-only" aria-live="polite">{file ? `${file.name} selected` : ""}</p>
    {validationError && <p id={`${inputId}-error`} role="alert" className="mt-2 text-xs font-bold text-danger">{validationError}</p>}
  </div>;
}
