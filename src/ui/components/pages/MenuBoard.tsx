import type { ReactNode } from "react";
import { Title } from "../componentWarehouse/HudTitle";
import { GAME_TYPES, GAME_TYPE_LABELS } from "../../../game/variants/gameTypes";
import {
  HudButton,
  type HudButtonSize,
  type HudButtonVariant,
  Panel,
} from "../componentWarehouse/HudKit";
import { FriendsMenuButton } from "../social/LobbyFriends";

const ONLINE_HINT = "Online play requires Firebase config (see .env.example)";

type Go = (path: string) => void;

interface MenuGroupsProps {
  admin: boolean;
  uid: string | null;
  onlineAvailable: boolean;
  onlineDisabled: boolean;
  onOpen: Go;
  onOnline: Go;
}

interface MenuButtonProps {
  path: string;
  go: Go;
  children: ReactNode;
  variant?: HudButtonVariant;
  size?: HudButtonSize;
  className?: string;
  disabled?: boolean;
  title?: string | undefined;
}

function MenuButton({ path, go, children, ...button }: MenuButtonProps) {
  return (
    <HudButton
      block
      {...button}
      onClick={() => {
        go(path);
      }}
    >
      {children}
    </HudButton>
  );
}

function MenuRow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel
      as="section"
      className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-3 p-3 phone:portrait:grid-cols-1 phone:portrait:gap-2"
    >
      <Title level="section" as="h2">
        {title}
      </Title>
      <div className="grid grid-cols-3 gap-2 phone:portrait:grid-cols-2 phone:portrait:[&>:last-child:nth-child(odd)]:col-span-2">
        {children}
      </div>
    </Panel>
  );
}

function AdminRows({ go }: { go: Go }) {
  return (
    <>
      <MenuRow title="Club">
        <MenuButton path="/clubs" go={go}>
          My Clubs
        </MenuButton>
        <MenuButton path="/clubs/new" go={go}>
          Found a Club
        </MenuButton>
      </MenuRow>
      <MenuRow title="Extras">
        <MenuButton path="/sand-box" go={go} variant="ghost">
          Sandbox
        </MenuButton>
        <MenuButton path="/kickoff-playground" go={go} variant="ghost">
          Kick-off Playground
        </MenuButton>
        <MenuButton path="/music" go={go} variant="ghost">
          Sound Test
        </MenuButton>
      </MenuRow>
    </>
  );
}

function OnlineRow(props: MenuGroupsProps) {
  const { onOnline, onlineDisabled } = props;
  const hint = props.onlineAvailable ? undefined : ONLINE_HINT;
  return (
    <MenuRow title="Online">
      <MenuButton
        path="/online/host"
        go={onOnline}
        disabled={onlineDisabled}
        title={hint}
      >
        Host Game
      </MenuButton>
      <MenuButton
        path="/online/join"
        go={onOnline}
        disabled={onlineDisabled}
        title={hint}
      >
        Join Game
      </MenuButton>
      <FriendsMenuButton
        uid={props.uid}
        disabled={onlineDisabled}
        title={hint}
        onClick={() => {
          onOnline("/friends");
        }}
      />
    </MenuRow>
  );
}

export function MenuGroups(props: MenuGroupsProps) {
  const go = props.onOpen;
  return (
    <nav
      aria-label="Main menu"
      className="flex w-full flex-col gap-3 text-left"
    >
      <MenuRow title="Play">
        <MenuButton
          path="/select-team"
          go={go}
          variant="primary"
          size="lg"
          className="col-span-2"
        >
          Play Local
        </MenuButton>
        <MenuButton
          path="/build-team"
          go={go}
          className="phone:portrait:col-span-2"
        >
          Teams
        </MenuButton>
      </MenuRow>
      <MenuRow title="Competitions">
        <MenuButton path="/leagues" go={go}>
          Leagues
        </MenuButton>
        <MenuButton path="/tournaments" go={go}>
          Tournaments
        </MenuButton>
      </MenuRow>
      <OnlineRow {...props} />
      {props.admin && <AdminRows go={go} />}
    </nav>
  );
}

function Masthead() {
  return (
    <div className="flex flex-col items-center text-center">
      <Title level="hero" as="h1">
        BLOOD BOWL
      </Title>
      <p className="mt-3 font-hud-label text-hud-base font-bold uppercase tracking-[0.08em] text-hud-dim phone:mt-1">
        {GAME_TYPES.map((gameType) => GAME_TYPE_LABELS[gameType]).join(" · ")}
      </p>
      <div
        aria-hidden
        className="mt-4 h-[3px] w-56 bg-gradient-to-r from-transparent via-hud-blood to-transparent phone:mt-2"
      />
    </div>
  );
}

export function MenuLayout({
  menu,
  side,
}: {
  menu: ReactNode;
  side: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-6 phone:gap-4 phone:py-0">
      <Masthead />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] phone:gap-4">
        {menu}
        <aside className="flex flex-col gap-3">{side}</aside>
      </div>
    </div>
  );
}
