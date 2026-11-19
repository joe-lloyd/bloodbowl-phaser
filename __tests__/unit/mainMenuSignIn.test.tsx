import { fixtureValue } from "../../src/testing/fixtureValue";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { FirebaseError } from "firebase/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainMenu } from "../../src/ui/components/pages/MainMenu";

const sdk = vi.hoisted(() => {
  interface FakeUser {
    uid: string;
    displayName: null;
    email: string;
    emailVerified: boolean;
    photoURL: null;
  }
  interface Deferred<T> {
    resolve: (value: T) => void;
    reject: (error: Error) => void;
  }
  const deferred = <T,>(list: Deferred<T>[]) =>
    new Promise<T>((resolve, reject) => list.push({ resolve, reject }));
  const state = {
    current: null,
    onChange: (_user: FakeUser | null) => {},
    popups: new Array<Deferred<{ user: FakeUser }>>(),
    links: new Array<Deferred<void>>(),
  };
  const announce = (user: FakeUser | null) => {
    state.current = user;
    state.onChange(user);
  };
  const coach = (email: string): FakeUser => ({
    uid: `uid-${email}`,
    displayName: null,
    email,
    emailVerified: false,
    photoURL: null,
  });
  return { state, announce, coach, deferred };
});

vi.mock("../../src/firebase/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/firebase/config")>()),
  isFirebaseConfigured: () => true,
  getFirebaseAuth: () => ({
    get currentUser() {
      return sdk.state.current;
    },
  }),
}));

vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: (_auth: unknown, listener: () => void) => {
    sdk.state.onChange = listener;
    listener(sdk.state.current);
  },

  signInWithPopup: () => sdk.deferred(sdk.state.popups),
  createUserWithEmailAndPassword: async (_auth: unknown, email: string) => {
    const user = sdk.coach(email);
    sdk.announce(user);
    return { user };
  },
  sendEmailVerification: () => sdk.deferred(sdk.state.links),
  signInWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signOut: async () => {
    sdk.announce(null);
  },
}));

vi.mock("../../src/firebase/lobby", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/firebase/lobby")>()),
  getActiveMatchCode: () => Promise.resolve(null),
  getCoachName: () => Promise.resolve(null),
}));

function Elsewhere() {
  return (
    <>
      <div data-testid="where">{useLocation().pathname}</div>
      <Link to="/">Back</Link>
    </>
  );
}

function typeInto(input: HTMLInputElement, value: string) {
  fixtureValue(fixtureValue(Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )).set).call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

const TOO_MANY = new FirebaseError("auth/too-many-requests", "quota");

describe("signing in from the main menu", () => {
  let container: HTMLDivElement;
  let root: Root;

  const click = (name: string) =>
    act(async () => {
      const target = [...container.querySelectorAll("button, a")].find(
        (b) => b.textContent?.trim() === name
      );
      if (!target) throw new Error(`nothing to click called ${name}`);
      (target as HTMLElement).click();
    });
  const dialog = () =>
    container.querySelector('[data-testid="sign-in-dialog"]');
  const where = () =>
    container.querySelector('[data-testid="where"]')?.textContent ?? "/";
  const createAccount = async (email = "coach@example.com") => {
    await click("New here? Create an account");
    await act(async () => {
      typeInto(fixtureValue(container.querySelector('input[type="email"]')), email);
      typeInto(
        fixtureValue(container.querySelector('input[type="password"]')),
        "tackle-zone-7"
      );
    });
    await act(async () => {
      fixtureValue(container
        .querySelector("form"))
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
  };

  beforeEach(async () => {
    sdk.announce(null);
    sdk.state.popups.length = 0;
    sdk.state.links.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<MainMenu />} />
            <Route path="*" element={<Elsewhere />} />
          </Routes>
        </MemoryRouter>
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("lets a cancelled sign-in finish late without closing the next one", async () => {
    await click("Host Game");
    await click("Sign in with Google");
    await click("Cancel");
    expect(dialog()).toBeNull();

    await click("Join Game");
    expect(dialog()).not.toBeNull();

    const late = sdk.coach("late@example.com");
    await act(async () => {
      fixtureValue(sdk.state.popups[0]).resolve({ user: late });
    });
    expect(dialog()).not.toBeNull();

    await act(async () => {
      sdk.announce(late);
    });
    expect(where()).toBe("/online/join");
  });

  it("says when the link to confirm a new email did not send, and sends it again", async () => {
    await click("Sign in");
    await createAccount();
    await act(async () => {
      fixtureValue(sdk.state.links[0]).reject(TOO_MANY);
    });

    expect(dialog()).toBeNull();
    expect(container.textContent).toContain(
      "The link to confirm your email did not send: Too many tries. Wait a minute and try again."
    );

    await click("Send the link again");
    await act(async () => {
      fixtureValue(sdk.state.links[1]).resolve();
    });
    expect(container.textContent).toContain(
      "A new link to confirm your email is on its way."
    );
  });

  it("reports only the newest send when two overlap", async () => {
    await click("Sign in");
    await createAccount();

    await click("Send the link again");
    await act(async () => {
      fixtureValue(sdk.state.links[1]).resolve();
    });
    await act(async () => {
      fixtureValue(sdk.state.links[0]).reject(TOO_MANY);
    });

    expect(container.textContent).toContain(
      "A new link to confirm your email is on its way."
    );
  });

  it("keeps another account's late send off the coach signed in now", async () => {
    await click("Sign in");
    await createAccount("first@example.com");
    await act(async () => {
      fixtureValue(sdk.state.links[0]).resolve();
    });
    await click("Send the link again");
    await click("Sign out");

    await click("Sign in");
    await createAccount("second@example.com");
    await act(async () => {
      fixtureValue(sdk.state.links[2]).reject(TOO_MANY);
    });

    await act(async () => {
      fixtureValue(sdk.state.links[1]).resolve();
    });

    expect(container.textContent).toContain(
      "The link to confirm your email did not send"
    );
  });

  it("still reports a failed link after Host Game has moved on", async () => {
    await click("Host Game");
    await createAccount();

    expect(where()).toBe("/online/host");

    await act(async () => {
      fixtureValue(sdk.state.links[0]).reject(TOO_MANY);
    });
    await click("Back");
    expect(container.textContent).toContain(
      "The link to confirm your email did not send"
    );
  });
});
