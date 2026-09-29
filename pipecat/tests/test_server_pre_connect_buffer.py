#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Tests for the pre-connect event buffer in WhiskerServer."""

import asyncio

import msgpack

from pipecat_whisker import WhiskerServer


class FakeClient:
    """Minimal stand-in for a websockets connection.

    The first ``send`` after ``block_on`` messages have been sent waits until
    ``release`` is set, which lets a test emit events while the server is in
    the middle of delivering the pre-connect history.
    """

    remote_address = ("127.0.0.1", 0)

    def __init__(self, block_on_send: int = -1):
        """Initialize the fake client."""
        self.sent = []
        self.release = asyncio.Event()
        self.closed = asyncio.Event()
        self._block_on_send = block_on_send

    async def send(self, data: bytes):
        """Record ``data``, optionally waiting first."""
        index = len(self.sent)
        if index == self._block_on_send:
            await self.release.wait()
        self.sent.append(data)

    def __aiter__(self):
        """Return the iterator."""
        return self

    async def __anext__(self):
        """Wait until the client is closed, then end the iteration."""
        await self.closed.wait()
        raise StopAsyncIteration


def _unpack_all(chunks):
    unpacker = msgpack.Unpacker(raw=False)
    for chunk in chunks:
        unpacker.feed(chunk)
    return list(unpacker)


def _event(name: str) -> dict:
    return {"type": name, "timestamp": 1.0}


def test_events_emitted_while_sending_history_are_delivered():
    """Events emitted during the history send reach the first client."""

    async def run():
        server = WhiskerServer()
        server._send_queue = asyncio.Queue()

        await server.emit(_event("before-connect"))

        # Index 0 is the snapshot, index 1 is the pre-connect history.
        client = FakeClient(block_on_send=1)
        handler = asyncio.create_task(server._client_handler(client))

        # Wait until the history send is in flight.
        while len(client.sent) < 1:
            await asyncio.sleep(0)
        await asyncio.sleep(0)

        await server.emit(_event("during-history-send"))
        client.release.set()

        # Let the handler finish delivering history and start listening.
        for _ in range(10):
            await asyncio.sleep(0)

        delivered = _unpack_all(client.sent[1:])
        queued = []
        while not server._send_queue.empty():
            _, data, _ = server._send_queue.get_nowait()
            queued.extend(_unpack_all([data]))
        names = [e["type"] for e in delivered + queued]

        client.closed.set()
        await handler
        return names

    names = asyncio.run(run())
    assert names == ["before-connect", "during-history-send"]


def test_history_is_delivered_once_to_the_first_client():
    """Only the first client receives the pre-connect history."""

    async def run():
        server = WhiskerServer()
        server._send_queue = asyncio.Queue()

        await server.emit(_event("before-connect"))

        first = FakeClient()
        handler = asyncio.create_task(server._client_handler(first))
        for _ in range(10):
            await asyncio.sleep(0)
        first.closed.set()
        await handler

        second = FakeClient()
        handler = asyncio.create_task(server._client_handler(second))
        for _ in range(10):
            await asyncio.sleep(0)
        second.closed.set()
        await handler
        return first, second

    first, second = asyncio.run(run())
    first_events = [e.get("type") for e in _unpack_all(first.sent[1:])]
    second_events = [e.get("type") for e in _unpack_all(second.sent[1:])]
    assert first_events == ["before-connect"]
    assert second_events == []
