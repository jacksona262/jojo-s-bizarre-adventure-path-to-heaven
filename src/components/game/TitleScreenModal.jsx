import React from 'react';
import { Play, Sword, RotateCcw, Settings, Sparkles, BookOpen, Award, Layers } from 'lucide-react';

export default function TitleScreenModal({
  hasSavedGame,
  onContinueCampaign,
  onStartNewCampaign,
  onOpenVersus,
  onOpenChapterSelect,
  onOpenAssetInspector,
  onOpenSettings,
  onOpenCredits,
  loadedAssetCount,
  totalAssetCount,
}) {
  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-6 md:p-10 bg-gradient-to-r from-[#050811]/90 via-[#050811]/45 to-transparent">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 pointer-events-auto">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.3em] text-amber-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Alternate Frontier 1889 • Permanent Night</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-western font-black tracking-wider text-amber-100 mt-1 drop-shadow-[0_4px_20px_rgba(234,179,8,0.45)]">
            JOJO&apos;S BIZARRE ADVENTURE
          </h1>
          <div className="text-xl md:text-2xl font-western font-bold tracking-[0.22em] text-amber-400">
            PATH TO HEAVEN
          </div>
        </div>

        <button
          onClick={onOpenAssetInspector}
          className="flex items-center gap-2.5 bg-slate-950/85 hover:bg-slate-900 border border-amber-500/40 px-4 py-2 rounded text-xs font-mono text-amber-200 transition"
        >
          <Layers className="w-4 h-4 text-amber-400" />
          <span>
            GLB ASSET MANIFEST: {loadedAssetCount}/{totalAssetCount} VERIFIED
          </span>
        </button>
      </div>

      {/* Left Menu Column (Right side stays clear to showcase the 3D Cinematic DIO Model & Moon) */}
      <div className="max-w-md w-full space-y-3 my-auto pointer-events-auto">
        <div className="bg-slate-950/80 border border-amber-500/30 rounded-lg p-5 space-y-2.5 backdrop-blur-md jojo-gold-glow">
          {hasSavedGame && (
            <button
              onClick={onContinueCampaign}
              className="w-full flex items-center justify-between px-5 py-3.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-western font-bold tracking-wider transition shadow-lg"
            >
              <span className="flex items-center gap-2.5">
                <Play className="w-4 h-4 fill-current" /> CONTINUE CAMPAIGN
              </span>
              <span className="text-[11px] font-mono uppercase">Checkpoint</span>
            </button>
          )}

          <button
            onClick={onStartNewCampaign}
            className={`w-full flex items-center justify-between px-5 py-3.5 rounded font-western font-bold tracking-wider transition border ${
              hasSavedGame
                ? 'bg-slate-900/90 hover:bg-slate-800 text-amber-100 border-amber-500/40'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 shadow-lg'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <RotateCcw className="w-4 h-4" /> NEW GAME (OPENING CINEMATIC)
            </span>
            <span className="text-[11px] font-mono uppercase">9 Chapters</span>
          </button>

          <button
            onClick={onOpenVersus}
            className="w-full flex items-center justify-between px-5 py-3 rounded bg-slate-900/90 hover:bg-purple-950/80 text-amber-100 border border-purple-500/40 hover:border-purple-400 font-western font-semibold tracking-wider transition"
          >
            <span className="flex items-center gap-2.5">
              <Sword className="w-4 h-4 text-purple-400" /> 1V1 CPU VERSUS MODE
            </span>
            <span className="text-[11px] font-mono text-purple-300">16 Fighters</span>
          </button>

          <button
            onClick={onOpenChapterSelect}
            className="w-full flex items-center justify-between px-5 py-2.5 rounded bg-slate-900/80 hover:bg-slate-800 text-amber-200/90 border border-amber-500/25 font-western text-sm tracking-wider transition"
          >
            <span className="flex items-center gap-2.5">
              <BookOpen className="w-4 h-4 text-amber-400" /> CHAPTER, QUEST &amp; BOSS SELECT
            </span>
            <span className="text-[11px] font-mono text-slate-400">Jump To Encounter</span>
          </button>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={onOpenSettings}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-western tracking-wider transition"
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" /> SETTINGS
            </button>
            <button
              onClick={onOpenCredits}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-western tracking-wider transition"
            >
              <Award className="w-3.5 h-3.5 text-amber-400" /> CREDITS
            </button>
          </div>
        </div>

        <div className="bg-slate-950/75 border border-amber-500/20 rounded p-3.5 text-xs text-slate-300 space-y-1">
          <div className="text-amber-400 font-mono uppercase tracking-wider text-[11px]">
            Dedicated Showcase Model Active
          </div>
          <p className="font-lore text-sm text-slate-300">
            Rendering <code className="text-amber-300 text-xs">loading screen  and home screen animated model.glb</code> in real-time WebGL beneath the eternal frontier storm.
          </p>
        </div>
      </div>

      {/* Bottom Controls Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-amber-500/25 pt-3 text-xs font-mono text-slate-300 pointer-events-auto bg-slate-950/60 px-4 py-2 rounded">
        <span>WASD: Move / Ride Slow Dancer</span>
        <span>H: Whistle / Summon Horse</span>
        <span>E: Mount / Stand Toggle</span>
        <span>J / K / L (or Mouse): Light / Heavy / Muda Rush</span>
        <span>F: The World — Stop Time</span>
      </div>
    </div>
  );
}