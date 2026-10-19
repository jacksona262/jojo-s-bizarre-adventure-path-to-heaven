import React from 'react';
import {
  Shield,
  Zap,
  Clock,
  Compass,
  Map,
  Sparkles,
  BookOpen,
  Pause,
  Layers,
  Crosshair,
  AlertTriangle,
} from 'lucide-react';

export default function HudOverlay({
  mode, // 'campaign' | 'versus'
  playerStats,
  isHeavenDio,
  standSummoned,
  timeStopActive,
  timeStopCooldown,
  timeStopMaxCooldown,
  isMounted,
  horseStamina,
  lockOnActive,
  currentRegion,
  activeQuest,
  activeBoss,
  bossState,
  contextPrompt,
  versusState,
  onTriggerContextAction,
  onToggleStand,
  onTriggerTimeStop,
  onSummonHorse,
  onToggleMount,
  onOpenMap,
  onOpenUpgrades,
  onOpenJournal,
  onOpenInspector,
  onOpenPause,
}) {
  const hpPct = Math.max(0, Math.min(100, (playerStats.hp / playerStats.maxHp) * 100));
  const energyPct = Math.max(0, Math.min(100, (playerStats.standEnergy / playerStats.maxStandEnergy) * 100));
  const tsReady = timeStopCooldown <= 0.05 && !timeStopActive;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-4 md:p-6">
      {/* TOP BAR: Region / Compass / Active Boss Bar / Quick Tools */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: Player Status Bars */}
          <div className="w-80 bg-slate-950/85 border border-amber-500/35 rounded-lg p-3.5 backdrop-blur-md pointer-events-auto shadow-xl">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-western font-bold text-sm tracking-wider text-amber-200">
                  {isHeavenDio ? 'HEAVEN ASCENSION DIO' : 'DIO'}
                </span>
                {lockOnActive && (
                  <span className="flex items-center gap-1 text-[10px] font-mono bg-red-950/90 text-red-300 border border-red-500/40 px-1.5 py-0.5 rounded">
                    <Crosshair className="w-3 h-3" /> LOCKED
                  </span>
                )}
              </div>
              <span className="text-xs font-mono text-amber-400">
                {Math.ceil(playerStats.hp)} / {playerStats.maxHp} HP
              </span>
            </div>

            {/* HP Bar */}
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-amber-500/30 mb-2">
              <div
                className="h-full bg-gradient-to-r from-red-700 via-amber-500 to-yellow-300 transition-all duration-150"
                style={{ width: `${hpPct}%` }}
              />
            </div>

            {/* Stand Energy Bar */}
            <div className="flex items-center justify-between text-[11px] font-mono text-purple-200 mb-1">
              <span>{isHeavenDio ? 'THE WORLD OVER HEAVEN' : 'THE WORLD'}</span>
              <span>{standSummoned ? 'SUMMONED [Q]' : 'STANDBY [Q]'}</span>
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-purple-500/30 mb-2">
              <div
                className="h-full bg-gradient-to-r from-purple-600 via-fuchsia-500 to-amber-300 transition-all duration-150"
                style={{ width: `${energyPct}%` }}
              />
            </div>

            {/* Time Stop Status + Slow Dancer Stamina */}
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono">
              <button
                onClick={onTriggerTimeStop}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border transition ${
                  timeStopActive
                    ? 'bg-indigo-600 text-white border-indigo-300 animate-pulse'
                    : tsReady
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/50'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {timeStopActive
                    ? 'TIME STOPPED!'
                    : tsReady
                    ? '[F] STOP TIME'
                    : `CD: ${timeStopCooldown.toFixed(1)}s`}
                </span>
              </button>

              <button
                onClick={isMounted ? onToggleMount : onSummonHorse}
                className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-amber-200 border border-amber-500/30 transition"
              >
                <Compass className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {isMounted ? `HORSE ${Math.round(horseStamina)}%` : '[H] SLOW DANCER'}
                </span>
              </button>
            </div>
          </div>

          {/* Center: Region & Objective Compass */}
          <div className="flex flex-col items-center space-y-2 max-w-md w-full">
            <div className="bg-slate-950/85 border border-amber-500/35 px-5 py-2 rounded-full backdrop-blur-md text-center">
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-amber-400">
                {mode === 'versus'
                  ? `VERSUS ROUND ${versusState?.round || 1} • ${versusState?.difficulty?.toUpperCase() || 'NORMAL'} CPU`
                  : `FRONTIER REGION ${currentRegion ? currentRegion.index + 1 : 1} OF 9`}
              </div>
              <div className="font-western font-bold text-base text-amber-100 tracking-wider">
                {currentRegion?.name || 'Ebon Crossing'} —{' '}
                <span className="text-slate-400 text-xs font-normal">{currentRegion?.subtitle}</span>
              </div>
            </div>

            {/* Boss Health Bar when in combat */}
            {bossState && bossState.hp > 0 && (
              <div className="w-full bg-slate-950/90 border-2 border-red-500/50 rounded-lg p-3 backdrop-blur-md shadow-2xl">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div>
                    <span className="font-western font-bold text-amber-200 tracking-wider">
                      {bossState.config.name}
                    </span>
                    <span className="text-purple-300 font-mono ml-2">
                      [{bossState.config.standName}]
                    </span>
                  </div>
                  <span className="font-mono text-red-300">
                    PHASE {bossState.phase} • {Math.ceil(bossState.hp)} / {bossState.maxHp}
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-red-500/40">
                  <div
                    className="h-full bg-gradient-to-r from-red-700 via-rose-500 to-amber-400 transition-all duration-150"
                    style={{ width: `${Math.max(0, (bossState.hp / bossState.maxHp) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-300 mt-1.5 font-mono">
                  Counterplay: {bossState.config.counterplayTip}
                </p>
              </div>
            )}

            {/* Real-time Stand Telegraph / Warning Banner */}
            {bossState?.warningBanner && (
              <div className="flex items-center gap-2 bg-red-950/95 border border-amber-400 px-4 py-2 rounded text-xs font-mono text-amber-200 animate-bounce shadow-lg">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{bossState.warningBanner}</span>
              </div>
            )}
          </div>

          {/* Right: Active Quest Tracker & Menu Buttons */}
          <div className="flex flex-col items-end gap-2 pointer-events-auto">
            <div className="flex items-center gap-1.5 bg-slate-950/85 border border-amber-500/35 p-1.5 rounded-lg">
              {mode === 'campaign' && (
                <>
                  <button
                    onClick={onOpenMap}
                    title="Frontier Map & Fast Travel (M)"
                    className="px-2.5 py-1.5 rounded hover:bg-slate-800 text-xs font-mono text-amber-200 flex items-center gap-1"
                  >
                    <Map className="w-3.5 h-3.5 text-amber-400" /> Map [M]
                  </button>
                  <button
                    onClick={onOpenUpgrades}
                    title="Stand Upgrades (U)"
                    className="px-2.5 py-1.5 rounded hover:bg-slate-800 text-xs font-mono text-amber-200 flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Upgrades [U]
                    {playerStats.skillPoints > 0 && (
                      <span className="bg-amber-500 text-slate-950 px-1.5 rounded-full text-[10px] font-bold">
                        {playerStats.skillPoints}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={onOpenJournal}
                    title="Quest Journal & Clues (J)"
                    className="px-2.5 py-1.5 rounded hover:bg-slate-800 text-xs font-mono text-amber-200 flex items-center gap-1"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-amber-400" /> Journal
                  </button>
                </>
              )}
              <button
                onClick={onOpenInspector}
                title="28 GLB Asset Inspector"
                className="px-2.5 py-1.5 rounded hover:bg-slate-800 text-xs font-mono text-amber-200 flex items-center gap-1"
              >
                <Layers className="w-3.5 h-3.5 text-sky-400" /> 28 GLBs
              </button>
              <button
                onClick={onOpenPause}
                title="Pause / Save Menu (ESC)"
                className="px-2.5 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-mono text-amber-200 flex items-center gap-1"
              >
                <Pause className="w-3.5 h-3.5" /> Menu
              </button>
            </div>

            {mode === 'campaign' && activeQuest && (
              <div className="w-80 bg-slate-950/85 border border-amber-500/30 rounded-lg p-3 backdrop-blur-md">
                <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
                  Active Story Directive
                </div>
                <div className="font-western font-bold text-xs text-amber-100 mt-0.5">
                  {activeQuest.title}
                </div>
                <p className="text-xs text-slate-300 mt-1">{activeQuest.currentObjectiveText}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM BAR: Context Prompt & Action Hotbar */}
      <div className="flex flex-col items-center gap-3">
        {contextPrompt && (
          <button
            onClick={onTriggerContextAction}
            className="pointer-events-auto bg-amber-500 hover:bg-amber-400 text-slate-950 font-western font-bold text-sm px-6 py-2.5 rounded-full shadow-[0_0_25px_rgba(234,179,8,0.65)] transition transform hover:scale-105"
          >
            [G] {contextPrompt}
          </button>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 bg-slate-950/85 border border-amber-500/30 px-4 py-2 rounded-lg text-[11px] font-mono text-slate-300">
          <button
            onClick={onToggleStand}
            className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-purple-500/40 text-purple-200"
          >
            [Q] Toggle Stand
          </button>
          <span className="px-2 py-1 rounded bg-slate-900/90 border border-slate-800">
            [LMB / J] Light Strike
          </span>
          <span className="px-2 py-1 rounded bg-slate-900/90 border border-slate-800">
            [RMB / K] {isHeavenDio ? 'Reality Overwrite' : 'Heavy Smash'}
          </span>
          <span className="px-2 py-1 rounded bg-slate-900/90 border border-slate-800">
            [R / L] Muda Muda Rush
          </span>
          <span className="px-2 py-1 rounded bg-slate-900/90 border border-slate-800">
            [SPACE] Dodge
          </span>
          <span className="px-2 py-1 rounded bg-slate-900/90 border border-slate-800">
            [SHIFT] Guard
          </span>
          <button
            onClick={onToggleMount}
            className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-200"
          >
            [E] Mount / Dismount Slow Dancer
          </button>
        </div>
      </div>
    </div>
  );
}