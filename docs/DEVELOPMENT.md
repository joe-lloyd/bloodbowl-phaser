# Development

## Install and start

Use Node.js 20 or later and pnpm 10.26.0. The package manager version is
pinned in [package.json](../package.json).

```bash
pnpm install --frozen-lockfile
pnpm dev
```

No private books, extracted text or Firebase credentials are required for local
team building, local matches, unit tests or a Vite production bundle.

[Development fixtures](technical/development-seed-data.md) provide legal teams
and competitions for inspection. The seed controls appear on the local team
management page. Their cleanup removes seed-owned data, so use them deliberately.

## Check a change

```bash
pnpm docs:check
pnpm exec vitest run
pnpm e2e:engine
pnpm lint
```

Choose browser and visual tests when changing visible behaviour. See
[the testing guide](technical/testing-guide.md) for focused commands and diagnostics.

## Build and preview

```bash
pnpm build:netlify
pnpm preview
```

This produces `dist/` through Vite. It is the same bundle command used by
[Netlify](../netlify.toml). `pnpm build` additionally runs TypeScript first.
The repository currently has existing TypeScript errors, so that stricter command
fails. Run `pnpm exec tsc --noEmit` to inspect them and check that your change
introduces no additional errors. A successful Vite build does not prove type safety.

Netlify serves `dist/`, routes SPA deep links back to `index.html` and sends the
popup-compatible opener policy configured in `netlify.toml`. Other static hosts
need equivalent SPA routing. Set any `VITE_*` values before building because
Vite embeds them in the bundle.

## Online play with Firebase

Local play does not require this setup. Online play uses Google authentication,
Firestore persistence and a command transport between the two browsers.

1. Create a Firebase project and register a web app.
2. Enable the Google authentication provider and create a Firestore database.
3. Copy [`.env.example`](../.env.example) to `.env.local` and fill the four
   `VITE_FIREBASE_*` client settings.
4. Deploy [Firestore rules](../firestore.rules) with the Firebase CLI:
   `firebase deploy --only firestore:rules`.
5. Add the deployed hostname to Firebase Authentication's authorized domains.
6. Restart Vite, or rebuild the deployed site, after changing environment values.

[Cloud Functions](../functions/) provide an optional join path. The client also
has a transactional join path, so deploying Functions is not required for the
standard client flow. Review Firebase's current deployment requirements before
enabling additional services.

For local online development:

```bash
firebase emulators:start --only auth,firestore
```

Set `VITE_FIREBASE_USE_EMULATORS=true` in `.env.local`. Auth uses port 9099 and
Firestore uses port 8080. See [online emulator tests](E2E_TESTING.md) and the
[two-browser match harness](../e2e/online-match/README.md) for scripted checks.

`VITE_ADMIN_EMAILS` controls access to the Sandbox and Sound Test tools in a
configured deployment. Without Firebase configured, these tools are available
for local development. This is a UI gate, not server authorization.

## Private reference material

Keep personally obtained reference books in `docs/pdfs/` and extracted notes in
`docs/rulebook/`. Both directories are ignored in full, including PDFs with
uppercase extensions, notes and extraction output. Create them locally if needed:

```bash
mkdir -p docs/pdfs docs/rulebook
git check-ignore docs/pdfs/reference.pdf docs/rulebook/notes.txt
```

Do not force-add these files. The app uses
[`src/data/skillCatalog.ts`](../src/data/skillCatalog.ts) for public metadata and
short project-written hints. Rules implementations live in `src/game/`, with
behaviour verified by tests. Neither builds nor tests read the private folders.

Removing tracked reference files does not erase older Git commits. This cleanup
leaves repository history intact. Local reference files remain on the machine
where they were kept; ignored files are not transferred to another checkout.
