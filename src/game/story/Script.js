// Original alternate-universe story for Path to Heaven. All dialogue is original writing.
//
// THE MYSTERY
// A second Stand Arrow fell on the frontier and the sun never rose again: "the Last Night".
// Stand users from different eras were pulled into the storm. Each of ten users carries a Seal,
// and the Seals hold the night together. Enya says they guard the Arrow from DIO.
//
// THE TWIST (revealed on the Thousand Steps, foreshadowed throughout)
// The Seals do not guard the Arrow; they keep the timelines apart. Breaking them merges every
// timeline into one. The journal in the Land Office, the sundial-star symbol and the voice in the
// storm all belong to DIO himself, an ascended DIO from a finished future who shot the Arrow back
// into this night so that his past self could walk north and become him. Pucci, watching from the
// hotel balcony, has known from the start. Jotaro, the last Seal, stayed to stop it.

export const SPEAKERS = {
  DIO: { name: 'DIO', color: '#ffd34d' },
  NAR: { name: '', color: '#c9bfa8' },
  VOICE: { name: 'Voice in the Storm', color: '#fff2c8' },
  AVDOL: { name: 'Muhammad Avdol', color: '#ff8a40' },
  KAKYOIN: { name: 'Noriaki Kakyoin', color: '#5cffa0' },
  POLNAREFF: { name: 'Jean Pierre Polnareff', color: '#d8e6ff' },
  JOSUKE: { name: 'Josuke Higashikata', color: '#ff9ae0' },
  KIRA: { name: 'Yoshikage Kira', color: '#ff8ac0' },
  DIAVOLO: { name: 'Diavolo', color: '#ff5060' },
  GIORNO: { name: 'Giorno Giovanna', color: '#ffe060' },
  VALENTINE: { name: 'Funny Valentine', color: '#b0e0ff' },
  PUCCI: { name: 'Enrico Pucci', color: '#8aff9a' },
  JOTARO: { name: 'Jotaro Kujo', color: '#a99cff' },
  SPEEDWAGON: { name: 'Robert E. O. Speedwagon', color: '#e8c890' },
  ENYA: { name: 'Enya the Hag', color: '#c8a0ff' },
  MARIAH: { name: 'Mariah', color: '#8aa0ff' },
  HOLHORSE: { name: 'Hol Horse', color: '#ffe0a0' },
  VANILLA: { name: 'Vanilla Ice', color: '#b08aff' },
  NDOUL: { name: "N'Doul", color: '#6ac8ff' },
  DANIEL: { name: "Daniel J. D'Arby", color: '#e0b070' },
  TELENCE: { name: "Telence T. D'Arby", color: '#d0a0ff' },
  HEAVEN: { name: 'DIO (Heaven Ascension)', color: '#fff2c8' },
};

// Cold open: before DIO ever rides in, the final Seal-bearer is already waiting for him.
export const COLD_OPEN = {
  place: "Heaven's Reach · the northern end of the valley",
  talk: [
    ['SPEEDWAGON', "Mr. Kujo! Every lamp in Ebon Crossing lit itself tonight, all at once. And the clocks... every clock in the valley stopped at a quarter past midnight."],
    ['JOTARO', 'Yare yare daze.'],
    ['SPEEDWAGON', 'Nine Seals stand between the south road and this mountain. Avdol, Kakyoin, Polnareff... and still something is coming up that road. Aren\'t you worried? Even a little?'],
    ['JOTARO', "Speedwagon. There's no one in this world who could pose any threat to me."],
  ],
  except: ['JOTARO', '...With the sole exception of DIO, of course.'],
  after: [
    ['SPEEDWAGON', "D-DIO?! But that's impossible! That man has been dead for—"],
    ['JOTARO', "Time doesn't mean much in this valley anymore. He's on the road. I can feel it, same as the clocks."],
    ['JOTARO', 'Let him come. Star Platinum and I will be waiting at the top of the stairs.'],
  ],
  dio: [
    ['DIO', 'No one in this world poses a threat to you, Jotaro?'],
    ['DIO', 'How fortunate, then... that I am no longer of this world.'],
  ],
};

export const OPENING = {
  card: ['THE AMERICAN FRONTIER', 'The night the second Arrow fell, the sun forgot this land.'],
  ride: [
    ['NAR', 'No dawn has come to the valley in a hundred nights. Clocks stop at a quarter past midnight. Rain falls and never finishes.'],
    ['NAR', 'Men left. Their lanterns did not. And from every corner of time, those who bear Stands began to arrive.'],
    ['DIO', 'So this is the place the dreams spoke of. A valley with no morning... how fitting.'],
  ],
  arrival: [
    ['DIO', 'Ebon Crossing. Not a soul in the streets, and yet every lamp is lit. Someone wants me to see my way.'],
    ['DIO', 'Hm. A watcher on the balcony. Let him watch.'],
    ['DIO', 'This mark on the door: a star inside a sundial. I have seen it before... in my own sleep.'],
  ],
  journal: [
    ['NAR', 'The journal is bound in black leather. The ink is still wet.'],
    ['VOICE', '"To the one who rides in from the south: the Arrow waits in the north, at Heaven\'s Reach. Ten Seals stand between you and it."'],
    ['VOICE', '"Do not hesitate. You have already won. Walk north."'],
    ['DIO', 'This hand... these loops and flourishes. Who on this frontier writes the way I do?'],
  ],
  manifest: [
    ['DIO', 'Time itself shudders when I touch these pages. Then come out. Show the storm what you are.'],
    ['DIO', 'THE WORLD.'],
    ['DIO', 'Good. Ten Seals, then. I shall collect them like coins.'],
  ],
};

// Boss scripts: intro, phase taunts (index by phase number), defeat, clue.
export const BOSSES = {
  avdol: {
    title: "Muhammad Avdol · Magician's Red",
    intro: [
      ['AVDOL', 'Stop there, DIO. The rain does not reach this street, and neither will you.'],
      ['DIO', 'A fortune teller in a dead town. Tell me then: how does tonight end?'],
      ['AVDOL', 'The cards show a man who walks north and loses himself. I carry the first Seal. I will not let you have it.'],
      ['AVDOL', "Magician's Red! Burn a line he cannot cross!"],
    ],
    phases: {
      2: [['AVDOL', 'Every lantern on this street answers to my flame!']],
      3: [['AVDOL', 'Crossfire Hurricane! Choose your path carefully, DIO, because the fire already has!']],
    },
    defeat: [
      ['AVDOL', 'The rain... it has started falling on this street again.'],
      ['AVDOL', 'Listen. The Seals are not locks on a door. My cards said they were stitches. Stitches, DIO.'],
      ['DIO', 'Stitches holding what together?'],
      ['AVDOL', 'Ask the old man at the telegraph station east of the flats. He has been sending messages to nobody for a hundred nights.'],
    ],
    clue: 'Avdol called the Seals "stitches", not locks.',
  },
  kakyoin: {
    title: 'Noriaki Kakyoin · Hierophant Green',
    intro: [
      ['KAKYOIN', 'You took the telegraph road. Speedwagon must have told you about the trains that never come.'],
      ['DIO', 'And you are the boy who hides behind a coil of green thread.'],
      ['KAKYOIN', 'I do not hide. I measure. Every step you take on this platform has already touched my Stand.'],
      ['KAKYOIN', 'Hierophant Green! Emerald Splash!'],
    ],
    phases: {
      2: [['KAKYOIN', 'Watch where you step. The threads are thinner than rain.']],
      3: [['KAKYOIN', 'Twenty metres in every direction. You are already inside my barrier!']],
    },
    defeat: [
      ['KAKYOIN', 'You moved... between moments. I saw the threads go still.'],
      ['KAKYOIN', 'The Seal I carried has a sundial on it. Same as the mark in Ebon Crossing. Same as the one on your journal.'],
      ['DIO', 'You have seen the journal?'],
      ['KAKYOIN', 'Everyone has seen it, DIO. It appears to each of us before you arrive. The handwriting is always yours.'],
    ],
    clue: 'Every Seal-bearer saw DIO\'s journal before DIO arrived.',
  },
  polnareff: {
    title: 'Jean Pierre Polnareff · Silver Chariot',
    intro: [
      ['POLNAREFF', 'Bonsoir. I have been practising in this courtyard for a hundred nights, waiting for a worthy opponent.'],
      ['DIO', 'Your Stand is nowhere to be seen. Only a blade hanging in the air.'],
      ['POLNAREFF', 'Silver Chariot is here, mon ami. Most men only notice it after the third cut.'],
      ['POLNAREFF', 'En garde!'],
    ],
    phases: {
      2: [['POLNAREFF', 'Faster! You keep reaching for the same opening. I keep closing it!']],
      3: [['POLNAREFF', 'Armour off! Now Silver Chariot is lighter than the rain itself!']],
    },
    defeat: [
      ['POLNAREFF', 'Magnifique. I lose... but I keep my honour, oui?'],
      ['POLNAREFF', 'Before you go. When I first came here, a priest stood on that wall and blessed my Seal. He called it "a key that must be turned by the right hand".'],
      ['DIO', 'A priest. With a scar at his brow?'],
      ['POLNAREFF', 'You know him. Then you know more than I do. Beware the gulch trestle north of here. Someone has been shooting at the rain.'],
    ],
    clue: 'A priest blessed Polnareff\'s Seal: "a key to be turned by the right hand".',
  },
  josuke: {
    title: 'Josuke Higashikata · Crazy Diamond',
    intro: [
      ['JOSUKE', 'Hey. You stepped on my hair. Metaphorically. You looked at it funny from all the way down the trail.'],
      ['DIO', 'I did not come for your hair, boy. I came for your Seal.'],
      ['JOSUKE', 'This hamlet was broken when I got here. I fixed it. Every plank. I\'m not letting you smash it again.'],
      ['JOSUKE', 'Crazy Diamond! Dorarara!'],
    ],
    phases: {
      2: [['JOSUKE', 'Everything you break, I can put back. And it doesn\'t care if you\'re standing in the way!']],
      3: [['JOSUKE', 'I can\'t fix myself... so I just won\'t get hit!']],
    },
    defeat: [
      ['JOSUKE', 'Man... even the house I fixed is leaning again.'],
      ['JOSUKE', 'There\'s an old lady in a cabin in the pines. She says she can make your Stand stronger. She also tried to make my Stand into a puppet, so, y\'know. Careful.'],
    ],
    clue: 'Josuke repaired the broken hamlet: things here were broken before anyone came.',
  },
  kira: {
    title: 'Yoshikage Kira · Killer Queen',
    intro: [
      ['KIRA', 'I wanted a quiet life. A mining town with no people seemed ideal.'],
      ['KIRA', 'Then your journal appeared on my desk, and I learned I would be disturbed tonight.'],
      ['DIO', 'Then let us not waste your evening.'],
      ['KIRA', 'Agreed. Killer Queen has already touched something in this yard. Please, walk anywhere you like.'],
    ],
    phases: {
      2: [['KIRA', 'You are looking at the crates. Good. Keep looking at the crates.']],
      3: [['KIRA', 'Sheer Heart Attack. It only wants your warmth. Look at it, if you dare.']],
      4: [['KIRA', 'Every object in this yard is a bomb now. There is exactly one way out, and I will not tell you where.']],
    },
    defeat: [
      ['KIRA', 'My hands... they are shaking. I hate that.'],
      ['KIRA', 'The gambler in the assay hall north of the yard took my coin purse in a card game. He claims he knows what the Seals are for. He will want your soul as the ante.'],
    ],
    clue: 'Kira found the journal on his desk: it predicted the date of the fight.',
  },
  diavolo: {
    title: 'Diavolo · King Crimson',
    intro: [
      ['DIAVOLO', 'Stop at the middle of the bridge. That is where you fall.'],
      ['DIO', 'You speak as if you have already seen it.'],
      ['DIAVOLO', 'Epitaph shows me ten seconds ahead. In every one of them, you swing first and I live.'],
      ['DIAVOLO', 'King Crimson! The time in which you win will simply be erased!'],
    ],
    phases: {
      2: [['DIAVOLO', 'Only the result remains! The moment you saw coming never happened!']],
      3: [['DIAVOLO', 'I see you. I see you. Strike, and I am already behind you!']],
    },
    defeat: [
      ['DIAVOLO', 'Epitaph... showed me a second future. Two of them. Overlapping. That has never happened.'],
      ['DIAVOLO', 'The Seals aren\'t keeping you from the Arrow. They\'re keeping two timelines from touching. Break all ten and every time becomes one.'],
      ['DIO', 'And in that single time?'],
      ['DIAVOLO', 'In that time, there is only one king. I saw his face. It was not mine.'],
    ],
    clue: 'Diavolo: the Seals keep timelines from touching. Break ten and every time becomes one.',
  },
  giorno: {
    title: 'Giorno Giovanna · Gold Experience',
    intro: [
      ['GIORNO', 'I know you. Not from this night. From the blood in my veins.'],
      ['DIO', 'Then you know what I am.'],
      ['GIORNO', 'I know what you were. I came here to find out what you will be.'],
      ['GIORNO', 'Gold Experience. Life will not let you pass.'],
    ],
    phases: {
      2: [['GIORNO', 'This estate was dead when I arrived. Now everything here is alive, and everything here is mine.']],
      3: [['GIORNO', 'Punch the frog if you like. You will only be striking yourself.']],
    },
    defeat: [
      ['GIORNO', 'The vines are pointing north. All of them. Even the ones I didn\'t make.'],
      ['GIORNO', 'Something there is pulling every living thing toward it. Something that already finished growing.'],
      ['GIORNO', 'Father... are you sure the one waiting at Heaven\'s Reach is a stranger?'],
    ],
    clue: 'Giorno: "Something at Heaven\'s Reach already finished growing."',
  },
  valentine: {
    title: 'Funny Valentine · D4C',
    intro: [
      ['VALENTINE', 'Do you know what it means to stand at the centre of the world? I do. I have stood there in a hundred worlds.'],
      ['VALENTINE', 'And in every one of them, DIO, you walk up this basin and I tell you no.'],
      ['DIO', 'Then tonight you will learn a new word.'],
      ['VALENTINE', 'Dirty Deeds Done Dirt Cheap. Between the flag and the stone... there is always another me.'],
    ],
    phases: {
      2: [['VALENTINE', 'Meet my neighbours. They are all Funny Valentine, and they all object.']],
      3: [['VALENTINE', 'Careful. If two of us touch, the world takes us both apart. I am counting on you to be careless.']],
    },
    defeat: [
      ['VALENTINE', 'I looked into the next world, and the next, and the next. They are thinning. The walls between them are almost gone.'],
      ['VALENTINE', 'In the world beyond the last one, there is a man made of light sitting on a throne at the end of this road. He has your face.'],
    ],
    clue: 'Valentine saw "a man made of light on a throne" with DIO\'s face.',
  },
  pucci: {
    title: 'Enrico Pucci · C-Moon',
    intro: [
      ['PUCCI', 'DIO. My friend. You finally reached the cloister.'],
      ['DIO', 'You stood on the hotel balcony in Ebon Crossing. You blessed Polnareff\'s Seal.'],
      ['PUCCI', 'I have stood beside you in every step of this road. Now I must stand against you, so that you prove you can stand alone.'],
      ['PUCCI', 'C-Moon. Here, gravity answers to me.'],
    ],
    phases: {
      2: [['PUCCI', 'Up is a matter of faith, DIO. Do you have faith?']],
      3: [['PUCCI', 'Every surface of this cloister is turning inside out, the way the world will turn.']],
    },
    defeat: [
      ['PUCCI', 'Yes... yes. That was the last test. You are ready.'],
      ['DIO', 'Speak plainly, Pucci.'],
      ['PUCCI', 'Climb the Thousand Steps. The truth waits there, with an old man and a hag who have both been lying to you for your own good.'],
    ],
    clue: 'Pucci called the fight "the last test".',
  },
  jotaro: {
    title: 'Jotaro Kujo · Star Platinum',
    intro: [
      ['JOTARO', 'Yare yare. So you walked the whole road.'],
      ['DIO', 'Jotaro Kujo. The last Seal.'],
      ['JOTARO', 'I volunteered for it. Somebody had to stay behind and make sure you didn\'t become what you\'re about to become.'],
      ['JOTARO', 'Star Platinum. Let\'s finish this, DIO.'],
    ],
    phases: {
      2: [['JOTARO', 'You keep throwing the same punch. I keep seeing it coming.']],
      3: [['JOTARO', 'You think you\'re the only one who can stop time?']],
      4: [['JOTARO', 'One more. Ora.']],
    },
    defeat: [
      ['JOTARO', 'Tch. The Arrow\'s... glowing.'],
      ['JOTARO', 'Don\'t touch it, DIO. Once you do, there\'s no road back.'],
    ],
    clue: '',
  },
  jotaroFinal: {
    title: 'Jotaro Kujo · Star Platinum (Final)',
    intro: [
      ['JOTARO', 'You look like the man on the throne now.'],
      ['HEAVEN', 'I am the man on the throne. I always was. I simply had to catch up with myself.'],
      ['JOTARO', 'Then I\'ll knock you back down to the road. Star Platinum: The World.'],
    ],
    phases: {
      2: [['HEAVEN', 'Strike me, Jotaro. Watch your own fist forget that it ever moved.']],
      3: [['JOTARO', 'Even if you rewrite everything... I\'m still here.']],
    },
    defeat: [],
    clue: '',
  },
};

// Quest dialogue + metadata. Each quest: title, region, summary, objectives text, scenes.
export const QUESTS = {
  q1: {
    title: 'Ashes on the Wire',
    giver: 'speedwagon',
    summary: 'An old man at the Ember Flats telegraph station has been sending messages for a hundred nights. The burnt camps on the plains hold the replies.',
    meet: [
      ['SPEEDWAGON', 'Good heavens! A traveller, and a fearsome one. Robert E. O. Speedwagon, at your service. Or at least not in your way.'],
      ['DIO', 'Avdol said you send messages to nobody.'],
      ['SPEEDWAGON', 'To everybody, sir! This line runs to every year there ever was. Most nights, nothing comes back.'],
      ['SPEEDWAGON', 'But three nights ago the wires sparked and burned three camps out on the flats. Whatever answered me is written in those ashes.'],
    ],
    choice: { prompt: 'Speedwagon offers you his last cup of coffee.', options: [{ id: 'accept', label: 'Accept it. "Courtesy costs nothing."' }, { id: 'mock', label: 'Mock him. "Keep your swill, old man."' }] },
    choiceReplies: {
      accept: [['SPEEDWAGON', 'Ha! A gentleman after all. I shall remember this, sir. Speedwagon always remembers.']],
      mock: [['SPEEDWAGON', 'Hmph. Rude, but honest. Honesty is rarer than coffee out here.']],
    },
    fragments: [
      ['NAR', 'Scorched into a tin plate: "THE NIGHT IS HELD BY TEN"'],
      ['NAR', 'Burned into a wagon board: "BREAK THEM AND THE YEARS FALL TOGETHER"'],
      ['NAR', 'Etched in a melted pocket watch: "HE IS ALREADY THERE. HE IS ALSO ON HIS WAY."'],
    ],
    report: [
      ['SPEEDWAGON', '"The night is held by ten. Break them and the years fall together. He is already there. He is also on his way."'],
      ['SPEEDWAGON', 'Brrr. I\'ve read a great many telegrams, sir, and I have never read one that frightened me so.'],
      ['DIO', 'Riddles from a burned wire. The station north of here, is anyone waiting?'],
      ['SPEEDWAGON', 'A young man with green eyes and a cherry habit. He\'s been watching the tracks for a train that never comes.'],
    ],
  },
  q2: {
    title: "Bastet's Rails",
    summary: 'The rail yard at the mouth of Redstone Pass is barricaded. The woman who keeps the yard has an electrical outlet for a Stand and a temper to match.',
    meet: [
      ['MARIAH', 'You touched the outlet on the gate post, didn\'t you? Of course you did. Everybody touches it.'],
      ['MARIAH', 'Now every piece of iron in this yard wants to be close to you. Very, very close.'],
      ['DIO', 'Then I shall let the iron come to me, and bring the barricade with it.'],
    ],
    hint: 'Set the three rail switches, then stand at the magnet post. The ore cart will roll toward you along whatever path the switches make.',
    win: [
      ['MARIAH', 'You used my magnetism to open my own barricade? That\'s cheating!'],
      ['DIO', 'It is called intelligence. Now. Your Seal-bearer to the north.'],
      ['MARIAH', 'The Frenchman in the courtyard. Go ahead. Lose your fingers one at a time.'],
    ],
    fight: [['MARIAH', 'Fine! If the cart won\'t flatten you, I will!']],
  },
  q3: {
    title: "Emperor's Crossing",
    summary: 'Somebody on the far side of the gulch trestle is shooting bullets that bend through the rain.',
    meet: [
      ['HOLHORSE', 'Hold it right there, partner! Hol Horse, number one man for hire, number two at everything else.'],
      ['HOLHORSE', 'Nothin\' personal. A fella with a sundial tattoo paid me in gold that ain\'t been minted yet. Said keep you off this bridge.'],
      ['DIO', 'Then shoot, cowboy. Let us see whose bullets these really are.'],
    ],
    hint: 'Emperor\'s bullets bend toward you. Stop time and strike them back, or punch them out of the air as they arrive.',
    win: [
      ['HOLHORSE', 'Alright, alright! I yield! I\'m a lover, not a... well, I\'m mostly a lover.'],
    ],
    choice: { prompt: 'Hol Horse grovels on the trestle.', options: [{ id: 'spare', label: 'Spare him. He may be useful.' }, { id: 'punish', label: 'Throw his gun into the gulch.' }] },
    choiceReplies: {
      spare: [['HOLHORSE', 'Heh, you won\'t regret this! Here, take this, the fella with the tattoo dropped it. Feels warm.'], ['NAR', 'Hol Horse hands over a sliver of Stand Arrow. (+1 Stand Fragment)']],
      punish: [['HOLHORSE', 'My Emperor! It\'s gonna take me a week to... it\'s already back in my hand. Never mind. I\'m leavin\'.']],
    },
    clue: [['HOLHORSE', 'One more thing. That tattooed fella? He had your voice. Gave me the chills. Like talkin\' to you from the other side of a long sleep.']],
  },
  q4: {
    title: "The Hag's Lanterns",
    summary: 'Enya the Hag lives in the pines and claims to have tutored a hundred Stand users. Her fog has swallowed the trail.',
    meet: [
      ['ENYA', 'Hehehe... DIO-sama! At last, at last! The pines told me you would come limping in.'],
      ['DIO', 'I do not limp, crone. Your fog is in my way.'],
      ['ENYA', 'Justice\'s fog keeps the Seal-bearers from finding my cabin. Light the four time-ward lanterns in the forest, and the fog will part for you alone.'],
      ['ENYA', 'Then Enya will teach you how to make The World stronger. Much, much stronger.'],
    ],
    lantern: ['The flame catches. The fog recoils.', 'A second ward burns. Whispers in the fog grow quiet.', 'Three wards. The trees remember where they stand.', 'The fourth ward blazes. The fog peels away from the trail.'],
    whispers: ['...walk north...', '...you have already won...', '...turn back, DIO...', '...the hand that writes is the hand that reads...'],
    done: [
      ['ENYA', 'Splendid! Now listen well. Every Seal-bearer you defeat leaves behind a Stand Fragment. Bring them to Enya.'],
      ['ENYA', 'With them, I can lengthen your stolen seconds, quicken your fists, harden your body.'],
      ['ENYA', 'And the Seals... the Seals guard the Arrow from those unworthy of Heaven. You are worthy, DIO-sama. Enya knows it.'],
      ['DIO', 'You are lying about something, hag. I can smell it.'],
      ['ENYA', 'Hehehe. Everyone lies a little in the dark.'],
    ],
  },
  q5: {
    title: "Osiris's Wager",
    summary: 'In the assay hall of Iron Vale, a gambler keeps souls as poker chips.',
    meet: [
      ['DANIEL', 'Ah, a new player. Daniel J. D\'Arby. My Stand, Osiris, keeps the souls of those who lose their nerve.'],
      ['DANIEL', 'I know what the Seals are for, DIO. Win three souls from me and I will tell you. Lose three, and your soul will make a very fine chip.'],
      ['DIO', 'Deal the cards.'],
    ],
    rules: 'Each round, your card is shown and D\'Arby\'s is hidden. D\'Arby may Raise or Hold. You decide to Call (higher card wins) or Fold (lose nothing, but D\'Arby takes the round if he raised). D\'Arby raises with strong cards, and sometimes bluffs. Once per game, The World may stop time to peek at his card.',
    win: [
      ['DANIEL', 'I... I\'ve never lost three in a row. How did you read me?'],
      ['DIO', 'Your left eye twitches when you bluff. Now pay.'],
      ['DANIEL', 'The Seals don\'t guard anything. They hold. They hold the years apart like fingers in a dam. My brother on Bleakwater Ridge knows the rest. He reads minds; I only read cards.'],
    ],
    lose: [['DANIEL', 'Ohh, what a lovely tremble in your hand. Shall we play again? Osiris is patient.']],
  },
  q6: {
    title: "Geb's Drowned Path",
    summary: 'A blind Stand user hunts the marsh boardwalks by sound alone. His Stand is the water itself.',
    meet: [
      ['NDOUL', 'I hear your heartbeat from three hundred metres. I hear the rain hit your shoulders.'],
      ['NDOUL', 'Lord DIO. Forgive me. I swore to stop anyone who walks north, even you.'],
      ['DIO', 'You know me.'],
      ['NDOUL', 'In my time, I served you. In this time, I serve the Seals. Walk softly, Lord DIO. Geb strikes at noise.'],
    ],
    hint: 'Walk, don\'t run. Geb strikes where it hears sound. Throw stones from the piles to draw it away.',
    win: [
      ['NDOUL', 'You... you found me. I am glad. I did not want to win.'],
      ['NDOUL', 'In the water I heard two of your footsteps at once, Lord DIO. One here... and one very far north, walking down a stair.'],
    ],
  },
  q7: {
    title: "Atum's Question",
    summary: 'On the Lantern Overlook, Telence T. D\'Arby plays a shell game with souls and reads every answer in your heart before you speak it.',
    meet: [
      ['TELENCE', 'Welcome, DIO. My brother is a gambler. I am a scientist of the soul.'],
      ['TELENCE', 'Atum hears the "yes" and "no" inside you. Under one of these cups is a soul. Follow it, choose it, and I cannot move it if your thoughts are still.'],
      ['TELENCE', 'But they never are, are they?'],
    ],
    rules: 'Watch the soul token as the cups shuffle, then choose a cup. Telence can read your choice and move the token before the cup lifts. Use The World (once per round) to stop time; a choice made in stopped time cannot be read. Win two of three rounds.',
    win: [
      ['TELENCE', 'Your choice came from inside stopped time. Atum heard nothing. Remarkable.'],
      ['TELENCE', 'Very well. My brother said the Seals hold the years apart. He is right. But here is what Atum heard in you that you have not yet heard yourself.'],
      ['TELENCE', 'When I asked your soul, "Did you write the journal?", it answered "yes". And it answered in the past tense.'],
    ],
    lose: [['TELENCE', 'Your heart said "the left cup" a full second before your hand did. Again?']],
  },
  q8: {
    title: 'The Void Between',
    summary: 'In the Ruins of Many Hours, something is erasing the ruins one column at a time.',
    meet: [
      ['VANILLA', 'Lord DIO. You should not be here. Not yet. Not like this.'],
      ['DIO', 'Vanilla Ice. Of all my servants, I did not expect you to bar the way.'],
      ['VANILLA', 'I bar nothing. I erase. The three obelisks in these ruins keep the Rift closed. If you light them, the road to the cloister opens.'],
      ['VANILLA', 'I will not stop you. Cream will try. Forgive it.'],
    ],
    hint: 'Light the three timeline obelisks. Cream\'s void erases everything in its path; watch for the dust trail and stay out of its way.',
    confront: [
      ['VANILLA', 'You lit them. Lord DIO, please, hear me. The one on the throne is you. But he is not my lord. He loves no one, not even you.'],
      ['VANILLA', 'If loyalty means anything, it means stopping you here.'],
    ],
    choice: { prompt: 'Vanilla Ice kneels after the fight.', options: [{ id: 'accept', label: 'Accept his loyalty. "Rise, Vanilla Ice."' }, { id: 'reject', label: 'Reject him. "A servant who doubts is no servant."' }] },
    choiceReplies: {
      accept: [['VANILLA', 'Then I will hold the Rift open behind you for as long as I have breath.']],
      reject: [['VANILLA', '...As you wish. Then the Rift will close behind you. There is no road back.']],
    },
  },
  q9: {
    title: "The Last Night's Confession",
    summary: 'At the top of the Thousand Steps, Speedwagon and Enya wait with the truth.',
    meet: [
      ['SPEEDWAGON', 'DIO! Wait! Before you cross, you deserve to know. Enya and I, we\'ve known for a long while.'],
      ['ENYA', 'Hush, old man... no, no. He has climbed this far. Let him hear it.'],
      ['SPEEDWAGON', 'The journal. The mark on the door. The voice on the wire. All of it is you, DIO. You, from after.'],
      ['ENYA', 'In the future, DIO-sama reached Heaven. And from Heaven he looked back and saw the one road that led him there. So he shot the Arrow back into this night to make sure you would walk it.'],
      ['SPEEDWAGON', 'The ten Seals were never guarding the Arrow from you. They\'re holding every year apart. Break the last one and all of time becomes his.'],
      ['ENYA', 'Yours. It becomes yours. Hehehe... the hag always wanted to be on the winning side.'],
      ['DIO', 'So I am walking toward myself. Every clue was a footprint I already left.'],
    ],
    choice: { prompt: 'Speedwagon blocks the bridge with his arms spread.', options: [{ id: 'truth', label: '"Thank you for the truth, old man. Step aside."' }, { id: 'silence', label: 'Silence him with a glance and walk past.' }] },
    choiceReplies: {
      truth: [['SPEEDWAGON', 'Then go with your eyes open, sir. Speedwagon withdraws... and prays.']],
      silence: [['SPEEDWAGON', '...']],
    },
    bridge: [['ENYA', 'The bridge, DIO-sama! It is falling apart, run, or stop the world and walk!']],
  },
};

export const HEAVEN_SCENE = [
  ['DIO', 'The second Arrow. It is warm. As if my own hand set it down a moment ago.'],
  ['DIO', 'Then I take it back.'],
  ['VOICE', 'Welcome home.'],
  ['HEAVEN', 'Ahh... so this is Heaven. I can see every moment, laid out like cards on a table. I can turn them over at will.'],
  ['HEAVEN', 'The World Over Heaven. Its touch does not strike, Jotaro. It overwrites.'],
];

export const ENDING = [
  ['NAR', 'The last Seal broke. Every year that ever was folded into a single night, and then into a single moment.'],
  ['HEAVEN', 'Jotaro Kujo. You were the stitch that held longest. I will remember that, in every version of the world I choose to keep.'],
  ['JOTARO', 'Yare yare... you finally got what you wanted. Just remember: you were always going to be alone up there.'],
  ['NAR', 'The storm stopped mid-fall. The rain hung in the air like glass. The sky over Heaven\'s Reach cracked open, not into morning, but into white.'],
  ['HEAVEN', 'There is no sunrise here. There is only what I decide comes next.'],
];

export const ENDING_VARIANTS = {
  speedwagon: {
    accept: ['SPEEDWAGON', '(far below) ...I always remember, sir. Even the kindness of a monster.'],
    mock: ['SPEEDWAGON', '(far below) Rude to the very end. Heaven help us all.'],
  },
  vanilla: {
    accept: ['VANILLA', '(holding the Rift open) ...Lord DIO. I see the light. I am content.'],
    reject: ['VANILLA', '(as the Rift closes) ...No road back. As you wished.'],
  },
  truth: {
    truth: ['NAR', 'An old man at the foot of the Thousand Steps keeps praying long after the stars stop moving.'],
    silence: ['NAR', 'No one at the foot of the Thousand Steps says a word. There is no one left who would.'],
  },
};

export const CREDITS = [
  ['JOJO\'S BIZARRE ADVENTURE', 'PATH TO HEAVEN'],
  ['An original fan game', 'Alternate-universe story and dialogue written for this project'],
  ['Characters & Stands', 'JoJo\'s Bizarre Adventure is created by Hirohiko Araki. This is an unofficial, non-commercial fan work.'],
  ['3D Models', 'The 28 GLB models supplied by the project owner'],
  ['Engine', 'Three.js · procedural animation, auto-rigging, world, weather and VFX built for this game'],
  ['Music & Sound', 'Generated live in the browser with the Web Audio API. Original procedural compositions; no copyrighted recordings or voices'],
  ['Thank you for playing', 'The night is over. Or it has only just begun.'],
];

export const TUTORIAL = {
  move: 'Move with WASD / Left Stick. Look with the Mouse / Right Stick.',
  interact: 'Press E / B to interact.',
  stand: 'Press Q / D-Pad Up to summon or dismiss The World.',
  strike: 'Left Mouse / X: Strike. Right Mouse / Y: Heavy Strike. F / RB (hold): Stand Rush.',
  defend: 'C / LB: Guard (guard just before a hit to Counter). Space / A: Dodge. G / LT: Knockback Strike.',
  timestop: 'R / RT: THE WORLD. Stop time.',
  lock: 'Tab / Middle Mouse / R3: Lock onto a target.',
  horse: 'H / D-Pad Down: whistle for Slow Dancer. E to mount. W to ride, Shift to gallop.',
};
