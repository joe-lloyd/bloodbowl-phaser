import { chromium } from "@playwright/test";
import { createHash, X509Certificate } from "node:crypto";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import https from "node:https";

const output = resolve(process.argv[2] ?? "/tmp/camera-playground-evidence");
await mkdir(output, { recursive: true });
const config = JSON.parse(
  await readFile(join(homedir(), ".htmlify/daemon.json"), "utf8")
);
const origin = "https://192.168.2.48:7337";
const url = `${origin}/t/${encodeURIComponent(config.token)}/v/bloodbowl/camera-playground-2026-11-16/index.html`;
const fingerprint = createHash("sha256")
  .update(new X509Certificate(config.tls.cert).raw)
  .digest("hex");
const routeCheck = await new Promise((resolveCheck, reject) => {
  https
    .get(url, { rejectUnauthorized: false }, (res) => {
      const actual = createHash("sha256")
        .update(res.socket.getPeerCertificate().raw)
        .digest("hex");
      if (actual !== fingerprint) {
        res.destroy();
        reject(
          new Error(
            "Daemon certificate fingerprint differs from local configuration"
          )
        );
        return;
      }
      let bytes = 0;
      res.on("data", (chunk) => {
        bytes += chunk.length;
      });
      res.on("end", () =>
        resolveCheck({
          status: res.statusCode,
          bytes,
          certificateMatches: true,
        })
      );
    })
    .on("error", reject);
});
const browser = await chromium.launch({ headless: true });
const report = {
  routeCheck,
  viewports: [],
  checks: 0,
  invariantSamples: 0,
  maxZoomDelta: 0,
  errors: [],
  comparisons: [],
};

try {
  for (const viewport of process.argv.includes("--compare-only")
    ? []
    : [
        { width: 1440, height: 1000 },
        { width: 390, height: 844 },
      ]) {
    const context = await browser.newContext({
      viewport,
      ignoreHTTPSErrors: true,
      colorScheme: "dark",
      reducedMotion: "no-preference",
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (res) => {
      if (res.status() >= 400)
        errors.push(`HTTP ${res.status()} ${res.url().split("/").at(-1)}`);
    });
    await page.goto(url);
    await page.waitForFunction(
      () =>
        window.cameraPlayground?.snapshot().ready &&
        window.cameraPlayground.snapshot().phase === "idle"
    );
    const snapshot = () =>
      page.evaluate(() => window.cameraPlayground.snapshot());
    const wait = () =>
      page.waitForFunction(() => {
        const s = window.cameraPlayground.snapshot();
        return s.phase === "idle" && !s.animating && !s.moving;
      });
    const assert = (condition, label) => {
      if (!condition) throw new Error(label);
      report.checks++;
    };
    const stable = async (locator, label) => {
      const before = await snapshot();
      // Sample the actual camera every animation frame while the UI control acts.
      await page.evaluate(() => {
        const baseline = window.cameraPlayground.snapshot().zoom;
        window.zoomSamples = { baseline, max: 0, count: 0, active: true };
        const sample = () => {
          const values = window.zoomSamples;
          if (!values.active) return;
          values.max = Math.max(
            values.max,
            Math.abs(window.cameraPlayground.snapshot().zoom - values.baseline)
          );
          values.count++;
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await page.locator(locator).click();
      await wait();
      const samples = await page.evaluate(() => {
        window.zoomSamples.active = false;
        return window.zoomSamples;
      });
      const after = await snapshot();
      report.invariantSamples += samples.count;
      report.maxZoomDelta = Math.max(
        report.maxZoomDelta,
        samples.max,
        Math.abs(after.zoom - before.zoom)
      );
      assert(
        samples.max < 1e-9 && after.zoom === before.zoom,
        `${label}: zoom changed`
      );
      return after;
    };
    const viewportReport = { viewport, policies: [], screenshots: [] };
    report.viewports.push(viewportReport);
    for (const policy of ["team", "keep", "overview"]) {
      await page.locator(`[data-policy="${policy}"]`).click();
      const cases = await page
        .locator("#scenario option")
        .evaluateAll((options) => options.map((o) => o.value));
      const policyReport = { policy, cases: [], opening: null };
      for (const id of cases) {
        process.stdout.write(`${viewport.width}px ${policy}/${id}…\n`);
        await page.selectOption("#scenario", id);
        await page.locator("#reset").click();
        await wait();
        const initial = await snapshot();
        assert(
          initial.selected === "home-1" && initial.activeTeam === "home",
          `${policy}/${id}: reset team/player`
        );
        let state = await stable(
          '#roster button[aria-label="Select Reikland player 2"]',
          `${policy}/${id} select`
        );
        assert(state.selected === "home-2", "Player selection did not change");
        const playerBefore = state.players.find((p) => p.id === "home-2");
        state = await stable("#move", `${policy}/${id} move`);
        const playerAfter = state.players.find((p) => p.id === "home-2");
        assert(
          playerBefore.x !== playerAfter.x || playerBefore.y !== playerAfter.y,
          "Move did not change position"
        );
        if (state.tray) await stable("#tray", "Close preset tray");
        const closed = await snapshot();
        const opened = await stable("#tray", `${policy}/${id} open tray`);
        assert(
          opened.tray && opened.centre.y < closed.centre.y,
          "Tray did not shift visual centre upward"
        );
        const geometry = await page.evaluate(() => {
          const stage = document
            .querySelector("canvas")
            .getBoundingClientRect();
          const score = document
            .querySelector("#scoreboard")
            .getBoundingClientRect();
          const dice = document
            .querySelector("#dice-tray")
            .getBoundingClientRect();
          return {
            expected: (score.bottom - stage.top + (dice.top - stage.top)) / 2,
            actual: window.cameraPlayground.snapshot().centre.y,
            trayBottom: stage.bottom - dice.bottom,
          };
        });
        assert(
          Math.abs(geometry.expected - geometry.actual) < 0.01,
          "Visual centre differs from measured HUD edges"
        );
        assert(
          Math.abs(geometry.trayBottom - 16) < 0.01,
          "Tray moved from its original bottom position"
        );
        await stable("#close-tray", `${policy}/${id} close tray button`);
        state = await stable("#block", `${policy}/${id} block`);
        assert(state.tray, "Block did not open tray");
        await stable(
          '.die[aria-label="Choose defender down result"]',
          `${policy}/${id} choose block die`
        );
        const beforeEnd = await snapshot();
        await page.locator("#end-activation").click();
        await wait();
        const ended = await snapshot();
        assert(
          ended.selected === null &&
            ended.players.find((p) => p.id === "home-2").spent,
          "End activation did not spend selected player"
        );
        if (policy !== "team")
          assert(ended.zoom === beforeEnd.zoom, "Pan-only reset changed zoom");
        else {
          assert(
            ended.players
              .filter((p) => p.team === "home" && !p.spent)
              .every(
                (p) =>
                  p.screen.x > ended.area.left &&
                  p.screen.x < ended.area.right &&
                  p.screen.y - 56 * ended.zoom > ended.area.top &&
                  p.screen.y < ended.area.bottom
              ),
            "Team reset cropped eligible players"
          );
        }
        const handoff = [];
        await page.locator("#end-turn").click();
        if (policy !== "overview") {
          await page.waitForFunction(
            () => window.cameraPlayground.snapshot().phase === "handoff-pause"
          );
          const wide = await snapshot();
          assert(
            wide.players.every(
              (p) =>
                p.screen.x > wide.area.left &&
                p.screen.x < wide.area.right &&
                p.screen.y - 56 * wide.zoom > wide.area.top &&
                p.screen.y < wide.area.bottom
            ),
            "Turn overview cropped a player"
          );
          handoff.push({
            phase: wide.phase,
            zoom: wide.zoom,
            visiblePlayers: wide.players.length,
          });
        }
        await wait();
        state = await snapshot();
        assert(
          state.activeTeam === "away" && state.selected === null,
          "Turn did not hand over to Ironjaw"
        );
        if (policy === "overview")
          assert(
            state.zoom === ended.zoom,
            "Fixed overview handoff changed zoom"
          );
        handoff.push({
          phase: state.phase,
          team: state.activeTeam,
          zoom: state.zoom,
        });
        await stable(
          '#roster button[aria-label="Select Ironjaw player 3"]',
          "Away selection"
        );
        await stable("#move", "Away movement");
        await stable("#tray", "Away tray");
        await page.locator("#end-turn").click();
        await wait();
        state = await snapshot();
        assert(
          state.activeTeam === "home" &&
            state.turn === 2 &&
            state.players
              .filter((p) => p.team === "home")
              .every((p) => !p.spent),
          "Second handoff did not reset eligibility and advance round"
        );
        policyReport.cases.push({
          scenario: id,
          activationZoom: initial.zoom,
          resetZoom: ended.zoom,
          handoff,
        });
      }
      await page.locator("#replay").click();
      const opening = await page.evaluate(async () => {
        const first = window.cameraPlayground.snapshot();
        const samples = [];
        while (window.cameraPlayground.snapshot().phase === "opening") {
          const s = window.cameraPlayground.snapshot();
          samples.push({ x: s.camera.x, y: s.camera.y, zoom: s.zoom });
          await new Promise(requestAnimationFrame);
        }
        return { first, samples, final: window.cameraPlayground.snapshot() };
      });
      assert(
        opening.samples.every(
          (s) =>
            s.x === opening.first.camera.x && s.y === opening.first.camera.y
        ),
        "Opening panned its world centre"
      );
      assert(
        opening.samples.every(
          (s, i, all) => i === 0 || s.zoom >= all[i - 1].zoom
        ),
        "Opening zoom reversed direction"
      );
      policyReport.opening = {
        samples: opening.samples.length,
        centreDrift: 0,
        startZoom: opening.first.zoom,
        endZoom: opening.final.zoom,
      };
      // Manual zoom defines a new held scale. It never leaks into automatic activation zoom.
      const z = (await snapshot()).zoom;
      await page.locator("#zoom-in").click();
      assert((await snapshot()).zoom > z, "Manual zoom in failed");
      await stable(
        '#roster button[aria-label="Select Reikland player 1"]',
        "Select after manual zoom"
      );
      const z2 = (await snapshot()).zoom;
      await page.locator("#zoom-out").click();
      assert((await snapshot()).zoom < z2, "Manual zoom out failed");
      viewportReport.policies.push(policyReport);
      await writeFile(
        join(output, "results.partial.json"),
        JSON.stringify(report, null, 2)
      );
      process.stdout.write(
        `${viewport.width}px ${policy}: ${cases.length} scenarios passed\n`
      );
    }
    // Exhaustion, keyboard selection, notes, drag, wheel, and direct pitch clicks.
    await page.locator('[data-policy="team"]').click();
    await page.selectOption("#scenario", "block");
    await wait();
    const before = await snapshot();
    await page.locator("#guides").check();
    assert((await snapshot()).zoom === before.zoom, "Guides changed zoom");
    const desktop = join(
      output,
      viewport.width > 700 ? "desktop.png" : "phone.png"
    );
    await page.screenshot({ path: desktop, fullPage: true });
    viewportReport.screenshots.push(desktop);
    await page
      .locator("#pitch")
      .screenshot({ path: join(output, `${viewport.width}-stadium.png`) });
    await stable(
      '.die[aria-label="Choose push result"]',
      "Choose first block die"
    );
    await page.locator("#pitch").scrollIntoViewIfNeeded();
    const pitchBox = await page.locator("#pitch").boundingBox();
    let state = await snapshot();
    const target = state.players.find((p) => p.id === "home-1").screen;
    await page.mouse.click(
      pitchBox.x + target.x,
      pitchBox.y + target.y - state.zoom * 20
    );
    await wait();
    assert(
      (await snapshot()).selected === "home-1",
      "Clicking sprite did not select it"
    );
    state = await snapshot();
    const px = pitchBox.x + target.x - 49.497474683 * state.zoom;
    const py = pitchBox.y + target.y + 24.7487373415 * state.zoom * 5;
    await page.mouse.click(px, py);
    await wait();
    assert(
      (await snapshot()).players.find((p) => p.id === "home-1").x === 11 &&
        (await snapshot()).players.find((p) => p.id === "home-1").y === 8,
      "Clicking empty pitch did not move to grid square 11,8"
    );
    const panBefore = await snapshot();
    await page.mouse.move(pitchBox.x + 50, pitchBox.y + 180);
    await page.mouse.down();
    await page.mouse.move(pitchBox.x + 85, pitchBox.y + 205, { steps: 4 });
    await page.mouse.up();
    state = await snapshot();
    assert(
      state.camera.x !== panBefore.camera.x && state.zoom === panBefore.zoom,
      "Drag did not pan with stable zoom"
    );
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(
      (z) => window.cameraPlayground.snapshot().zoom > z,
      state.zoom
    );
    assert((await snapshot()).trigger === "manual-zoom", "Wheel did not zoom");
    await page.locator("#reset").click();
    for (let i = 1; i <= 7; i++) {
      await page
        .locator(`#roster button[aria-label="Select Reikland player ${i}"]`)
        .click();
      await wait();
      await page.locator("#end-activation").click();
      await wait();
    }
    state = await snapshot();
    assert(
      state.selected === null &&
        state.players.filter((p) => p.team === "home").every((p) => p.spent),
      "Exhausting team did not spend all seven players"
    );
    assert(
      await page.locator("#end-activation").isDisabled(),
      "End activation remains enabled without a player"
    );
    await page.locator("#end-turn").click();
    await wait();
    assert(
      (await snapshot()).activeTeam === "away",
      "Exhausted team cannot hand over"
    );
    await page.locator("#reset").click();
    await page.locator("#roster button").nth(1).focus();
    await page.keyboard.press("Enter");
    await wait();
    assert(
      (await snapshot()).selected === "home-2",
      "Keyboard selection failed"
    );
    await page.locator(".review summary").click();
    await page
      .locator("#notes")
      .fill("Tray opens without zoom. Compare the isolated carrier next.");
    await page.locator("#save-note").click();
    assert(
      (await page.locator("#note-count").textContent()).includes("1 saved"),
      "Local note not saved"
    );
    await page.locator("#copy-notes").click();
    await page.waitForFunction(() =>
      document.querySelector("#note-status").textContent.includes("copied")
    );
    assert(
      (await page.locator("#note-status").textContent()).includes("copied"),
      "Feedback copy failed"
    );
    const feedback = await page.evaluate(() => navigator.clipboard.readText());
    assert(
      feedback.includes("Crowded block + tray") &&
        feedback.includes("Tray opens without zoom"),
      "Feedback missing scenario or note"
    );
    await page.reload();
    await page.waitForFunction(() => window.cameraPlayground?.snapshot().ready);
    assert(
      (await page.locator("#note-count").textContent()).includes("1 saved"),
      "Note did not persist across reload"
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth
    );
    assert(overflow <= 1, `Horizontal page overflow ${overflow}px`);
    assert(errors.length === 0, `Browser errors: ${errors.join(", ")}`);
    await context.close();
  }
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport,
      ignoreHTTPSErrors: true,
      colorScheme: "dark",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url.replace(/index\.html$/, "compare.html"));
    const state = (id) =>
      page
        .frameLocator(`#${id}`)
        .locator("body")
        .evaluate(() => window.cameraPlayground.snapshot());
    const finished = () =>
      page.waitForFunction(() =>
        ["compare-a", "compare-b"].every((id) => {
          const s = document
            .getElementById(id)
            ?.contentWindow?.cameraPlayground?.snapshot();
          return (
            s?.ready &&
            s.selected === null &&
            s.phase === "idle" &&
            !s.animating
          );
        })
      );
    await finished();
    const assert = (condition, message) => {
      if (!condition) throw new Error(message);
      report.checks++;
    };
    const afterA = await state("compare-a");
    const afterB = await state("compare-b");
    const visible = (s) =>
      s.players.filter(
        (p) =>
          p.team === "home" &&
          !p.spent &&
          p.screen.x >= s.area.left &&
          p.screen.x <= s.area.right &&
          p.screen.y >= s.area.top &&
          p.screen.y <= s.area.bottom
      ).length;
    assert(
      afterA.policy === "team" && afterB.policy === "keep",
      "Comparison did not load A and B"
    );
    assert(
      afterA.zoom < afterB.zoom * 0.85,
      "Comparison does not show a visible zoom difference"
    );
    assert(visible(afterA) === 6, "A does not show all six eligible teammates");
    assert(
      visible(afterB) < 6,
      "B should leave teammates outside this close view"
    );
    await page.screenshot({
      path: join(output, `${viewport.width}-comparison-after.png`),
      fullPage: true,
    });
    await page.locator("#compare-reset").click();
    const beforeA = await state("compare-a");
    const beforeB = await state("compare-b");
    assert(
      beforeA.selected === "home-1" && beforeB.selected === "home-1",
      "Show before did not restore the same player"
    );
    assert(
      beforeA.zoom === beforeB.zoom,
      "Comparison does not start at the same zoom"
    );
    assert(
      beforeA.camera.x === beforeB.camera.x &&
        beforeA.camera.y === beforeB.camera.y,
      "Comparison does not start at the same centre"
    );
    assert(afterB.zoom === beforeB.zoom, "B changed zoom after End activation");
    await page.screenshot({
      path: join(output, `${viewport.width}-comparison-before.png`),
      fullPage: true,
    });
    await page.locator("#compare-play").click();
    await finished();
    assert(
      (await state("compare-a")).zoom === afterA.zoom,
      "A replay changed the framing"
    );
    assert(
      (await state("compare-b")).zoom === afterB.zoom,
      "B replay changed the framing"
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      "Comparison overflows the viewport"
    );
    assert(
      errors.length === 0,
      `Comparison browser errors: ${errors.join(", ")}`
    );
    report.comparisons.push({
      viewport,
      beforeZoom: beforeA.zoom,
      zoomA: afterA.zoom,
      zoomB: afterB.zoom,
      visibleA: visible(afterA),
      visibleB: visible(afterB),
    });
    await context.close();
  }
  await rm(join(output, "failure.txt"), { force: true });
  await rm(join(output, "results.partial.json"), { force: true });
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(report, null, 2)
  );
  process.stdout.write(
    `${report.checks} checks; ${report.invariantSamples} frame samples; max activation zoom delta ${report.maxZoomDelta}\nEvidence: ${output}\n`
  );
} catch (error) {
  const message = String(error)
    .split(config.token)
    .join("[private]")
    .replaceAll(url, "[HTMLify page]");
  await writeFile(join(output, "failure.txt"), message);
  await writeFile(
    join(output, "results.partial.json"),
    JSON.stringify(report, null, 2)
  );
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
