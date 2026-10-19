import React, { useState } from 'react';
import {
  X,
  Check,
  MapPin,
  Sparkles,
  Save,
  Volume2,
  Sword,
  Shield,
  Award,
  Layers,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  FRONTIER_REGIONS,
  MAIN_BOSSES,
  MANDATORY_QUESTS,
  VERSUS_ROSTER,
  VERSUS_ARENAS,
} from '@/game/data/campaignData';
import { ASSET_MANIFEST } from '@/game/assets/assetManifest';

export default function MenusAndModals({
  activeModal, // 'map' | 'upgrades' | 'journal' | 'inspector' | 'pause' | 'settings' | 'versus_setup' | 'chapter_select' | 'credits' | null
  onClose,
  campaignState,
  onFastTravelToRegion,
  onJumpToBossOrQuest,
  onPurchaseUpgrade,
  saveSlots,
  onSaveToSlot,
  onLoadFromSlot,
  settings,
  onUpdateSettings,
  assetStatuses,
  onStartVersusMatch,
  onReturnToTitle,
}) {
  const [vsPlayerId, setVsPlayerId] = useState('vs_dio_normal');
  const [vsCpuId, setVsCpuId] = useState('vs_jotaro');
  const [vsArenaId, setVsArenaId] = useState('arena_ebon');
  const [vsDifficulty, setVsDifficulty] = useState('normal');

  if (!activeModal) return null;

  return (
    <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-8">
      <div className="max-w-5xl w-full max-h-[88vh] bg-slate-950 border-2 border-amber-500/45 rounded-xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-amber-500/25 bg-slate-900/70">
          <h2 className="font-western font-bold text-xl text-amber-200 tracking-wider uppercase">
            {activeModal === 'map' && 'Frontier Atlas & Hitching Post Fast Travel'}
            {activeModal === 'upgrades' && 'The World — Stand & Vampiric Mastery'}
            {activeModal === 'journal' && 'Campaign Quest Journal & Frontier Clues'}
            {activeModal === 'inspector' && '28 Supplied GLB Models — Runtime Verification Manifest'}
            {activeModal === 'pause' && 'Pause, Checkpoints & Manual Save Slots'}
            {activeModal === 'settings' && 'Graphics, Audio & Accessibility Settings'}
            {activeModal === 'versus_setup' && 'Standalone 1v1 CPU Versus Mode'}
            {activeModal === 'chapter_select' && 'Campaign Chapter, Quest & Boss Encounter Select'}
            {activeModal === 'credits' && "JoJo's Bizarre Adventure: Path to Heaven — Credits"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* 1. FRONTIER MAP */}
          {activeModal === 'map' && (
            <div className="space-y-4">
              <p className="text-xs font-mono text-slate-400">
                The frontier stretches 5,000 meters northward from Ebon Crossing (Z: 0) to Heaven&apos;s Reach (Z: -4600). Ride Slow Dancer along the trail or fast-travel to any region hitching post:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {FRONTIER_REGIONS.map((reg) => {
                  const boss = MAIN_BOSSES.find((b) => b.regionId === reg.id);
                  const defeated = boss && campaignState.bossesDefeated.includes(boss.index);
                  return (
                    <div
                      key={reg.id}
                      className="p-4 rounded-lg bg-slate-900/90 border border-amber-500/30 flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs font-mono text-amber-400">
                          <span>REGION 0{reg.index + 1}</span>
                          <span>Z: {reg.centerZ}m</span>
                        </div>
                        <h3 className="font-western font-bold text-base text-amber-100 mt-1">
                          {reg.name}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">{reg.description}</p>
                      </div>
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-purple-300">
                          {boss ? `${boss.name} ${defeated ? '(Defeated)' : ''}` : ''}
                        </span>
                        <button
                          onClick={() => {
                            onFastTravelToRegion(reg);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-western font-bold text-xs"
                        >
                          Ride Here
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. STAND UPGRADES */}
          {activeModal === 'upgrades' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between bg-slate-900 p-4 rounded-lg border border-amber-500/30">
                <div>
                  <div className="text-xs font-mono text-amber-400">AVAILABLE STAND MASTERY POINTS</div>
                  <div className="text-2xl font-western font-bold text-amber-100">
                    {campaignState.stats.skillPoints} Points Available
                  </div>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Earn Mastery Points by completing Quests and defeating Bosses.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    key: 'timeStopLevel',
                    title: 'The World — Time Stop Duration',
                    desc: 'Increases frozen time duration (+1.2s per rank) and reduces cooldown.',
                    level: campaignState.upgrades.timeStopLevel,
                  },
                  {
                    key: 'standPowerLevel',
                    title: 'Stand Destructive Power (Rank A+)',
                    desc: 'Boosts Light Strike, Heavy Smash, and Muda Muda Barrage damage by +18% per rank.',
                    level: campaignState.upgrades.standPowerLevel,
                  },
                  {
                    key: 'vampiricVitalityLevel',
                    title: 'Immortal Vampiric Vitality',
                    desc: 'Increases Max Health (+180 HP per rank) and blood-drain recovery on victories.',
                    level: campaignState.upgrades.vampiricVitalityLevel,
                  },
                  {
                    key: 'horseEnduranceLevel',
                    title: 'Slow Dancer Frontier Endurance',
                    desc: 'Increases Slow Dancer gallop speed and reduces stamina drain across long trails.',
                    level: campaignState.upgrades.horseEnduranceLevel,
                  },
                ].map((upg) => (
                  <div
                    key={upg.key}
                    className="p-4 rounded-lg bg-slate-900/90 border border-amber-500/30 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="font-western font-bold text-amber-100">{upg.title}</h4>
                        <span className="text-xs font-mono text-amber-400">Lv. {upg.level} / 5</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">{upg.desc}</p>
                    </div>
                    <button
                      disabled={campaignState.stats.skillPoints <= 0 || upg.level >= 5}
                      onClick={() => onPurchaseUpgrade(upg.key)}
                      className="w-full py-2 rounded bg-amber-500 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-western font-bold text-xs transition"
                    >
                      {upg.level >= 5 ? 'MAX RANK ACHIEVED' : 'UPGRADE (1 POINT)'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. QUEST JOURNAL & CLUES */}
          {activeModal === 'journal' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="font-western font-bold text-amber-300 text-sm uppercase">
                  Nine Mandatory Frontier Quests
                </h3>
                {MANDATORY_QUESTS.map((q) => {
                  const done = campaignState.questsCompleted.includes(q.index);
                  const current = campaignState.currentQuestIndex === q.index && !done;
                  return (
                    <div
                      key={q.id}
                      className={`p-3 rounded border text-xs ${
                        done
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                          : current
                          ? 'bg-amber-500/15 border-amber-400 text-amber-100'
                          : 'bg-slate-900/70 border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>{q.title}</span>
                        <span>{done ? 'COMPLETED' : current ? 'ACTIVE' : 'LOCKED'}</span>
                      </div>
                      <p className="mt-1 text-[11px] opacity-85">{q.summary}</p>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-3">
                <h3 className="font-western font-bold text-purple-300 text-sm uppercase">
                  Collected Arrow Clues &amp; Ten Bosses
                </h3>
                {MAIN_BOSSES.map((b) => {
                  const defeated = campaignState.bossesDefeated.includes(b.index);
                  return (
                    <div
                      key={b.id}
                      className="p-2.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-amber-100">
                          {b.index + 1}. {b.name}
                        </span>{' '}
                        <span className="text-purple-300 font-mono">({b.standName})</span>
                      </div>
                      <span
                        className={`font-mono text-[11px] ${
                          defeated ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {defeated ? 'DEFEATED' : 'AWAITING'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. CHAPTER, QUEST & BOSS ENCOUNTER SELECT */}
          {activeModal === 'chapter_select' && (
            <div className="space-y-4">
              <p className="text-xs font-mono text-slate-300">
                Select any of the 10 Main Bosses, 9 Quests, or the Final Heaven Ascension Rematch to jump straight to that encounter for testing or replay:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {MAIN_BOSSES.map((b) => {
                  const questAfter = MANDATORY_QUESTS.find((q) => q.unlockedAfterBoss === b.index);
                  return (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-lg bg-slate-900 border border-amber-500/30 flex flex-col justify-between space-y-2.5"
                    >
                      <div>
                        <div className="text-[11px] font-mono text-amber-400">
                          ENCOUNTER {b.index + 1} • {b.title}
                        </div>
                        <div className="font-western font-bold text-base text-amber-100">
                          {b.name} — <span className="text-purple-300">{b.standName}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{b.mechanicSummary}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={() => {
                            onJumpToBossOrQuest({ type: 'boss', index: b.index });
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-western font-bold text-xs"
                        >
                          Fight Boss #{b.index + 1}
                        </button>
                        {questAfter && (
                          <button
                            onClick={() => {
                              onJumpToBossOrQuest({ type: 'quest', index: questAfter.index });
                              onClose();
                            }}
                            className="px-3 py-1.5 rounded bg-purple-900/80 hover:bg-purple-800 text-purple-100 border border-purple-400/40 font-mono text-xs"
                          >
                            Play {questAfter.title.split(':')[0]} ({questAfter.npcName})
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. 28 GLB ASSET VERIFICATION INSPECTOR */}
          {activeModal === 'inspector' && (
            <div className="space-y-3">
              <div className="bg-slate-900/90 border border-amber-500/30 p-3.5 rounded text-xs font-mono text-amber-200">
                All 28 supplied GLB source files are extracted into <code className="text-amber-400">/models/</code> and mapped with zero generated replacement humanoids. Dual-rigged and 2-mesh character/Stand files are separated into independent centered groups at runtime.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {ASSET_MANIFEST.map((item, i) => {
                  const st = assetStatuses?.find((s) => s.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded bg-slate-900 border border-slate-800 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-300">
                          #{i + 1}. {item.fileName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                            st?.status === 'loaded'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {st?.status || 'ready'} {st?.meshCount ? `• ${st.meshCount} meshes` : ''}
                        </span>
                      </div>
                      <div className="text-amber-100 font-medium">{item.role}</div>
                      <div className="text-[11px] text-slate-400">{item.notes}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. PAUSE & SAVE SLOTS */}
          {activeModal === 'pause' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[0, 1, 2].map((slotIdx) => {
                  const slot = saveSlots[slotIdx];
                  return (
                    <div
                      key={slotIdx}
                      className="p-4 rounded-lg bg-slate-900 border border-amber-500/30 flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="text-xs font-mono text-amber-400">
                          MANUAL SAVE SLOT 0{slotIdx + 1}
                        </div>
                        <div className="font-western font-bold text-sm text-amber-100 mt-1">
                          {slot ? slot.label : 'Empty Frontier Slot'}
                        </div>
                        {slot && (
                          <div className="text-[11px] font-mono text-slate-400 mt-1">
                            {new Date(slot.timestamp).toLocaleTimeString()} • Bosses:{' '}
                            {slot.bossesDefeated?.length || 0}/10
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onSaveToSlot(slotIdx)}
                          className="flex-1 py-2 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-western font-bold text-xs"
                        >
                          Save
                        </button>
                        {slot && (
                          <button
                            onClick={() => {
                              onLoadFromSlot(slot);
                              onClose();
                            }}
                            className="flex-1 py-2 rounded bg-slate-800 hover:bg-slate-700 text-amber-200 font-western font-bold text-xs"
                          >
                            Load
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={onReturnToTitle}
                  className="px-5 py-2.5 rounded bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-500/40 font-western text-xs tracking-wider"
                >
                  Return to Title Screen
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-western font-bold text-xs tracking-wider"
                >
                  Resume Game
                </button>
              </div>
            </div>
          )}

          {/* 7. SETTINGS */}
          {activeModal === 'settings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div className="space-y-4">
                <label className="block space-y-1">
                  <span className="text-xs font-mono text-amber-300">
                    Nighttime Exposure / Brightness ({Math.round(settings.brightness * 100)}%)
                  </span>
                  <input
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.05"
                    value={settings.brightness}
                    onChange={(e) => onUpdateSettings({ brightness: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-mono text-amber-300">
                    Master Audio Volume ({Math.round(settings.masterVolume * 100)}%)
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.masterVolume}
                    onChange={(e) => onUpdateSettings({ masterVolume: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-mono text-amber-300">
                    Storm, Rain &amp; Thunder Volume ({Math.round(settings.stormVolume * 100)}%)
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.stormVolume}
                    onChange={(e) => onUpdateSettings({ stormVolume: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                </label>
              </div>
              <div className="space-y-4">
                <label className="flex items-center justify-between p-3 rounded bg-slate-900 border border-slate-800">
                  <span>Cinematic &amp; Combat Subtitles</span>
                  <input
                    type="checkbox"
                    checked={settings.subtitles}
                    onChange={(e) => onUpdateSettings({ subtitles: e.target.checked })}
                    className="w-4 h-4 accent-amber-500"
                  />
                </label>
                <label className="flex items-center justify-between p-3 rounded bg-slate-900 border border-slate-800">
                  <span>Reduced Lightning &amp; Time-Stop Flashing</span>
                  <input
                    type="checkbox"
                    checked={settings.reducedFlashing}
                    onChange={(e) => onUpdateSettings({ reducedFlashing: e.target.checked })}
                    className="w-4 h-4 accent-amber-500"
                  />
                </label>
              </div>
            </div>
          )}

          {/* 8. VERSUS MODE SETUP */}
          {activeModal === 'versus_setup' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-mono uppercase text-amber-400 mb-2">
                    Select Player Fighter (16 Supplied Characters)
                  </h3>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                    {VERSUS_ROSTER.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setVsPlayerId(f.id)}
                        className={`p-2.5 rounded border text-left text-xs transition ${
                          vsPlayerId === f.id
                            ? 'bg-amber-500/25 border-amber-400 text-amber-100'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="font-bold">{f.name}</div>
                        <div className="text-[10px] font-mono text-purple-300">{f.standName}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-mono uppercase text-red-400 mb-2">
                    Select CPU Opponent
                  </h3>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                    {VERSUS_ROSTER.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setVsCpuId(f.id)}
                        className={`p-2.5 rounded border text-left text-xs transition ${
                          vsCpuId === f.id
                            ? 'bg-red-500/25 border-red-400 text-red-100'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="font-bold">{f.name}</div>
                        <div className="text-[10px] font-mono text-purple-300">{f.standName}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <span className="text-xs font-mono text-amber-300 block mb-1.5">
                    Nighttime Frontier Arena
                  </span>
                  <select
                    value={vsArenaId}
                    onChange={(e) => setVsArenaId(e.target.value)}
                    className="w-full bg-slate-900 border border-amber-500/40 rounded px-3 py-2 text-xs text-amber-100"
                  >
                    {VERSUS_ARENAS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-xs font-mono text-amber-300 block mb-1.5">
                    CPU Difficulty Tier
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {['beginner', 'normal', 'expert'].map((d) => (
                      <button
                        key={d}
                        onClick={() => setVsDifficulty(d)}
                        className={`py-2 rounded border text-xs font-mono uppercase ${
                          vsDifficulty === d
                            ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                            : 'bg-slate-900 text-slate-300 border-slate-800'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  onStartVersusMatch({
                    playerFighter: VERSUS_ROSTER.find((r) => r.id === vsPlayerId),
                    cpuFighter: VERSUS_ROSTER.find((r) => r.id === vsCpuId),
                    arena: VERSUS_ARENAS.find((a) => a.id === vsArenaId),
                    difficulty: vsDifficulty,
                  });
                  onClose();
                }}
                className="w-full py-3.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-western font-bold tracking-wider text-sm"
              >
                LAUNCH 1V1 VERSUS SHOWDOWN
              </button>
            </div>
          )}

          {/* 9. CREDITS */}
          {activeModal === 'credits' && (
            <div className="text-center space-y-4 py-6 font-lore">
              <div className="text-xs font-mono uppercase tracking-[0.35em] text-amber-400">
                Alternate-Universe Frontier Experience
              </div>
              <h3 className="text-3xl font-western font-black text-amber-100">
                JOJO&apos;S BIZARRE ADVENTURE: PATH TO HEAVEN
              </h3>
              <p className="max-w-xl mx-auto text-lg text-slate-300">
                Built as a connected 3D nighttime western Stand action-adventure featuring all 28 supplied GLB character, Stand, mount, arrow, and environmental models.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto text-xs font-mono text-slate-400 pt-4">
                <div>Playable: Normal DIO &amp; Heaven Ascension DIO</div>
                <div>Mount: Slow Dancer (Steel Ball Run)</div>
                <div>10 Main Campaign Bosses + Jotaro Rematch</div>
                <div>9 Mandatory Character Quests</div>
                <div>16-Fighter CPU Versus Mode</div>
                <div>Permanent Night Storm &amp; WebAudio Engine</div>
              </div>
              <div className="pt-4">
                <button
                  onClick={onReturnToTitle}
                  className="px-6 py-2.5 rounded bg-amber-500 text-slate-950 font-western font-bold text-xs tracking-wider"
                >
                  Return to Title Screen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}