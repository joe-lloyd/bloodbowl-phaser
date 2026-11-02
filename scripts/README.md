# Utility scripts

Use the package commands where available. The scripts behind them live here.

| Tool                  | Purpose                                                           | Guide                                                    |
| --------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| `pnpm docs:check`     | Check local Markdown links and prevent tracked private references | [Development](../docs/DEVELOPMENT.md)                    |
| `pnpm perf`           | Build and measure the rendering benchmark                         | [Performance log](../perf-results/LOG.md)                |
| `pnpm gallery:shots`  | Capture component-gallery states                                  | [Visual design](../docs/design/visual-design.md)         |
| `scripts/page-shots/` | Capture application pages for the gallery                         | [Capture configuration](page-shots/playwright.config.ts) |
| `scripts/sprites/`    | Build and render player and stadium art                           | [Art pipeline](sprites/README.md)                        |
| `pnpm e2e:seeds`      | Inspect and maintain deterministic outcome seeds                  | [E2E testing](../docs/E2E_TESTING.md)                    |
| `pnpm e2e:replay`     | Replay a scenario or diagnostic recording                         | [E2E testing](../docs/E2E_TESTING.md)                    |
