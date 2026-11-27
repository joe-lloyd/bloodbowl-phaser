import { freshSpend, spend } from "../../src/game/rules/turnSpend.js";
import { RosterName, type Team, createTeam } from "../../src/types/Team.js";
import {
  type Player,
  type PlayerTemplate,
  PlayerStatus,
  type PlayerStats,
  PositionKeyWord,
  createPlayer,
} from "../../src/types/Player.js";
import { type GameState, GamePhase } from "../../src/types/GameState.js";

export class TeamBuilder {
  private team: Team;

  constructor() {
    this.team = createTeam(
      "Test Team",
      RosterName.HUMAN,
      { primary: 0x0000ff, secondary: 0xffffff },
      50_000
    );
  }

  withName(name: string): this {
    this.team.name = name;
    return this;
  }

  withColors(primary: number, secondary: number): this {
    this.team.colors = { primary, secondary };
    return this;
  }

  withId(id: string): this {
    this.team.id = id;

    for (const player of this.team.players) {
      player.teamId = id;
    }
    return this;
  }

  withRosterName(rosterName: RosterName): this {
    this.team.rosterName = rosterName;
    return this;
  }

  withPlayers(count: number): this {
    this.team.players = [];
    for (let i = 0; i < count; i++) {
      const player = new PlayerBuilder()
        .withTeamId(this.team.id)
        .withNumber(i + 1)
        .build();
      this.team.players.push(player);
    }
    return this;
  }

  withCustomPlayers(players: Player[]): this {
    this.team.players = players;
    return this;
  }

  withTreasury(amount: number): this {
    this.team.treasury = amount;
    return this;
  }

  withRerolls(count: number): this {
    this.team.rerolls = count;
    return this;
  }

  withApothecary(has = true): this {
    this.team.apothecary = has;
    return this;
  }

  withStats(wins: number, losses: number, draws: number): this {
    this.team.wins = wins;
    this.team.losses = losses;
    this.team.draws = draws;
    return this;
  }

  build(): Team {
    return { ...this.team };
  }
}

export class PlayerBuilder {
  private template: PlayerTemplate;
  private teamId: string;
  private number: number;
  private name: string | undefined;
  private status: PlayerStatus;
  private id: string | undefined;
  private gridPosition: { x: number; y: number } | undefined;

  constructor() {
    this.template = {
      positionName: PositionKeyWord.LINEMAN,
      cost: 50_000,
      keywords: [],
      primary: [],
      secondary: [],
      stats: {
        MA: 6,
        ST: 3,
        AG: 3,
        PA: 4,
        AV: 9,
      },
      skills: [],
    };
    this.teamId = "test-team";
    this.number = 1;
    this.status = PlayerStatus.RESERVE;
  }

  withPosition(position: string | PositionKeyWord): this {
    this.template.positionName = position;
    return this;
  }

  withStats(stats: Partial<PlayerStats>): this {
    this.template.stats = { ...this.template.stats, ...stats };
    return this;
  }

  withCost(cost: number): this {
    this.template.cost = cost;
    return this;
  }

  withTeamId(teamId: string): this {
    this.teamId = teamId;
    return this;
  }

  withNumber(number: number): this {
    this.number = number;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withStatus(status: PlayerStatus): this {
    this.status = status;
    return this;
  }

  withGridPosition(x: number, y: number): this {
    this.gridPosition = { x, y };
    return this;
  }

  withId(id: string): this {
    this.id = id;
    return this;
  }

  build(): Player {
    const player = createPlayer(
      this.template,
      this.teamId,
      this.number,
      this.name
    );
    player.status = this.status;
    if (this.gridPosition) {
      player.gridPosition = this.gridPosition;
    }
    if (this.gridPosition) {
      player.gridPosition = this.gridPosition;
    }
    if (this.id) {
      player.id = this.id;
    }
    return player;
  }
}

export class GameStateBuilder {
  private state: GameState;

  constructor() {
    this.state = {
      phase: GamePhase.SETUP,
      activeTeamId: null,
      turn: {
        teamId: "",
        turnNumber: 0,
        isHalf2: false,
        activatedPlayerIds: new Set(),
        spend: freshSpend(),
        hasThrownTeamMate: false,
        hasKickedTeamMate: false,
        hasThrownBomb: false,
        movementUsed: new Map(),
      },
      score: {},
      weather: "Nice",
      ballPosition: null,
      activePlayer: null,
    };
  }

  inPhase(phase: GamePhase): this {
    this.state.phase = phase;
    return this;
  }

  withActiveTeam(teamId: string): this {
    this.state.activeTeamId = teamId;
    this.state.turn.teamId = teamId;
    return this;
  }

  withTurnNumber(turnNumber: number): this {
    this.state.turn.turnNumber = turnNumber;
    return this;
  }

  inHalf2(): this {
    this.state.turn.isHalf2 = true;
    return this;
  }

  withActivatedPlayers(...playerIds: string[]): this {
    this.state.turn.activatedPlayerIds = new Set(playerIds);
    return this;
  }

  withBlitzUsed(against: string): this {
    this.state.turn.spend = spend(this.state.turn.spend, {
      kind: "blitz",
      against,
    });
    return this;
  }

  withScore(
    team1Id: string,
    team1Score: number,
    team2Id: string,
    team2Score: number
  ): this {
    this.state.score = {
      [team1Id]: team1Score,
      [team2Id]: team2Score,
    };
    return this;
  }

  build(): GameState {
    return { ...this.state };
  }
}
