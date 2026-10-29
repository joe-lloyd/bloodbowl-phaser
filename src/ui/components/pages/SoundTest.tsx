import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { EventBus } from "../../../services/EventBus";
import { SoundManager } from "../../sound/SoundManager";
import { SoundSuite } from "../../sound/SoundSuite";
import { CATALOG_ENTRIES } from "../../sound/catalog";
import { BINDING_LABELS } from "../../sound/bindingLabels";
import { useSoundSettings } from "../../sound/useSoundSettings";
import {
  HudButton,
  PageHeader,
  PageShell,
  Section,
} from "../componentWarehouse/HudKit";

interface SoundTestProps {
  eventBus: EventBus;
}

export const SoundTest: React.FC<SoundTestProps> = ({ eventBus }) => {
  const managerRef = useRef<SoundManager | null>(null);
  const suiteRef = useRef<SoundSuite | null>(null);
  const settings = useSoundSettings();
  const navigate = useNavigate();

  const getManager = () => {
    if (!managerRef.current) {
      managerRef.current = new SoundManager();
      suiteRef.current = new SoundSuite(eventBus, managerRef.current);
      void managerRef.current.init();
    }
    return managerRef.current;
  };

  useEffect(() => {
    return () => {
      suiteRef.current?.dispose();
      managerRef.current?.dispose();
    };
  }, []);

  const handleStop = () => {
    getManager().stop();
  };

  const handlePlaySound = (name: (typeof CATALOG_ENTRIES)[number]["name"]) => {
    getManager();
    suiteRef.current?.play(name);
  };

  const handleBack = () => {
    navigate("/");
  };

  return (
    <PageShell width="medium">
      <PageHeader
        eyebrow="Admin"
        title="Audio Debug Dashboard"
        back={{ label: "← Back to Main Menu", onClick: handleBack }}
      />

      <Section title="Sound Settings" bodyClassName="flex flex-col gap-4">
        <label className="flex items-center gap-3 font-hud-body text-hud-base text-hud-bone">
          <input
            type="checkbox"
            className="hud-check"
            checked={settings.muted}
            onChange={(e) => settings.setMuted(e.target.checked)}
          />
          Mute all sound effects
        </label>
        <label className="flex flex-col gap-2 font-hud-body text-hud-base text-hud-bone">
          Volume: {Math.round(settings.volume * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => settings.setVolume(Number(e.target.value))}
            className="w-full max-w-md accent-hud-gold"
          />
        </label>
        <p className="font-hud-body text-hud-sm text-hud-dim">
          Persisted to localStorage; applied live to every suite sound
          below, including sound already playing.
        </p>
        <div>
          <HudButton variant="danger" onClick={handleStop}>
            Stop All
          </HudButton>
        </div>
      </Section>

      <Section
        title={`Interaction Sound Catalog (${CATALOG_ENTRIES.length})`}
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {CATALOG_ENTRIES.map((sound) => (
            <div
              key={sound.name}
              className="flex items-center justify-between gap-4 rounded-hud border border-white/10 bg-black/30 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="font-hud-label text-hud-base font-bold uppercase tracking-[0.04em] text-hud-bone">
                  {sound.label}
                </div>
                <div className="text-hud-sm text-hud-dim">
                  {BINDING_LABELS[sound.name].join(", ")}
                </div>
              </div>
              <HudButton
                size="sm"
                className="shrink-0"
                onClick={() => handlePlaySound(sound.name)}
              >
                Play
              </HudButton>
            </div>
          ))}
        </div>
      </Section>
    </PageShell>
  );
};
