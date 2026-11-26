import { readFileSync } from "node:fs";
import { deleteApp, type FirebaseApp, initializeApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  type Firestore,
  getFirestore,
  terminate,
} from "firebase/firestore";
import { expect } from "vitest";
import { fixtureValue } from "../../src/testing/fixtureValue";
import {
  firestoreEmulatorHost,
  uploadFirestoreRules,
} from "../../src/boundary/testEnvironment";

export const EMULATOR = firestoreEmulatorHost();
const PROJECT = "demo-bloodbowl-rules";
export const ADMIN = "owner";

export const current: { db: Firestore | null; uid: string } = {
  db: null,
  uid: "",
};

const apps: FirebaseApp[] = [];
const dbs = new Map<string, Firestore>();

export function dbFor(uid: string): Firestore {
  const known = dbs.get(uid);
  if (known) return known;
  const app = initializeApp({ projectId: PROJECT }, `social-${uid}`);
  apps.push(app);
  const db = getFirestore(app);
  const [host, port] = fixtureValue(EMULATOR).split(":", 2);
  connectFirestoreEmulator(db, fixtureValue(host), Number(port), {
    mockUserToken: uid === ADMIN ? ADMIN : { user_id: uid },
  });
  dbs.set(uid, db);
  return db;
}

export function as<T>(uid: string, work: () => Promise<T>): Promise<T> {
  current.db = dbFor(uid);
  current.uid = uid;
  return work();
}

export const denied = (write: Promise<unknown>) =>
  expect(write).rejects.toMatchObject({ code: "permission-denied" });

export async function loadRules(): Promise<void> {
  const response = await uploadFirestoreRules({
    host: fixtureValue(EMULATOR),
    project: PROJECT,
    rules: readFileSync("firestore.rules", "utf8"),
  });
  expect(response.ok, response.text).toBe(true);
}

export async function closeEmulatorApps(): Promise<void> {
  await Promise.all([...dbs.values()].map((element) => terminate(element)));
  await Promise.all(apps.map((app) => deleteApp(app)));
}

export function uniqueUid(name: string): string {
  return `${name}-${crypto.randomUUID().slice(0, 8)}`;
}
