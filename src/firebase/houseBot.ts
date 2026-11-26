import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "./config";
import { setCoachName } from "./coaches";

interface HouseBotLogin {
  email: string;
  password: string;
}

declare global {
  var __houseBotLogin: HouseBotLogin | undefined;
}

export async function signInHouseBot(): Promise<void> {
  const login = globalThis.__houseBotLogin;
  if (!login || !isFirebaseConfigured()) return;
  const auth = getFirebaseAuth();
  if (auth.currentUser?.email === login.email) return;
  try {
    await signInWithEmailAndPassword(auth, login.email, login.password);
  } catch (error) {
    const code = error instanceof FirebaseError ? error.code : "";
    if (code !== "auth/invalid-credential" && code !== "auth/user-not-found")
      throw error;
    const created = await createUserWithEmailAndPassword(
      auth,
      login.email,
      login.password
    );
    await setCoachName(created.user.uid, "House Bot");
  }
}

const HOUSE_BOT_FLAG = "bb-house-bot";

export function isHouseBotBrowser(): boolean {
  try {
    return localStorage.getItem(HOUSE_BOT_FLAG) === "1";
  } catch {
    return false;
  }
}
