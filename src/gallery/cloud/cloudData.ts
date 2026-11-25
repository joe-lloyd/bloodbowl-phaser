type Data = Record<string, unknown>;
type Listener = () => void;

export interface CloudUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  emailVerified: boolean;
  photoURL: string | null;
}

const documents = new Map<string, Data>();
const listeners = new Set<Listener>();
const userListeners = new Set<Listener>();
let user: CloudUser | null = null;

const changed = () => {
  listeners.forEach((listener) => {
    listener();
  });
};

export const cloudUser = () => user;

export function signIn(next: CloudUser): void {
  user = next;
}

export function signOutUser(): void {
  user = null;
  userListeners.forEach((listener) => {
    listener();
  });
}

export function onUserChange(listener: Listener): () => void {
  userListeners.add(listener);
  return () => userListeners.delete(listener);
}

export function putDocument(path: string, data: object): void {
  documents.set(path, { ...data });
  changed();
}

export function dropDocument(path: string): void {
  documents.delete(path);
  changed();
}

export function readDocument(path: string): Data | undefined {
  return documents.get(path);
}

export function documentPaths(): string[] {
  return [...documents.keys()];
}

export function onCloudChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
