import { vi } from "vitest";
import { FirebaseError } from "firebase/app";

interface Reference {
  readonly path: string;
}

export const cloudDocuments = new Map<string, unknown>();
export const cloudWrites: string[] = [];
export const network = { up: true };

function offline(): FirebaseError {
  return new FirebaseError("unavailable", "Failed to get documents from server.");
}

function documentsUnder(reference: Reference) {
  if (!network.up) return Promise.reject(offline());
  const docs = [...cloudDocuments]
    .filter(([path]) => path.startsWith(`${reference.path}/`))
    .map(([, data]) => ({ data: () => data }));
  return Promise.resolve({ docs });
}

interface FakeTransaction {
  get: (reference: Reference) => Promise<{ exists: () => boolean; data: () => unknown }>;
  set: (reference: Reference, data: unknown) => void;
  delete: (reference: Reference) => void;
}

const transaction: FakeTransaction = {
  get: (reference) =>
    Promise.resolve({
      exists: () => cloudDocuments.has(reference.path),
      data: () => cloudDocuments.get(reference.path),
    }),
  set: (reference, data) => {
    cloudWrites.push(reference.path);
    cloudDocuments.set(reference.path, data);
  },
  delete: (reference) => {
    cloudWrites.push(`delete ${reference.path}`);
    cloudDocuments.delete(reference.path);
  },
};

export const firestoreFake = {
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  collectionGroup: vi.fn(),
  doc: vi.fn((parent: Reference, id: string) => ({ path: `${parent.path}/${id}` })),
  getDoc: vi.fn(),
  getDocs: vi.fn(documentsUnder),
  getDocsFromServer: vi.fn(documentsUnder),
  runTransaction: vi.fn(
    (_db: unknown, run: (fake: FakeTransaction) => Promise<unknown>) =>
      network.up ? run(transaction) : Promise.reject(offline())
  ),
};

export function resetTeamCloud(): void {
  cloudDocuments.clear();
  cloudWrites.length = 0;
  network.up = true;
}
