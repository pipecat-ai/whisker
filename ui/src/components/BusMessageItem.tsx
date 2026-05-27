//
// Copyright (c) 2026, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BusMessageCategory, BusMessage } from "../types";

const CATEGORY_STYLES: Record<BusMessageCategory, { bg: string; fg: string }> = {
  lifecycle: { bg: "hsla(220, 80%, 55%, 0.15)", fg: "hsl(220, 80%, 55%)" },
  frame: { bg: "hsla(280, 60%, 55%, 0.15)", fg: "hsl(280, 60%, 55%)" },
  job: { bg: "hsla(35, 80%, 50%, 0.15)", fg: "hsl(35, 80%, 50%)" },
  other: { bg: "hsla(0, 0%, 50%, 0.1)", fg: "hsl(0, 0%, 50%)" },
};

export function stripBusPrefix(messageType: string): string {
  return messageType.replace(/^Bus/, "").replace(/Message$/, "");
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

type Props = {
  event: BusMessage;
};

export function BusMessageItem({ event }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasData = useMemo(
    () => event.data && Object.keys(event.data).length > 0,
    [event.data]
  );
  const catStyle = CATEGORY_STYLES[event.category] ?? CATEGORY_STYLES.other;
  // BusFrameMessage carries the frame as nested data; surface its name
  // inline so the row is informative without expanding.
  const frameName: string | undefined =
    event.category === "frame" && event.data && typeof event.data === "object"
      ? (event.data.frame?.name as string | undefined)
      : undefined;

  return (
    <div className="border-b">
      <button
        onClick={() => hasData && setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-1 text-xs text-left hover:bg-accent/30"
      >
        <span className="shrink-0 w-[88px] font-mono text-muted-foreground/70">
          {formatTime(event.timestamp)}
        </span>
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide shrink-0"
          style={{ backgroundColor: catStyle.bg, color: catStyle.fg }}
        >
          {event.category}
        </span>
        <span className="shrink-0 text-muted-foreground truncate max-w-[180px]">
          <span>{event.source_worker ?? "—"}</span>
          {event.target_worker ? (
            <>
              <span className="opacity-50"> → </span>
              <span>{event.target_worker}</span>
            </>
          ) : (
            <span className="opacity-40"> → *</span>
          )}
        </span>
        <span className="font-medium truncate">
          {stripBusPrefix(event.message_type)}
          {frameName && (
            <span className="font-normal opacity-60"> ({frameName})</span>
          )}
        </span>
        {hasData && (
          <span className="ml-auto shrink-0 text-muted-foreground">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </button>
      {expanded && hasData && (
        <pre
          // Payload is text to read / select — keep the cursor as a
          // caret here even though the row above is a click target.
          className="px-3 py-2 ml-[100px] text-[11px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all cursor-text select-text"
        >
          {JSON.stringify(event.data, null, 2)}
        </pre>
      )}
    </div>
  );
}
