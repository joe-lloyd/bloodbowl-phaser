export class FirebaseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export const initializeApp = () => ({ name: "gallery" });
