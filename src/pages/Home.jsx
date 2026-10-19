import React, { useState } from 'react';
import { Shield, Sword, Compass, Sparkles, Volume2, Settings, Play, RotateCcw, Award } from 'lucide-react';

const INITIAL_REGIONS = [
  { id: 'ebon_crossing', name: 'I. Ebon Crossing', boss: "Muhammad Avdol (Magician's Red)", quest: "Enya's Burned Arrow Markings" },
  { id: 'ember_flats', name: 'II. Ember Flats', boss: 'Noriaki Kakyoin (Hierophant Green)', quest: "Hol Horse's Canyon Trail" },
  { id: 'redstone_pass', name: 'III. Redstone Pass', boss: 'Jean Pierre Polnareff (Silver Chariot)', quest: "Mariah's Bastet Railway" },
  { id: 'hollow_pines', name: 'IV. Hollow Pines', boss: 'Josuke Higashikata (Crazy Diamond)', quest: 'Reconstructing the Shattered Timber' },
  { id: 'iron_vale', name: 'V. Iron Vale', boss: 'Yoshikage Kira (Killer Queen)', quest: "N'Doul's Geb Acoustic Basin" },
  { id: 'gravewater_marsh', name: 'VI. Gravewater Marsh', boss: 'Diavolo (King Crimson)', quest: "Daniel J. D'Arby's Soul Wager" },
  { id: 'bleakwater_ridge', name: 'VII. Bleakwater Ridge', boss: 'Giorno Giovanna (Gold Experience)', quest: "Telence T. D'Arby's True Read" },
  { id: 'rift_expanse', name: 'VIII. The Rift Expanse', boss: 'Funny Valentine (D4C) & Enrico Pucci (C-Moon)', quest: "Vanilla Ice's Void & Sanctuary Seals" },
  { id: 'heavens_reach', name: "IX. Heaven's Reach", boss: 'Jotaro Kujo (Star Platinum) & Final Rematch', quest: 'The Second Arrow & Heaven Ascension' },
];

export default function Home() {
  const [selectedTab, setSelectedTab] = useState('campaign');

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050811] text-[#f3ead8] flex flex-col justify-between p-8">
      {/* Stormy Night Atmosphere Backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 75% 18%, rgba(148, 178, 255, 0.18) 0%, rgba(18, 29, 58, 0.35) 28%, rgba(5, 8, 17, 0.96) 75%)',
        }}
      />

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between border-b border-amber-500/25 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-amber-400/80 font-mono">
            Alternate Frontier • 1889 • Eternal Storm Night
          </p>
          <h1 className="text-3xl md:text-5xl font-western font-black tracking-wider text-amber-100 drop-shadow-[0_2px_12px_rgba(234,179,8,0.35)]">
            JOJO&apos;S BIZARRE ADVENTURE: <span className="text-amber-400">PATH TO HEAVEN</span>
          </h1>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-amber-200/80 bg-slate-950/80 border border-amber-500/30 px-4 py-2 rounded">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>28 SUPPLIED GLB ASSETS • ZERO GENERATED HUMANS</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 my-auto py-6">
        <div className="lg:col-span-5 flex flex-col justify-center space-y-5">
          <div className="bg-slate-950/80 border border-amber-500/30 p-6 rounded-lg space-y-4 jojo-gold-glow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-amber-400">
                Main Menu • Initializing 3D Engine
              </span>
              <span className="text-xs font-mono text-indigo-300">WebGL Three.js</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed font-lore text-lg">
              Across a haunted, storm-drenched American frontier, eras collide. Ride Slow Dancer from Ebon Crossing to the gothic spire of Heaven&apos;s Reach, command The World, conquer ten legendary Stand users, and claim the Second Arrow.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setSelectedTab('campaign')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded font-western text-sm tracking-wider border transition ${
                  selectedTab === 'campaign'
                    ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                    : 'bg-slate-900/90 text-amber-200 border-amber-500/30 hover:border-amber-400'
                }`}
              >
                <Play className="w-4 h-4" /> Story Campaign
              </button>
              <button
                onClick={() => setSelectedTab('versus')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded font-western text-sm tracking-wider border transition ${
                  selectedTab === 'versus'
                    ? 'bg-amber-500 text-slate-950 border-amber-300 font-bold'
                    : 'bg-slate-900/90 text-amber-200 border-amber-500/30 hover:border-amber-400'
                }`}
              >
                <Sword className="w-4 h-4" /> 1v1 Versus Mode
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-slate-950/75 border border-amber-500/20 p-3 rounded">
              <Compass className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <div className="text-lg font-western font-bold text-amber-100">9 Regions</div>
              <div className="text-[11px] text-slate-400">Linear Frontier</div>
            </div>
            <div className="bg-slate-950/75 border border-amber-500/20 p-3 rounded">
              <Shield className="w-5 h-5 text-purple-400 mx-auto mb-1" />
              <div className="text-lg font-western font-bold text-amber-100">10 Bosses</div>
              <div className="text-[11px] text-slate-400">+ Jotaro Rematch</div>
            </div>
            <div className="bg-slate-950/75 border border-amber-500/20 p-3 rounded">
              <Award className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
              <div className="text-lg font-western font-bold text-amber-100">9 Quests</div>
              <div className="text-[11px] text-slate-400">Stand Investigations</div>
            </div>
          </div>
        </div>

        {/* Frontier Atlas Preview */}
        <div className="lg:col-span-7 bg-slate-950/80 border border-amber-500/30 rounded-lg p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-3 mb-4">
            <h2 className="font-western text-lg text-amber-300 tracking-wider">
              {selectedTab === 'campaign' ? 'THE FRONTIER CORRIDOR (EBON CROSSING → HEAVEN’S REACH)' : 'STANDALONE CPU VERSUS ROSTER & ARENAS'}
            </h2>
            <span className="text-xs font-mono text-amber-400/80">PERMANENT NIGHT</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[340px] overflow-y-auto pr-1">
            {INITIAL_REGIONS.map((r, idx) => (
              <div
                key={r.id}
                className="p-3 rounded bg-slate-900/80 border border-amber-500/20 hover:border-amber-400/50 transition flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs font-mono text-amber-400">Chapter 0{idx + 1}</div>
                  <div className="font-western font-bold text-sm text-amber-100 mt-0.5">{r.name}</div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800 text-[11px] space-y-1">
                  <div className="text-purple-300 font-medium">Boss: {r.boss}</div>
                  <div className="text-slate-400">Quest: {r.quest}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer Controls */}
      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-t border-amber-500/20 pt-4 text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-6">
          <span>WASD: Move / Steer Slow Dancer</span>
          <span>E: Summon Stand / Mount</span>
          <span>LMB / RMB / R: Light / Heavy / Muda Barrage</span>
          <span>F: The World — Stop Time</span>
          <span>SPACE / SHIFT: Dodge / Guard</span>
        </div>
        <div className="flex items-center gap-3 text-amber-300">
          <Volume2 className="w-4 h-4" />
          <span>Storm & Stand Audio Synthesizer Active</span>
        </div>
      </footer>
    </div>
  );
}