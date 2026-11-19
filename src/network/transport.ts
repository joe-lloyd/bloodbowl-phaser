import { type Envelope } from "./envelope";

export interface Transport {
  send(envelope: Envelope): Promise<void>;

  subscribe(handler: (envelope: Envelope) => void): () => void;
  close(): void;
}

export function createInMemoryTransportPair(): [Transport, Transport] {
  const handlersA = new Set<(envelope: Envelope) => void>();
  const handlersB = new Set<(envelope: Envelope) => void>();

  function makeEndpoint(
    peers: Set<(envelope: Envelope) => void>
  ): Transport & { deliver(envelope: Envelope): void } {
    return {
      async send(envelope: Envelope): Promise<void> {
        await Promise.resolve();
        peers.forEach((handler) => {
          handler(envelope);
        });
      },
      subscribe(handler: (envelope: Envelope) => void): () => void {
        const own = peers === handlersA ? handlersB : handlersA;
        own.add(handler);
        return () => own.delete(handler);
      },
      deliver(envelope: Envelope): void {
        peers.forEach((handler) => {
          handler(envelope);
        });
      },
      close(): void {
        return;
      },
    };
  }

  const a = makeEndpoint(handlersB);
  const b = makeEndpoint(handlersA);
  return [a, b];
}
