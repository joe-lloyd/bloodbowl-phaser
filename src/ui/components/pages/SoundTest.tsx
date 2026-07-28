import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { EventBus } from "../../../services/EventBus";
import { SoundManager } from "../../sound/SoundManager";
import { SoundSuite } from "../../sound/SoundSuite";
import { CATALOG_ENTRIES } from "../../sound/catalog";
import { BINDING_LABELS } from "../../sound/bindingLabels";
import { useSoundSettings } from "../../sound/useSoundSettings";

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
    <div className="absolute inset-0 bg-gray-900 flex flex-col items-center overflow-y-auto text-white z-50 py-8">
      <h1 className="text-4xl font-bold mb-8 text-yellow-400">
        Audio Debug Dashboard
      </h1>

      <div className="grid grid-cols-1 max-w-md w-full gap-8 mb-8">
        <div className="flex flex-col gap-4 p-6 bg-gray-800 rounded-lg border border-gray-700">
          <h2 className="text-2xl font-bold mb-4">Sound Settings</h2>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settings.muted}
              onChange={(e) => settings.setMuted(e.target.checked)}
            />
            Mute all sound effects
          </label>
          <label className="flex flex-col gap-2">
            Volume: {Math.round(settings.volume * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => settings.setVolume(Number(e.target.value))}
            />
          </label>
          <p className="text-sm text-gray-400">
            Persisted to localStorage; applied live to every suite sound
            below, including sound already playing.
          </p>
          <button
            onClick={handleStop}
            className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded font-bold transition-colors"
          >
            Stop All
          </button>
        </div>
      </div>

      <div className="w-full max-w-4xl p-6 bg-gray-800 rounded-lg border border-gray-700">
        <h2 className="text-2xl font-bold mb-4">
          Interaction Sound Catalog ({CATALOG_ENTRIES.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CATALOG_ENTRIES.map((sound) => (
            <div
              key={sound.name}
              className="flex items-center justify-between gap-4 p-3 bg-gray-900 rounded border border-gray-700"
            >
              <div>
                <div className="font-bold">{sound.label}</div>
                <div className="text-xs text-gray-400">
                  {BINDING_LABELS[sound.name].join(", ")}
                </div>
              </div>
              <button
                onClick={() => handlePlaySound(sound.name)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded font-bold transition-colors shrink-0"
              >
                Play
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleBack}
        className="mt-8 mb-4 text-gray-400 hover:text-white underline text-lg"
      >
        ← Back to Main Menu
      </button>
    </div>
  );
};
