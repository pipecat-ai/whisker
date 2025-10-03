//
// Copyright (c) 2025, Daily
//
// SPDX-License-Identifier: BSD 2-Clause License
//

import { useStore } from "./state.store";
import { ServerMessage } from "./types";
import { decodeMulti } from "@msgpack/msgpack";

export function useWhisker() {
  const setPipeline = useStore((s) => s.setPipeline);
  const pushFrames = useStore((s) => s.pushFrames);

  const frameBackground = (frame) => {
    if (frame.type === "frame:whisker") {
      return "rgba(255, 205, 50, 0.40)";
    } else if (frame.type === "frame:whisker-urgent") {
      return "rgba(249,115,22,0.40)";
    } else {
      return frame.event === "process"
        ? "rgba(16,185,129,0.15)"
        : "rgba(59,130,246,0.15)";
    }
  };

  const loadMessages = (data) => {
    try {
      const frameMessages = [];
      for (const msg_packed of decodeMulti(data)) {
        const msg = msg_packed as ServerMessage;
        if (msg.type === "pipeline") {
          // We only need one message
          setPipeline(msg);
        } else if (msg.type.startsWith("frame")) {
          frameMessages.push(msg);
        }
      }
      pushFrames(frameMessages);
    } catch (err) {
      console.error("Error decoding messages:", err);
    }
  };

  return { loadMessages, frameBackground };
}
