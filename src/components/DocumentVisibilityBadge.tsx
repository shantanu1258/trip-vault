import { Eye, LockKeyhole, UserRoundCheck, UsersRound, type LucideIcon } from "lucide-react";
import type { DocumentVisibility } from "../features/workspace/types";

type VisibilityPresentation = {
  label: string;
  description: string;
  icon: LucideIcon;
};

const visibilityPresentations: Record<DocumentVisibility, VisibilityPresentation> = {
  trip: {
    label: "Trip members",
    description: "Visible to all signed-in trip members",
    icon: Eye
  },
  private: {
    label: "Only me",
    description: "Visible only to you",
    icon: LockKeyhole
  },
  selected_members: {
    label: "Selected members",
    description: "Visible only to selected trip members",
    icon: UsersRound
  },
  traveler_and_managers: {
    label: "Traveler + managers",
    description: "Visible to the traveler and their managers",
    icon: UserRoundCheck
  }
};

export function documentVisibilityPresentation(visibility: DocumentVisibility) {
  return visibilityPresentations[visibility];
}

export function DocumentVisibilityBadge({
  visibility,
  className = ""
}: {
  visibility: DocumentVisibility;
  className?: string;
}) {
  const presentation = documentVisibilityPresentation(visibility);
  const Icon = presentation.icon;

  return (
    <span
      aria-label={presentation.description}
      className={`inline-flex max-w-full shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-[.62rem] font-black leading-none text-brand ${className}`}
      data-document-visibility={visibility}
      title={presentation.description}
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      <span className="truncate">{presentation.label}</span>
    </span>
  );
}
