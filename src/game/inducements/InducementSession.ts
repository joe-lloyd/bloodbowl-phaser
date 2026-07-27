/**
 * InducementSession - the pregame inducement negotiation for one match.
 *
 * Runs before the engine's own phase machine starts (there is no
 * GamePhase for it — see design.md: inducements are a pregame step shared
 * by local, competition, online, and headless matches, not an in-match
 * decision). Both coaches select against the same authoritative catalog and
 * budget; each selection and the final confirmation are revalidated here,
 * so a forged over-budget or Star Player submission is rejected regardless
 * of what a client's own UI would have allowed.
 *
 * Once every team has confirmed, `toInventory()` produces the match-scoped
 * inventory the caller commits into GameState via
 * `IGameService.commitInducements`.
 */

import { Inducement, InducementRuleProfile } from "../../types/Inducements";
import {
  InducementSelectionLine,
  toInventoryEntries,
  validateInducementSelection,
} from "./rules";

export interface InducementCommandResult {
  ok: boolean;
  errors: string[];
}

export class InducementSession {
  private selections = new Map<string, InducementSelectionLine[]>();
  private confirmed = new Set<string>();

  constructor(
    private readonly profile: InducementRuleProfile,
    private readonly budgets: Record<string, number>
  ) {}

  getProfile(): InducementRuleProfile {
    return this.profile;
  }

  getBudgets(): Record<string, number> {
    return { ...this.budgets };
  }

  getBudgetFor(teamId: string): number {
    return this.budgets[teamId] ?? 0;
  }

  getSelection(teamId: string): InducementSelectionLine[] {
    return [...(this.selections.get(teamId) ?? [])];
  }

  isConfirmed(teamId: string): boolean {
    return this.confirmed.has(teamId);
  }

  bothConfirmed(teamIds: string[]): boolean {
    return teamIds.every((id) => this.confirmed.has(id));
  }

  /** Set (or clear, at quantity 0) one line of a team's pending selection. */
  select(
    teamId: string,
    inducement: Inducement,
    quantity: number
  ): InducementCommandResult {
    if (this.confirmed.has(teamId)) {
      return { ok: false, errors: ["already-confirmed"] };
    }
    const current = this.selections.get(teamId) ?? [];
    const next = current.filter((line) => line.inducement !== inducement);
    if (quantity > 0) next.push({ inducement, quantity });

    const check = validateInducementSelection(
      this.profile,
      this.getBudgetFor(teamId),
      next
    );
    if (!check.valid) return { ok: false, errors: check.errors };

    this.selections.set(teamId, next);
    return { ok: true, errors: [] };
  }

  remove(teamId: string, inducement: Inducement): InducementCommandResult {
    return this.select(teamId, inducement, 0);
  }

  /** Re-validate and lock in a team's current selection. */
  confirm(teamId: string): InducementCommandResult {
    const selection = this.selections.get(teamId) ?? [];
    const check = validateInducementSelection(
      this.profile,
      this.getBudgetFor(teamId),
      selection
    );
    if (!check.valid) return { ok: false, errors: check.errors };
    this.confirmed.add(teamId);
    return { ok: true, errors: [] };
  }

  /** Every confirmed team's purchases, ready to commit into match state. */
  toInventory() {
    return [...this.confirmed].flatMap((teamId) =>
      toInventoryEntries(this.profile, teamId, this.selections.get(teamId) ?? [])
    );
  }
}
