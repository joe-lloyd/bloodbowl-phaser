import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../src/firebase/auth";
import { MainMenu } from "../../src/ui/components/pages/MainMenu";

const hoisted = vi.hoisted(() => ({
  google: [] as {
    resolve: (user: AuthUser) => void;
    reject: (error: Error) => void;
  }[],
  user: null as AuthUser | null,
  listeners: new Set<(user: AuthUser | null) => void>(),
  createAccount: vi.fn(),
  sendLink: vi.fn(),
}));

vi.mock("../../src/firebase/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/firebase/config")>()),
  isFirebaseConfigured: () => true,
}));

vi.mock("../../src/firebase/auth", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/firebase/auth")>();
  const signInAs = (user: AuthUser) => {
    hoisted.user = user;
    hoisted.listeners.forEach((listener) => listener(user));
    return user;
  };
  return {
    authErrorMessage: actual.authErrorMessage,
    getCurrentUser: () => hoisted.user,
    isAuthResolved: () => true,
    subscribeToAuth: (listener: (user: AuthUser | null) => void) => {
      hoisted.listeners.add(listener);
      return () => hoisted.listeners.delete(listener);
    },
    signOutUser: vi.fn(),
    // Each Google sign-in waits until the test settles it, and the test
    // announces the signed-in coach apart
    signInWithGoogle: () =>
      new Promise<AuthUser>((resolve, reject) =>
        hoisted.google.push({ resolve, reject })
      ),
    signInWithEmail: vi.fn(),
    createAccountWithEmail: async (email: string, password: string) => {
      const created = await hoisted.createAccount(email, password);
      signInAs(created.user);
      return created;
    },
    sendPasswordReset: vi.fn(),
    sendVerificationLink: hoisted.sendLink,
  };
});

vi.mock("../../src/firebase/lobby", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/firebase/lobby")>()),
  getActiveMatchCode: () => Promise.resolve(null),
  getCoachName: () => Promise.resolve(null),
}));

const COACH: AuthUser = {
  uid: "coach",
  displayName: null,
  email: "coach@example.com",
  emailVerified: false,
  photoURL: null,
};

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

/** Set a controlled input the way a typing coach would. */
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("signing in from the main menu", () => {
  let container: HTMLDivElement;
  let root: Root;

  const button = (name: string) =>
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === name
    );
  const click = (name: string) =>
    act(async () => {
      const target = button(name);
      if (!target) throw new Error(`no button ${name}`);
      target.click();
    });
  const dialog = () =>
    container.querySelector('[data-testid="sign-in-dialog"]');
  const where = () =>
    container.querySelector('[data-testid="where"]')?.textContent;

  beforeEach(async () => {
    hoisted.google.length = 0;
    hoisted.user = null;
    hoisted.listeners.clear();
    hoisted.createAccount.mockReset();
    hoisted.sendLink.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () =>
      root.render(
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<MainMenu />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      )
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("lets a cancelled sign-in finish late without closing the next one", async () => {
    await click("Host Game");
    await click("Sign in with Google");
    await click("Cancel");
    expect(dialog()).toBeNull();

    await click("Join Game");
    expect(dialog()).not.toBeNull();
    // The cancelled attempt's Google window comes back now
    await act(async () => hoisted.google[0].resolve(COACH));
    expect(dialog()).not.toBeNull();

    // Joining goes ahead once that coach is signed in
    await act(async () => {
      hoisted.user = COACH;
      hoisted.listeners.forEach((listener) => listener(COACH));
    });
    expect(where()).toBe("/online/join");
    expect(dialog()).toBeNull();
  });

  it("says when the link to confirm a new email did not send, and sends it again", async () => {
    hoisted.createAccount.mockResolvedValue({
      user: COACH,
      linkFailure: "Too many tries. Wait a minute and try again.",
    });
    hoisted.sendLink.mockResolvedValue(undefined);

    await click("Sign in");
    await click("New here? Create an account");
    await act(async () => {
      typeInto(
        container.querySelector('input[type="email"]')!,
        "coach@example.com"
      );
      typeInto(
        container.querySelector('input[type="password"]')!,
        "tackle-zone-7"
      );
    });
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });

    expect(dialog()).toBeNull();
    expect(container.textContent).toContain(
      "The link to confirm your email did not send: Too many tries. Wait a minute and try again."
    );

    await click("Send the link again");
    expect(hoisted.sendLink).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      "A new link to confirm your email is on its way."
    );
  });
});
