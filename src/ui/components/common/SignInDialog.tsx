import { useState } from "react";
import {
  AuthUser,
  authErrorMessage,
  createAccountWithEmail,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
} from "../../../firebase/auth";
import {
  DialogActions,
  DialogShell,
  Field,
  HudButton,
  Notice,
} from "../componentWarehouse/HudKit";

type Mode = "sign-in" | "create";

/**
 * Sign in for online play: with Google, or with an email and password. A
 * new email account gets a link to prove the address; it can play straight
 * away.
 */
export function SignInDialog({
  onSignedIn,
  onClose,
}: {
  /** `linkFailure` is why the link to prove a new address did not send. */
  onSignedIn: (user: AuthUser, linkFailure?: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = async (
    work: () => Promise<{ user: AuthUser; linkFailure?: string }>
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { user, linkFailure } = await work();
      onSignedIn(user, linkFailure);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const withEmail = () =>
    run(() =>
      mode === "create"
        ? createAccountWithEmail(email, password)
        : signInWithEmail(email, password).then((user) => ({ user }))
    );

  const resetPassword = async () => {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Enter your email first, then ask for the link.");
      return;
    }
    try {
      await sendPasswordReset(email);
      setNotice(`A link to choose a new password is on its way to ${email}.`);
    } catch (cause) {
      setError(authErrorMessage(cause));
    }
  };

  return (
    <DialogShell
      testId="sign-in-dialog"
      placement="center"
      backdrop="heavy"
      eyebrow="Online"
      title={mode === "create" ? "Create account" : "Sign in"}
      width="w-[420px]"
    >
      <div className="flex flex-col gap-4">
        <HudButton
          variant="secondary"
          block
          disabled={busy}
          onClick={() =>
            void run(() => signInWithGoogle().then((user) => ({ user })))
          }
        >
          Sign in with Google
        </HudButton>
        <p className="hud-label text-center">or with email</p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void withEmail();
          }}
        >
          <Field label="Email">
            <input
              type="email"
              autoComplete="email"
              className="hud-field"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field
            label="Password"
            hint={mode === "create" ? "At least 6 characters." : undefined}
          >
            <input
              type="password"
              autoComplete={
                mode === "create" ? "new-password" : "current-password"
              }
              className="hud-field"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
          </Field>
          {error && (
            <Notice tone="bad" role="alert">
              {error}
            </Notice>
          )}
          {notice && (
            <Notice tone="info" role="status">
              {notice}
            </Notice>
          )}
          <DialogActions>
            <HudButton variant="ghost" type="button" onClick={onClose}>
              Cancel
            </HudButton>
            <HudButton variant="primary" type="submit" disabled={busy}>
              {mode === "create" ? "Create account" : "Sign in"}
            </HudButton>
          </DialogActions>
        </form>
        <div className="flex flex-wrap justify-between gap-2 text-hud-sm">
          <button
            type="button"
            className="text-hud-gold underline-offset-2 hover:underline"
            onClick={() => {
              setMode(mode === "create" ? "sign-in" : "create");
              setError("");
              setNotice("");
            }}
          >
            {mode === "create"
              ? "Have an account? Sign in"
              : "New here? Create an account"}
          </button>
          {mode === "sign-in" && (
            <button
              type="button"
              className="text-hud-dim underline-offset-2 hover:underline"
              onClick={() => void resetPassword()}
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </DialogShell>
  );
}
