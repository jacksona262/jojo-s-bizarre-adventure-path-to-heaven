// Optional lore pages scattered along the road north: torn journal leaves glowing faintly beside
// landmarks. Finding all twelve (plus finishing the story) is the 100% completion goal, and every
// page can be reread in the Journal.

export const LORE = [
  { id: 'l_ebon', poi: 'landOffice', off: [-9, 10], title: 'Ebon Crossing Ledger', text: 'Land Office ledger, last entry: "Population nil. Lamps lit: forty-one. Clocks: stopped. The clerk who wrote this left at a quarter past midnight and has not finished leaving."' },
  { id: 'l_wire', poi: 'telegraph', off: [12, 8], title: 'Telegraph Tape', text: 'A strip of tape from a machine with no wire attached: "ARROW FELL NORTH STOP SUN DID NOT RISE STOP SEND SOMEONE WHO HAS ALREADY ARRIVED STOP".' },
  { id: 'l_camp', poi: 'camp3', off: [8, -6], title: 'Prospector\'s Note', text: 'Scrawled on a burnt map: "Struck no gold. Struck something worse. The rocks here remember being struck before I swung."' },
  { id: 'l_rails', poi: 'railyard', off: [16, 30], title: 'Timetable', text: 'A rail timetable with every arrival crossed out but one, circled twice in red ink: "The Night Express. Arrives: when he does."' },
  { id: 'l_trestle', poi: 'bridgeHol', off: [14, 40], title: 'Wanted Poster', text: 'WANTED - THE MAN WHO CANNOT BE SHOT. Reward withdrawn. Below, in pencil: "Tried it. Bullet stopped in the air and waited for me to leave."' },
  { id: 'l_pines', poi: 'enyaCabin', off: [-14, 14], title: 'Enya\'s Recipe', text: 'A page of crooked handwriting: "One Stand, broken. One fragment, bright. Grind at a quarter past midnight. The hour is always available here, which is convenient."' },
  { id: 'l_assay', poi: 'osirisHall', off: [10, -12], title: 'Assay Report', text: 'Sample 77: "Ore contains time. Approximately one hundred nights per ounce. Not for sale. Not for anything."' },
  { id: 'l_marsh', poi: 'gebMarsh', off: [-12, 18], title: 'Drowned Letter', text: 'Half a letter, the ink run by water: "...the hunter hears two footsteps for every one DIO takes. The second set is lighter. It is coming down the stairs, not up..."' },
  { id: 'l_overlook', poi: 'atumOverlook', off: [-10, 12], title: 'Lantern Keeper\'s Log', text: '"Night 97. The lanterns lean north now, all of them, like flowers to a sun that is not there. I trimmed the wicks. They leaned anyway."' },
  { id: 'l_ruins', poi: 'creamRuins', off: [18, 16], title: 'Carved Stone', text: 'Carved into a stone that is older than the ruin around it: "WHAT IS ERASED IS NOT GONE. IT IS ONLY WAITING FOR SOMEONE TO NOTICE THE GAP."' },
  { id: 'l_steps', poi: 'sanctuaryStair', off: [9, 20], title: 'Pilgrim\'s Count', text: 'Tally marks up a wall, then: "Nine hundred and ninety-nine. I always stop at nine hundred and ninety-nine. The last step is not for me."' },
  { id: 'l_throne', poi: 'arenaJotaro', off: [24, 26], title: 'The Unsigned Page', text: 'The final leaf of the journal, unsigned and still wet: "You will read this after you win. You have already read it. You wrote it so that you would keep walking."' },
];

export const LORE_COUNT = LORE.length;
