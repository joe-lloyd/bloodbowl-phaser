import {
  documentPaths,
  dropDocument,
  onCloudChange,
  putDocument,
  readDocument,
} from "./cloudData";

type Data = Record<string, unknown>;

interface CollectionRef {
  path: string;
  id: string;
  parent: DocumentRef | null;
}

interface DocumentRef {
  path: string;
  id: string;
  parent: CollectionRef;
}

type Keep = (data: Data) => boolean;

interface CloudQuery {
  matches: (path: string) => boolean;
  keeps: Keep[];
  most: number;
}

type Constraint = { keep: Keep } | { most: number } | { order: string };
type Source = CollectionRef | DocumentRef | CloudQuery | { name: string };

const REMOVED = "gallery:removed-field";

const pathOf = (from: Source) => ("path" in from ? `${from.path}/` : "");

function collectionAt(path: string): CollectionRef {
  const parts = path.split("/");
  return {
    path,
    id: parts.at(-1) ?? "",
    parent: parts.length > 1 ? documentAt(parts.slice(0, -1).join("/")) : null,
  };
}

function documentAt(path: string): DocumentRef {
  const parts = path.split("/");
  return {
    path,
    id: parts.at(-1) ?? "",
    parent: collectionAt(parts.slice(0, -1).join("/")),
  };
}

export const getFirestore = () => ({ name: "gallery" });
export const connectFirestoreEmulator = () => undefined;
export const deleteField = () => REMOVED;
export const serverTimestamp = () => Date.now();

export class Timestamp {
  static now() {
    return new Timestamp(Date.now());
  }

  readonly millis: number;

  constructor(millis: number) {
    this.millis = millis;
  }

  toMillis() {
    return this.millis;
  }
}

export const collection = (from: Source, ...parts: string[]) =>
  collectionAt(pathOf(from) + parts.join("/"));

export const doc = (from: Source, ...parts: string[]) =>
  documentAt(
    pathOf(from) + (parts.length > 0 ? parts.join("/") : crypto.randomUUID())
  );

export const collectionGroup = (_db: unknown, id: string): CloudQuery => ({
  matches: (path) => path.split("/").at(-2) === id,
  keeps: [],
  most: Infinity,
});

function asQuery(source: CollectionRef | CloudQuery): CloudQuery {
  if ("matches" in source) return source;
  const depth = source.path.split("/").length + 1;
  return {
    matches: (path) =>
      path.startsWith(`${source.path}/`) && path.split("/").length === depth,
    keeps: [],
    most: Infinity,
  };
}

const fieldOf = (data: Data, field: string): unknown =>
  field
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        typeof value === "object" && value !== null
          ? Object.entries(value).find(([name]) => name === key)?.[1]
          : undefined,
      data
    );

export function where(field: string, op: string, wanted: unknown): Constraint {
  return {
    keep: (data) => {
      const value = fieldOf(data, field);
      if (op === "array-contains")
        return Array.isArray(value) && value.includes(wanted);
      return op === "==" ? value === wanted : true;
    },
  };
}

export const limit = (most: number): Constraint => ({ most });
export const orderBy = (order: string): Constraint => ({ order });

export function query(
  source: CollectionRef | CloudQuery,
  ...constraints: Constraint[]
): CloudQuery {
  const base = asQuery(source);
  return constraints.reduce<CloudQuery>((built, constraint) => {
    if ("keep" in constraint)
      return { ...built, keeps: [...built.keeps, constraint.keep] };
    return "most" in constraint ? { ...built, most: constraint.most } : built;
  }, base);
}

function documentSnapshot(path: string) {
  const data = readDocument(path);
  return {
    id: documentAt(path).id,
    ref: documentAt(path),
    metadata: { fromCache: false, hasPendingWrites: false },
    exists: () => data !== undefined,
    data: () => data,
  };
}

function querySnapshot(source: CollectionRef | CloudQuery) {
  const wanted = asQuery(source);
  const docs = documentPaths()
    .filter(wanted.matches)
    .filter((path) => {
      const data = readDocument(path) ?? {};
      return wanted.keeps.every((keep) => keep(data));
    })
    .slice(0, wanted.most)
    .map(documentSnapshot);
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    metadata: { fromCache: false, hasPendingWrites: false },
    docChanges: () => [],
  };
}

const isDocument = (
  source: DocumentRef | CollectionRef | CloudQuery
): source is DocumentRef =>
  "path" in source && source.path.split("/").length % 2 === 0;

type Reader = (
  snapshot:
    | ReturnType<typeof documentSnapshot>
    | ReturnType<typeof querySnapshot>
) => void;

export function onSnapshot(
  source: DocumentRef | CollectionRef | CloudQuery,
  ...rest: unknown[]
): () => void {
  const reader = rest.find(
    (value): value is Reader => typeof value === "function"
  );
  const read = () => {
    reader?.(
      isDocument(source) ? documentSnapshot(source.path) : querySnapshot(source)
    );
  };
  const timer = setTimeout(read, 0);
  const stop = onCloudChange(read);
  return () => {
    clearTimeout(timer);
    stop();
  };
}

export const getDoc = (ref: DocumentRef) =>
  Promise.resolve(documentSnapshot(ref.path));

export const getDocs = (source: CollectionRef | CloudQuery) =>
  Promise.resolve(querySnapshot(source));

function write(ref: DocumentRef, data: Data) {
  putDocument(ref.path, data);
}

const isData = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function withField(data: Data, path: string[], value: unknown): Data {
  const [key, ...rest] = path;
  if (key === undefined) return data;
  if (rest.length > 0) {
    const inner = data[key];
    return {
      ...data,
      [key]: withField(isData(inner) ? inner : {}, rest, value),
    };
  }
  const kept = Object.entries(data).filter(([name]) => name !== key);
  return Object.fromEntries(value === REMOVED ? kept : [...kept, [key, value]]);
}

function change(ref: DocumentRef, data: Data) {
  const before = readDocument(ref.path) ?? {};
  write(
    ref,
    Object.entries(data).reduce<Data>(
      (next, [field, value]) => withField(next, field.split("."), value),
      before
    )
  );
}

const settled = (work: () => void) => Promise.resolve().then(work);

export const setDoc = (ref: DocumentRef, data: Data) =>
  settled(() => {
    write(ref, data);
  });

export const updateDoc = (ref: DocumentRef, data: Data) =>
  settled(() => {
    change(ref, data);
  });

export const deleteDoc = (ref: DocumentRef) =>
  settled(() => {
    dropDocument(ref.path);
  });

export async function addDoc(source: CollectionRef, data: Data) {
  const ref = doc(source);
  await setDoc(ref, data);
  return ref;
}

const transaction = {
  get: getDoc,
  set: write,
  update: change,
  delete: (ref: DocumentRef) => {
    dropDocument(ref.path);
  },
};

export const runTransaction = async <Result>(
  _db: unknown,
  work: (tx: typeof transaction) => Promise<Result>
) => work(transaction);
