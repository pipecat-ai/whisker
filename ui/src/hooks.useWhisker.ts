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

  const loadMessages = (data) => {
    try {
      const frameMessages = [];
      for (const msg_packed of decodeMulti(data)) {
        const msg = msg_packed as ServerMessage;
        if (msg.type === "pipeline") {
          // We only need one message
          setPipeline(msg);
        } else if (msg.type === "frame") {
          frameMessages.push(msg);
        }
      }
      pushFrames(frameMessages);
    } catch (err) {
      console.error("Error decoding messages:", err);
    }
  };

  return { loadMessages };
}
