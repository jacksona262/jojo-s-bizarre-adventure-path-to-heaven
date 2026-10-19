import React, { useState, useRef, useCallback, useEffect } from 'react';
import JoJoWorldViewport from '@/components/game/JoJoWorldViewport';
import TitleScreenModal from '@/components/game/TitleScreenModal';
import HudOverlay from '@/components/game/HudOverlay';
import CinematicAndQuestModal from '@/components/game/CinematicAndQuestModal';
import MenusAndModals from '@/components/game/MenusAndModals';
import {
  FRONTIER_REGIONS,
  MAIN_BOSSES,
  MANDATORY_QUESTS,
} from '@/game/data/campaignData';
import { ASSET_MANIFEST } from '@/game/assets/assetManifest';
import {
  DEFAULT_CAMPAIGN_STATE,
  loadSettings,
  saveSettings,
  getSaveSlots,
  saveToSlot,
  saveAutoCheckpoint,
  loadAutoCheckpoint,
  hasAnySavedGame,
} from '@/game/state/saveManager';
import { soundEngine } from '@/game/audio/soundEngine';

const OPENING_CINEMATIC_LINES = [
  {
    speaker: 'Prologue — 1889 American Frontier',
    text: 'An endless midnight storm hangs over Ebon Crossing. No townsfolk walk these muddy streets—only Stand users drawn from across colliding eras.',
  },
  {
    speaker: 'DIO',
    text: 'So this is the frontier Enrico Pucci and Enya spoke of. Far to the north, atop the peak of Heaven’s Reach, a Second Stand Arrow calls to The World.',
  },
  {
    speaker: 'Robert E. O. Speedwagon',
    text: 'Careful, DIO! Ten legendary Stand users stand along the single trail north. Each holds a harmonic seal keeping the Sanctuary locked.',
  },
  {
    speaker: 'DIO',
    text: 'Let them come—Avdol, Kakyoin, Polnareff, Josuke, Kira, Diavolo, Giorno, Valentine, Pucci, and Jotaro! Ride forth, Slow Dancer—the Path to Heaven begins!',
  },
];

const HEAVEN_ASCENSION_LINES = [
  {
    speaker: 'DIO',
    text: 'Ten Stand wavelengths have converged across the frontier! The Second Stand Arrow answers my call!',
  },
  {
    speaker: 'The World Over Heaven',
    text: 'Lightning fractures the eternal night sky! Gold and alabaster divinity envelops DIO as reality itself bends to his fists!',
  },
  {
    speaker: 'DIO (Heaven Ascension)',
    text: 'I have attained HEAVEN! Behold THE WORLD OVER HEAVEN—and face me one final time, Jotaro Kujo!',
  },
];

const ENDING_CINEMATIC_LINES = [
  {
    speaker: 'DIO (Heaven Ascension)',
    text: 'Even Star Platinum’s final awakening could not withstand the power to overwrite reality itself.',
  },
  {
    speaker: 'Epilogue — Sovereign of the Eternal Frontier',
    text: 'From the shattered spire of Heaven’s Reach, the storm obeys its new sovereign. Every clue, every era, and every battle along the Path to Heaven is complete.',
  },
];

export default function Home() {
  const actionBusRef = useRef(null);
  const [appPhase, setAppPhase] = useState('title'); // 'title' | 'campaign' | 'versus'
  const [campaignState, setCampaignState] = useState(() => {
    return loadAutoCheckpoint() || { ...DEFAULT_CAMPAIGN_STATE };
  });
  const [settings, setSettings] = useState(() => loadSettings());
  const [saveSlots, setSaveSlots] = useState(() => getSaveSlots());
  const [activeModal, setActiveModal] = useState(null);
  const [activeCutscene, setActiveCutscene] = useState(null);
  const [activeQuestModal, setActiveQuestModal] = useState(null);
  const [versusConfig, setVersusConfig] = useState(null);
  const [toastBanner, setToastBanner] = useState(null);

  // Asset verification counter
  const [assetStatuses, setAssetStatuses] = useState([]);
  const [loadedAssetCount, setLoadedAssetCount] = useState(0);

  // Throttled live HUD snapshot from 3D engine
  const [hudSnapshot, setHudSnapshot] = useState({
    hp: 1000,
    maxHp: 1000,
    standEnergy: 100,
    maxStandEnergy: 100,
    standSummoned: true,
    timeStopActive: false,
    timeStopCooldown: 0,
    isMounted: false,
    horseStamina: 100,
    lockOnActive: false,
    currentRegion: FRONTIER_REGIONS[0],
    bossState: null,
    contextPrompt: null,
  });

  const showNotice = useCallback((msg) => {
    setToastBanner(msg);
    setTimeout(() => setToastBanner(null), 3600);
  }, []);

  useEffect(() => {
    soundEngine.updateSettings(settings);
  }, [settings]);

  const handleUpdateSettings = (partial) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveSettings(next);
  };

  // Start New Game with Opening Frontier Cutscene
  const handleStartNewCampaign = () => {
    soundEngine.init();
    const fresh = { ...DEFAULT_CAMPAIGN_STATE, timestamp: Date.now() };
    setCampaignState(fresh);
    saveAutoCheckpoint(fresh, 'Chapter 1 — Ebon Crossing');
    setAppPhase('campaign');
    actionBusRef.current?.teleportTo(0, -40, Math.PI);
    setActiveCutscene({
      type: 'opening',
      title: 'PROLOGUE: THE STORM OVER EBON CROSSING',
      banner: {
        subtitle: 'ALTERNATE FRONTIER • 1889',
        title: 'PATH TO HEAVEN',
      },
      lines: OPENING_CINEMATIC_LINES,
      lineIndex: 0,
      focusPos: { x: 0, z: -40 },
      finishLabel: 'RIDE INTO EBON CROSSING →',
    });
  };

  // Continue from Checkpoint
  const handleContinueCampaign = () => {
    soundEngine.init();
    const saved = loadAutoCheckpoint() || getSaveSlots().find(Boolean) || DEFAULT_CAMPAIGN_STATE;
    setCampaignState(saved);
    setAppPhase('campaign');
    if (saved.playerPosition) {
      actionBusRef.current?.teleportTo(
        saved.playerPosition.x,
        saved.playerPosition.z,
        saved.playerRotationY ?? Math.PI
      );
    }
    showNotice(`Loaded Checkpoint: ${saved.label}`);
  };

  // Trigger Boss Intro Cutscene
  const handleTriggerBossIntro = useCallback((bossCfg) => {
    setActiveCutscene({
      type: 'boss_intro',
      bossIndex: bossCfg.index,
      title: `BOSS ENCOUNTER ${bossCfg.index + 1}: ${bossCfg.name.toUpperCase()}`,
      banner: {
        subtitle: `STAND: ${bossCfg.standName.toUpperCase()}`,
        title: `${bossCfg.name} — ${bossCfg.title}`,
      },
      lines: bossCfg.introDialogue,
      lineIndex: 0,
      focusPos: bossCfg.position,
      finishLabel: 'COMMENCE STAND BATTLE →',
    });
  }, []);

  // Trigger Boss Victory & Progression (Quests, Heaven Ascension, Final Jotaro Rematch, Ending)
  const handleTriggerBossVictory = useCallback(
    (defeatedBossIndex) => {
      const bossCfg = MAIN_BOSSES[defeatedBossIndex];
      if (!bossCfg) return;

      setCampaignState((prev) => {
        const defeatedSet = Array.from(new Set([...prev.bossesDefeated, defeatedBossIndex]));
        const nextSkillPoints = (prev.stats.skillPoints || 0) + 2;
        const nextState = {
          ...prev,
          bossesDefeated: defeatedSet,
          currentBossIndex: Math.min(10, defeatedBossIndex + 1),
          currentQuestIndex: Math.min(8, defeatedBossIndex),
          isHeavenDio: defeatedBossIndex >= 9 ? true : prev.isHeavenDio,
          label: `Defeated ${bossCfg.name}`,
          stats: {
            ...prev.stats,
            skillPoints: nextSkillPoints,
            hp: prev.stats.maxHp,
          },
        };
        saveAutoCheckpoint(nextState, `Checkpoint — Defeated ${bossCfg.name}`);
        return nextState;
      });

      setActiveCutscene({
        type: 'boss_victory',
        bossIndex: defeatedBossIndex,
        title: `VICTORY OVER ${bossCfg.name.toUpperCase()}`,
        banner: {
          subtitle: 'STAND TRIAL CONQUERED (+2 MASTERY POINTS)',
          title: `${bossCfg.name} Defeated`,
        },
        lines: bossCfg.victoryDialogue,
        lineIndex: 0,
        focusPos: bossCfg.position,
        finishLabel:
          defeatedBossIndex === 9
            ? 'CLAIM THE SECOND ARROW (HEAVEN ASCENSION) →'
            : defeatedBossIndex === 10
            ? 'WITNESS FINAL ENDING →'
            : 'CONTINUE FRONTIER JOURNEY →',
      });
    },
    []
  );

  // Advance or finish active cutscene
  const handleAdvanceCutscene = () => {
    if (!activeCutscene) return;
    if (activeCutscene.lineIndex + 1 < (activeCutscene.lines?.length || 0)) {
      setActiveCutscene({
        ...activeCutscene,
        lineIndex: activeCutscene.lineIndex + 1,
      });
      return;
    }

    // Cutscene finished — check transition chains
    if (activeCutscene.type === 'boss_victory' && activeCutscene.bossIndex === 9) {
      // Trigger Heaven Ascension Transformation Cinematic immediately after Boss 10 (Jotaro)!
      soundEngine.playStandSummon(true);
      setActiveCutscene({
        type: 'ascension',
        title: 'CLIMAX: THE WORLD OVER HEAVEN',
        banner: {
          subtitle: 'SECOND STAND ARROW ABSORBED',
          title: 'HEAVEN ASCENSION DIO AWAKENS',
        },
        lines: HEAVEN_ASCENSION_LINES,
        lineIndex: 0,
        focusPos: { x: 0, z: -4585 },
        finishLabel: 'BEGIN FINAL JOTARO REMATCH →',
      });
      return;
    }

    if (activeCutscene.type === 'ascension') {
      setActiveCutscene(null);
      actionBusRef.current?.startBossEncounter(10, 'normal');
      showNotice('HEAVEN ASCENSION DIO UNLOCKED — FINAL JOTARO REMATCH!');
      return;
    }

    if (activeCutscene.type === 'boss_victory' && activeCutscene.bossIndex === 10) {
      // Trigger Final Ending Cinematic -> Credits (No free roam after ending!)
      setActiveCutscene({
        type: 'ending',
        title: 'FINALE: SOVEREIGN OF HEAVEN’S REACH',
        banner: {
          subtitle: 'CAMPAIGN COMPLETE',
          title: 'REALITY OVERWRITTEN',
        },
        lines: ENDING_CINEMATIC_LINES,
        lineIndex: 0,
        focusPos: { x: 0, z: -4620 },
        finishLabel: 'ROLL CREDITS →',
      });
      return;
    }

    if (activeCutscene.type === 'ending') {
      setActiveCutscene(null);
      setAppPhase('title');
      setActiveModal('credits');
      return;
    }

    setActiveCutscene(null);
  };

  // Quest Node / NPC Interaction Completion
  const handleOpenQuestModal = useCallback((quest, node) => {
    setActiveQuestModal({
      quest,
      node,
      onSolve: () => {
        if (node) {
          actionBusRef.current?.completeQuestStepNode(node.id);
        }
        setCampaignState((prev) => {
          const nextStep = (prev.questStep || 0) + 1;
          const completedQuest = nextStep >= 3;
          const updatedQuests = completedQuest
            ? Array.from(new Set([...prev.questsCompleted, quest.index]))
            : prev.questsCompleted;
          const nextBossIdx = completedQuest
            ? Math.max(prev.currentBossIndex, quest.unlocksBoss)
            : prev.currentBossIndex;

          const nextState = {
            ...prev,
            questStep: completedQuest ? 0 : nextStep,
            questsCompleted: updatedQuests,
            currentBossIndex: nextBossIdx,
            cluesCollected: completedQuest
              ? Array.from(new Set([...prev.cluesCollected, quest.clueText]))
              : prev.cluesCollected,
            stats: {
              ...prev.stats,
              skillPoints: completedQuest ? prev.stats.skillPoints + 1 : prev.stats.skillPoints,
            },
          };
          saveAutoCheckpoint(
            nextState,
            completedQuest ? `Completed ${quest.title}` : `${quest.title} (${nextStep}/3)`
          );
          if (completedQuest) {
            const unlockedBoss = MAIN_BOSSES[quest.unlocksBoss];
            showNotice(
              `${quest.title} Complete! Unlocked Boss: ${unlockedBoss?.name} (${unlockedBoss?.standName})`
            );
          } else {
            showNotice(`Quest Progress (${nextStep}/3): ${quest.title}`);
          }
          return nextState;
        });
        setActiveQuestModal(null);
      },
    });
  }, [showNotice]);

  // Active Quest Directive helper for HUD
  const currentQuestObj = MANDATORY_QUESTS[campaignState.currentQuestIndex];
  const activeQuestHud = currentQuestObj
    ? {
        ...currentQuestObj,
        currentObjectiveText:
          campaignState.questsCompleted.includes(currentQuestObj.index)
            ? `Proceed north to challenge ${MAIN_BOSSES[currentQuestObj.unlocksBoss]?.name}`
            : currentQuestObj.objectives[Math.min(2, campaignState.questStep || 0)],
      }
    : null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#050811] select-none">
      {/* 3D WebGL Game Viewport */}
      <JoJoWorldViewport
        appPhase={appPhase}
        campaignState={campaignState}
        settings={settings}
        activeCutscene={activeCutscene}
        versusConfig={versusConfig}
        actionBusRef={actionBusRef}
        onSyncHud={setHudSnapshot}
        onAssetProgress={(done) => setLoadedAssetCount(done)}
        onAssetStatusUpdate={setAssetStatuses}
        onTriggerBossIntro={handleTriggerBossIntro}
        onTriggerBossVictory={handleTriggerBossVictory}
        onOpenQuestModal={handleOpenQuestModal}
        onPlayerDefeated={() => showNotice('Defeated! Restarting from Boss Phase Checkpoint...')}
        onVersusRoundEnd={(winner) => {
          showNotice(
            winner === 'player'
              ? 'VERSUS VICTORY! Your Stand reigns supreme!'
              : 'VERSUS DEFEAT! Try another round or adjust strategy.'
          );
          setActiveModal('versus_setup');
        }}
      />

      {/* Notification Banner */}
      {toastBanner && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-950/95 border-2 border-amber-400 px-6 py-2.5 rounded-full text-xs font-mono text-amber-200 shadow-2xl">
          {toastBanner}
        </div>
      )}

      {/* Title Screen Overlay */}
      {appPhase === 'title' && (
        <TitleScreenModal
          hasSavedGame={hasAnySavedGame()}
          onContinueCampaign={handleContinueCampaign}
          onStartNewCampaign={handleStartNewCampaign}
          onOpenVersus={() => setActiveModal('versus_setup')}
          onOpenChapterSelect={() => setActiveModal('chapter_select')}
          onOpenAssetInspector={() => setActiveModal('inspector')}
          onOpenSettings={() => setActiveModal('settings')}
          onOpenCredits={() => setActiveModal('credits')}
          loadedAssetCount={loadedAssetCount}
          totalAssetCount={ASSET_MANIFEST.length}
        />
      )}

      {/* Gameplay HUD Overlay */}
      {appPhase !== 'title' && !activeCutscene && (
        <HudOverlay
          mode={appPhase}
          playerStats={{
            ...campaignState.stats,
            hp: hudSnapshot.hp,
            maxHp: hudSnapshot.maxHp,
            standEnergy: hudSnapshot.standEnergy,
            maxStandEnergy: hudSnapshot.maxStandEnergy,
          }}
          isHeavenDio={campaignState.isHeavenDio}
          standSummoned={hudSnapshot.standSummoned}
          timeStopActive={hudSnapshot.timeStopActive}
          timeStopCooldown={hudSnapshot.timeStopCooldown}
          isMounted={hudSnapshot.isMounted}
          horseStamina={hudSnapshot.horseStamina}
          lockOnActive={hudSnapshot.lockOnActive}
          currentRegion={hudSnapshot.currentRegion}
          activeQuest={activeQuestHud}
          bossState={hudSnapshot.bossState}
          contextPrompt={hudSnapshot.contextPrompt}
          versusState={versusConfig}
          onTriggerContextAction={() => actionBusRef.current?.triggerContextAction()}
          onToggleStand={() => actionBusRef.current?.toggleStand()}
          onTriggerTimeStop={() => actionBusRef.current?.triggerTimeStop()}
          onSummonHorse={() => actionBusRef.current?.summonSlowDancer()}
          onToggleMount={() => actionBusRef.current?.toggleMountHorse()}
          onOpenMap={() => setActiveModal('map')}
          onOpenUpgrades={() => setActiveModal('upgrades')}
          onOpenJournal={() => setActiveModal('journal')}
          onOpenInspector={() => setActiveModal('inspector')}
          onOpenPause={() => setActiveModal('pause')}
        />
      )}

      {/* In-Engine Cinematics & Interactive Quest Puzzle Modals */}
      <CinematicAndQuestModal
        activeCutscene={activeCutscene}
        onAdvanceCutscene={handleAdvanceCutscene}
        onSkipCutscene={() => {
          if (activeCutscene?.type === 'ending') {
            setActiveCutscene(null);
            setAppPhase('title');
            setActiveModal('credits');
          } else if (activeCutscene?.type === 'ascension') {
            setActiveCutscene(null);
            actionBusRef.current?.startBossEncounter(10, 'normal');
          } else {
            setActiveCutscene(null);
          }
        }}
        activeQuestModal={activeQuestModal}
        onCloseQuestModal={() => setActiveQuestModal(null)}
        subtitlesEnabled={settings.subtitles}
      />

      {/* Map, Upgrades, Journal, 28 Asset Inspector, Saves, Settings & Versus Setup */}
      <MenusAndModals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        campaignState={campaignState}
        onFastTravelToRegion={(reg) => {
          setAppPhase('campaign');
          actionBusRef.current?.teleportTo(0, reg.centerZ + 40, Math.PI);
          showNotice(`Fast Traveled to ${reg.name}`);
        }}
        onJumpToBossOrQuest={({ type, index }) => {
          soundEngine.init();
          setAppPhase('campaign');
          if (type === 'boss') {
            const isHeaven = index === 10;
            setCampaignState((prev) => ({
              ...prev,
              currentBossIndex: index,
              isHeavenDio: isHeaven ? true : prev.isHeavenDio,
            }));
            actionBusRef.current?.startBossEncounter(index, 'normal');
            handleTriggerBossIntro(MAIN_BOSSES[index]);
          } else {
            const q = MANDATORY_QUESTS[index];
            if (q) {
              setCampaignState((prev) => ({
                ...prev,
                currentQuestIndex: index,
                questStep: 0,
              }));
              actionBusRef.current?.teleportTo(
                q.npcPosition.x,
                q.npcPosition.z + 8,
                Math.PI
              );
              showNotice(`Started ${q.title} — Speak with ${q.npcName}`);
            }
          }
        }}
        onPurchaseUpgrade={(key) => {
          setCampaignState((prev) => {
            if (prev.stats.skillPoints <= 0 || prev.upgrades[key] >= 5) return prev;
            const nextUpgrades = { ...prev.upgrades, [key]: prev.upgrades[key] + 1 };
            const nextMaxHp =
              key === 'vampiricVitalityLevel' ? prev.stats.maxHp + 180 : prev.stats.maxHp;
            const next = {
              ...prev,
              upgrades: nextUpgrades,
              stats: {
                ...prev.stats,
                skillPoints: prev.stats.skillPoints - 1,
                maxHp: nextMaxHp,
                hp: nextMaxHp,
              },
            };
            saveAutoCheckpoint(next, 'Stand Upgrade Purchased');
            return next;
          });
        }}
        saveSlots={saveSlots}
        onSaveToSlot={(slotIdx) => {
          const pose = actionBusRef.current?.getPlayerPose() || {};
          const merged = { ...campaignState, ...pose };
          saveToSlot(slotIdx, merged, `${hudSnapshot.currentRegion?.name || 'Frontier'} Save`);
          setSaveSlots(getSaveSlots());
          showNotice(`Saved Campaign to Slot 0${slotIdx + 1}`);
        }}
        onLoadFromSlot={(slotData) => {
          setCampaignState(slotData);
          setAppPhase('campaign');
          if (slotData.playerPosition) {
            actionBusRef.current?.teleportTo(
              slotData.playerPosition.x,
              slotData.playerPosition.z,
              slotData.playerRotationY ?? Math.PI
            );
          }
          showNotice(`Loaded ${slotData.label}`);
        }}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        assetStatuses={assetStatuses}
        onStartVersusMatch={(cfg) => {
          soundEngine.init();
          setVersusConfig({ ...cfg, round: 1 });
          setAppPhase('versus');
          setCampaignState((prev) => ({
            ...prev,
            isHeavenDio: cfg.playerFighter.id === 'vs_dio_heaven',
          }));
          actionBusRef.current?.startVersusEncounter(cfg);
          showNotice(
            `VERSUS MATCH: ${cfg.playerFighter.name} vs. ${cfg.cpuFighter.name} (${cfg.difficulty.toUpperCase()})`
          );
        }}
        onReturnToTitle={() => {
          setActiveModal(null);
          setActiveCutscene(null);
          setAppPhase('title');
        }}
      />
    </div>
  );
}