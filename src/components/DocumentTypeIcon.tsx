import {
  AlignLeft,
  BedDouble,
  BookUser,
  CarTaxiFront,
  ClipboardCheck,
  IdCard,
  MapPinned,
  Plane,
  ReceiptText,
  ShieldCheck,
  Ticket,
  type LucideIcon
} from "lucide-react";
import type { AccountDocumentUpload, DocumentCategory } from "../features/workspace/types";

export type DocumentIconType =
  | DocumentCategory
  | NonNullable<AccountDocumentUpload["personal_kind"]>;
const definitions: Record<DocumentIconType, LucideIcon> = {
  flight: Plane,
  hotel: BedDouble,
  activity: MapPinned,
  visa: IdCard,
  arrival_card: ClipboardCheck,
  passport: BookUser,
  aadhaar: IdCard,
  identity: IdCard,
  insurance: ShieldCheck,
  transport: CarTaxiFront,
  ticket: Ticket,
  receipt: ReceiptText,
  other: AlignLeft
};
const tones: Record<DocumentIconType, string> = {
  flight: "flight",
  hotel: "hotel",
  activity: "activity",
  visa: "preparation",
  arrival_card: "preparation",
  passport: "preparation",
  aadhaar: "custom",
  identity: "custom",
  insurance: "preparation",
  transport: "transport",
  ticket: "custom",
  receipt: "meal",
  other: "custom"
};

/** Type identifies the content; access and personal/trip scope remain separate. */
export function DocumentTypeIcon({
  type,
  emphasis = "subtle",
  size = "md",
  variant = "colored"
}: {
  type: DocumentIconType;
  emphasis?: "subtle" | "strong";
  size?: "sm" | "md";
  variant?: "colored" | "monochrome";
}) {
  const Icon = definitions[type] ?? definitions.other;
  return (
    <span
      aria-hidden="true"
      data-document-type={type}
      data-emphasis={emphasis}
      data-variant={variant}
      className={`document-type-icon grid shrink-0 place-items-center ${size === "sm" ? "size-5" : "size-7"}`}
    >
      <svg
        className={`document-type-icon__file ${size === "sm" ? "h-5 w-5" : "h-7 w-6"}`}
        viewBox="0 0 32 36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path
          className="document-type-icon__paper"
          d="M19 2H6a2 2 0 0 0-2 2v28a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V11L19 2Z"
        />
        <path d="M19 2v7a2 2 0 0 0 2 2h7" />
        <Icon
          className={`document-type-icon__symbol event-type-icon--${tones[type] ?? "custom"}`}
          x="9"
          y="15"
          width="14"
          height="14"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  );
}
