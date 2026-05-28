//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Pipeline } from "./Pipeline";

type Props = {
  workerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const INITIAL_WIDTH = 720;
const INITIAL_HEIGHT = 540;

function initialPosition() {
  // Center the popup on first open. Width/height match the Tailwind
  // ``w-[720px] h-[540px]`` defaults on the content.
  if (typeof window === "undefined") return { top: 80, left: 80 };
  return {
    top: Math.max(8, (window.innerHeight - INITIAL_HEIGHT) / 2),
    left: Math.max(8, (window.innerWidth - INITIAL_WIDTH) / 2),
  };
}

export function PipelineGraphDialog({ workerId, open, onOpenChange }: Props) {
  // Absolute ``top``/``left`` (in px). Using top/left rather than a
  // centering transform keeps the popup's top-left corner anchored so the
  // native resize gripper grows only down-right, like a regular window.
  const [pos, setPos] = useState(initialPosition);
  const posRef = useRef(pos);
  posRef.current = pos;

  // Reset position whenever the popup closes so the next open re-centers.
  useEffect(() => {
    if (!open) setPos(initialPosition());
  }, [open]);

  const handleDragStart = (e: React.PointerEvent) => {
    // Skip drag when the press lands on a control inside the title row
    // (close button, etc.).
    if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
    e.preventDefault();

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const baseLeft = posRef.current.left;
    const baseTop = posRef.current.top;

    const onMove = (ev: PointerEvent) => {
      setPos({
        left: baseLeft + (ev.clientX - startClientX),
        top: baseTop + (ev.clientY - startClientY),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    // ``modal={false}`` keeps focus / scroll / outside clicks on the main UI,
    // so the user can still interact with the tree, frames, and bus messages
    // while the graph popup is open. We render without an overlay for the
    // same reason — nothing should be dimmed.
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed z-50 flex flex-col w-[720px] h-[540px] min-w-[360px] min-h-[280px] max-w-[95vw] max-h-[90vh] gap-3 rounded-lg border bg-background p-4 shadow-xl overflow-hidden resize data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          style={{ top: pos.top, left: pos.left }}
          // Without ``modal``, Radix would still dismiss on an outside
          // pointer-down. Suppress that — the close button is the only
          // dismiss path so the popup persists while the user explores.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div
            onPointerDown={handleDragStart}
            className="flex items-center justify-between gap-2 flex-shrink-0 cursor-move select-none"
          >
            <DialogPrimitive.Title className="font-mono text-sm truncate">
              {workerId}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              data-no-drag
              className="rounded-sm p-1 opacity-70 hover:opacity-100 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 min-h-0 rounded-md border border-dashed overflow-hidden">
            <Pipeline workerId={workerId} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
