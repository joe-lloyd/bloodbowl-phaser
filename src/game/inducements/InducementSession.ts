import {
  Inducement,
  type InducementCatalogEntry,
  type InducementRuleProfile,
  type InducementSelectionLine,
} from "../../types/Inducements";
import { toInventoryEntries, validateInducementSelection } from "./rules";

export interface InducementCommandResult {
  ok: boolean;
  errors: string[];
}

export class InducementSession {
  private selections = new Map<string, InducementSelectionLine[]>();
  private confirmed = new Set<string>();

  private readonly profile: InducementRuleProfile;
  private readonly budgets: Record<string, number>;
  private readonly catalogs: Record<string, InducementCatalogEntry[]>;
  constructor(
    profile: InducementRuleProfile,
    budgets: Record<string, number>,
    catalogs: Record<string, InducementCatalogEntry[]>,
    saved?: {
      selections: Record<string, InducementSelectionLine[]>;
      confirmed: Record<string, boolean>;
    }
  ) {
    this.profile = profile;
    this.budgets = budgets;
    this.catalogs = catalogs;
    for (const [id, selection] of Object.entries(saved?.selections ?? {}))
      this.selections.set(
        id,
        selection.map((line) => ({ ...line }))
      );
    for (const [id, confirmed] of Object.entries(saved?.confirmed ?? {}))
      if (confirmed) this.confirmed.add(id);
  }

  getProfile(): InducementRuleProfile {
    return this.profile;
  }

  getBudgets(): Record<string, number> {
    return { ...this.budgets };
  }

  getCatalogs(): Record<string, InducementCatalogEntry[]> {
    return { ...this.catalogs };
  }

  getCatalogFor(teamId: string): InducementCatalogEntry[] {
    return this.catalogs[teamId] ?? [];
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

  select(
    teamId: string,
    inducement: Inducement,
    quantity: number
  ): InducementCommandResult {
    if (this.confirmed.has(teamId)) {
      return { ok: false, errors: ["already-confirmed"] };
    }
    if (!(teamId in this.catalogs))
      return { ok: false, errors: ["unknown-team"] };
    if (!Number.isSafeInteger(quantity) || quantity < 0)
      return { ok: false, errors: ["invalid-quantity"] };
    const current = this.selections.get(teamId) ?? [];
    const next = current.filter((line) => line.inducement !== inducement);
    if (quantity > 0) next.push({ inducement, quantity });

    const check = validateInducementSelection(
      this.getCatalogFor(teamId),
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

  confirm(teamId: string): InducementCommandResult {
    if (!(teamId in this.catalogs))
      return { ok: false, errors: ["unknown-team"] };
    if (this.confirmed.has(teamId)) return { ok: true, errors: [] };
    const selection = this.selections.get(teamId) ?? [];
    const check = validateInducementSelection(
      this.getCatalogFor(teamId),
      this.getBudgetFor(teamId),
      selection
    );
    if (!check.valid) return { ok: false, errors: check.errors };
    this.confirmed.add(teamId);
    return { ok: true, errors: [] };
  }

  toInventory() {
    return [...this.confirmed].flatMap((teamId) =>
      toInventoryEntries(
        this.getCatalogFor(teamId),
        teamId,
        this.selections.get(teamId) ?? []
      )
    );
  }
}
