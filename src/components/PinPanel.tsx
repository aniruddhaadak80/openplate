"use client";

import { useState } from "react";
import { PinIcon } from "lucide-react";
import type { Jurisdiction, UseKind } from "@/lib/types";
import { FilePlateForm } from "./FilePlateForm";

/**
 * The write half of the search result.
 *
 * Kept collapsed until asked for, because a grid of twenty open forms is a wall,
 * and because the decision to pin something should be a decision rather than a
 * side effect of browsing. The button says what will happen.
 */
export function PinPanel({
  workId,
  title,
  defaultUse,
  defaultJurisdiction,
  defaultCirculation,
}: {
  workId: string;
  title: string;
  defaultUse: UseKind;
  defaultJurisdiction: Jurisdiction;
  defaultCirculation: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-rule">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-2 px-4 py-3 font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-bone-dim transition-colors hover:bg-bench hover:text-review"
      >
        <PinIcon size={12} aria-hidden="true" />
        {open ? "Cancel" : "Pin this work"}
      </button>

      {open ? (
        <div className="border-t border-rule p-4">
          <p className="slug">Pin {title} to the docket</p>
          <div className="mt-4">
            <FilePlateForm
              workId={workId}
              defaultUse={defaultUse}
              defaultJurisdiction={defaultJurisdiction}
              defaultCirculation={defaultCirculation}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}