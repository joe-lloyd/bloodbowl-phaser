/**
 * Transport - how envelopes travel. Sessions never know the carrier:
 * FirestoreTransport in production, the in-memory pair in tests.
 */

import { Envelope } from "./envelope";

export interface Transport {
  send(envelope: Envelope): Promise<void>;
  /** Subscribe to envelopes from the other side. Returns unsubscribe. */
  subscribe(handler: (envelope: Envelope) => void): () => void;
  close(): void;
}

/**
 * Two linked in-memory endpoints: what one sends, the other receives
 * (asynchronously, preserving order — like a well-behaved network).
 */
export function createInMemoryTransportPair(): [Transport, Transport] {
  const handlersA = new Set<(envelope: Envelope) => void>();
  const handlersB = new Set<(envelope: Envelope) => void>();

  function makeEndpoint(
    peers: Set<(envelope: Envelope) => void>
  ): Transport & { deliver(envelope: Envelope): void } {
    return {
      async send(envelope: Envelope): Promise<void> {
        await Promise.resolve(); // async like a real wire
        peers.forEach((handler) => handler(envelope));
      },
      subscribe(handler: (envelope: Envelope) => void): () => void {
        const own = peers === handlersA ? handlersB : handlersA;
        own.add(handler);
        return () => own.delete(handler);
      },
      deliver(envelope: Envelope): void {
        peers.forEach((handler) => handler(envelope));
      },
      close(): void {
        // nothing to release in-memory
      },
    };
  }

  // endpoint A sends into B's handlers and vice versa
  const a = makeEndpoint(handlersB);
  const b = makeEndpoint(handlersA);
  return [a, b];
}
