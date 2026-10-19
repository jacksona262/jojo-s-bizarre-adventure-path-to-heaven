import React, { useState } from 'react';
import { Sparkles, FastForward, CheckCircle2, HelpCircle, Zap, Award } from 'lucide-react';

export default function CinematicAndQuestModal({
  activeCutscene, // { type: 'opening'|'boss_intro'|'boss_victory'|'ascension'|'ending', title, subtitle, lines, lineIndex }
  onAdvanceCutscene,
  onSkipCutscene,
  activeQuestModal, // { quest, step, onCompleteNode }
  onCloseQuestModal,
  subtitlesEnabled = true,
}) {
  const [selectedChoice, setSelectedChoice] = useState(0);

  if (activeCutscene) {
    const currentLine = activeCutscene.lines?.[activeCutscene.lineIndex] || {
      speaker: 'Narrator',
      text: '',
    };

    return (
      <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between">
        {/* Letterbox Top Bar */}
        <div className="h-20 bg-black/90 border-b border-amber-500/30 px-8 flex items-center justify-between pointer-events-auto">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.3em] text-amber-400">
              In-Engine Cinematic Sequence • Permanent Night
            </div>
            <h2 className="font-western font-bold text-xl text-amber-100 tracking-wider">
              {activeCutscene.title}
            </h2>
          </div>
          <button
            onClick={onSkipCutscene}
            className="flex items-center gap-2 px-4 py-2 rounded bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-xs font-mono text-amber-200 transition"
          >
            <FastForward className="w-3.5 h-3.5" /> Skip Scene
          </button>
        </div>

        {/* Center Title Card for Boss Intros or Heaven Ascension */}
        {activeCutscene.banner && (
          <div className="my-auto mx-auto text-center px-6 py-4 bg-slate-950/80 border-y-2 border-amber-400/60 backdrop-blur-md">
            <div className="text-xs font-mono uppercase tracking-[0.4em] text-purple-300">
              {activeCutscene.banner.subtitle}
            </div>
            <div className="text-3xl md:text-5xl font-western font-black text-amber-200 tracking-wider mt-1">
              {activeCutscene.banner.title}
            </div>
          </div>
        )}

        {/* Letterbox Bottom Subtitle & Dialogue Bar */}
        <div className="min-h-[140px] bg-black/92 border-t border-amber-500/30 px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-6 pointer-events-auto">
          {subtitlesEnabled ? (
            <div className="max-w-3xl space-y-1.5">
              <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
                {currentLine.speaker}
              </div>
              <p className="font-lore text-xl md:text-2xl text-amber-50 leading-relaxed">
                &ldquo;{currentLine.text}&rdquo;
              </p>
            </div>
          ) : (
            <div className="text-xs font-mono text-slate-500">Subtitles Disabled in Settings</div>
          )}

          <button
            onClick={onAdvanceCutscene}
            className="shrink-0 px-6 py-3 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-western font-bold text-sm tracking-wider transition"
          >
            {activeCutscene.lineIndex + 1 < (activeCutscene.lines?.length || 0)
              ? 'NEXT →'
              : activeCutscene.finishLabel || 'BEGIN ENCOUNTER →'}
          </button>
        </div>
      </div>
    );
  }

  if (activeQuestModal) {
    const { quest, node, onSolve } = activeQuestModal;
    return (
      <div className="absolute inset-0 z-30 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-slate-950 border-2 border-amber-500/50 rounded-xl p-6 space-y-5 shadow-2xl">
          <div className="flex items-center justify-between border-b border-amber-500/25 pb-3">
            <div>
              <span className="text-xs font-mono uppercase tracking-widest text-amber-400">
                {quest.title} • {quest.npcName}
              </span>
              <h3 className="text-xl font-western font-bold text-amber-100 mt-0.5">
                {node ? node.label : quest.npcName}
              </h3>
            </div>
            <Sparkles className="w-6 h-6 text-amber-400" />
          </div>

          <p className="font-lore text-lg text-slate-200 leading-relaxed">
            {quest.type === 'darby_bluff_game'
              ? "Daniel J. D'Arby slides the marked soul-chip across the lantern-lit marsh table. Osiris hovers behind him, waiting for your nerve to waver. Choose how DIO counters his sleight-of-hand:"
              : quest.type === 'atum_perception_trial'
              ? "Telence T. D'Arby’s Atum locks onto DIO’s soul wavelength, projecting a binary YES / NO telegraph before his strike. Read the true opening:"
              : quest.type === 'cream_void_labyrinth'
              ? 'Vanilla Ice’s Cream carves a dark dimension sphere around the ancient Rift Anchor. Command The World to freeze the void’s rotation and lock the dimensional seal:'
              : quest.summary}
          </p>

          {/* Interactive Stand Deduction / Action Choices */}
          <div className="space-y-2.5">
            {[
              `Invoke The World’s precision to lock "${node ? node.label : quest.title}" and extract the Arrow resonance`,
              `Stop time for a split instant to expose ${quest.npcName}'s Stand mechanism directly`,
              'Demand the full truth of why the 1889 frontier drew your bloodline here',
            ].map((choiceText, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedChoice(idx)}
                className={`w-full text-left px-4 py-3 rounded border text-sm transition flex items-center justify-between ${
                  selectedChoice === idx
                    ? 'bg-amber-500/20 border-amber-400 text-amber-100'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-amber-500/40'
                }`}
              >
                <span>{choiceText}</span>
                {selectedChoice === idx && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />}
              </button>
            ))}
          </div>

          <div className="bg-slate-900/90 border border-purple-500/30 rounded p-3 text-xs text-purple-200 font-mono">
            {quest.clueText}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={onCloseQuestModal}
              className="px-4 py-2 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono"
            >
              Step Back
            </button>
            <button
              onClick={() => onSolve(selectedChoice)}
              className="flex items-center gap-2 px-6 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-western font-bold text-sm tracking-wider"
            >
              <Zap className="w-4 h-4" /> COMPLETE OBJECTIVE STEP
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}