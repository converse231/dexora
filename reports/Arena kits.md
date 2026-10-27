# Arena kits: the full map (for review)

Made by `node tools/build_kits.mjs` from each line's real learnsets (docs/arena-kits.md). 638 lines, 1137 Pokémon.
Each row is one evolution path (a branch, like Eevee's, is a row of its own); each cell lists its stages in order (Charmander / Charmeleon / Charizard). A `*` is a filler: the line learns nothing that fits that slot's job, so it took its strongest leftover attack.

✋ marks a hand-written kit (100 of them); the rest come from the rules.

Classes: Fighter 197, Tank 165, Mage 111, Marksman 71, Assassin 69, Support 25.
Lines whose final stage has a filler: Main 5, Move 92, Control 66, Power 0.

| Line | Class | Main (RMB) | Move (Q) | Control (E) | Power (R) | Combo |
|---|---|---|---|---|---|---|
| Bulbasaur → Ivysaur → Venusaur | Mage ✋ | Seed Bomb / Seed Bomb / Petal Blizzard | Take Down / Take Down / Take Down | Sleep Powder / Sleep Powder / Sleep Powder | Power Whip / Power Whip / Solar Beam | Sleep Powder, then Solar Beam |
| Charmander → Charmeleon → Charizard | Mage ✋ | Flamethrower / Flamethrower / Flamethrower | Flare Blitz / Flare Blitz / Flare Blitz | Dragon Breath / Dragon Breath / Dragon Breath | Fire Fang / Fire Fang / Heat Wave | Dragon Breath, then Heat Wave |
| Squirtle → Wartortle → Blastoise | Tank ✋ | Water Pulse / Water Pulse / Water Pulse | Rapid Spin / Rapid Spin / Rapid Spin | Bite / Bite / Bite | Hydro Pump / Protect / Hydro Pump | Bite, then Hydro Pump |
| Caterpie → Metapod → Butterfree | Marksman | - / - / Psybeam | Tackle / Tackle / Tackle | String Shot / String Shot / Sleep Powder | - / - / Air Slash | Sleep Powder, then Air Slash |
| Weedle → Kakuna → Beedrill | Fighter | - / - / Bug Bite | - / - / Agility | String Shot / String Shot / String Shot | Poison Sting / Poison Sting / Venoshock | String Shot, then Venoshock |
| Pidgey → Pidgeotto → Pidgeot | Marksman | Gust / Gust / Gust | Wing Attack / Wing Attack / Wing Attack | Air Slash / Air Slash / Air Slash | Aerial Ace / Aerial Ace / Aerial Ace | Air Slash, then Aerial Ace |
| Rattata → Raticate | Fighter | Assurance / Bite | Take Down / Take Down | Bite / Scary Face | Crunch / Crunch | Scary Face, then Crunch |
| Spearow → Fearow | Fighter | Assurance / Pluck | Aerial Ace / Aerial Ace | Wing Attack* / Drill Run* | Drill Peck / Drill Peck |  |
| Ekans → Arbok | Fighter | Sludge Bomb / Sludge Bomb | Bite* / Crunch* | Glare / Glare | Belch / Belch | Glare, then Belch |
| Sandshrew → Sandslash | Tank | Slash / Crush Claw | Dig / Dig | Bulldoze / Bulldoze | Defense Curl / Defense Curl | Bulldoze, then Crush Claw |
| Nidoran F → Nidorina → Nidoqueen | Fighter | Scratch / Scratch / Earth Power | Double Kick* / Double Kick* / Crunch* | Bite / Bite / Bite | Earth Power / Earth Power / Sludge Wave | Bite, then Sludge Wave |
| Nidoran M → Nidorino → Nidoking | Fighter | Peck / Peck / Poison Jab | Horn Attack / Horn Attack / Horn Attack | Double Kick* / Double Kick* / Earth Power* | Earth Power / Earth Power / Sludge Wave |  |
| Vulpix → Ninetales | Mage ✋ | Flamethrower / Flamethrower | Quick Attack / Quick Attack | Will O Wisp / Will O Wisp | Fire Blast / Inferno | Will O Wisp, then Inferno |
| Zubat → Golbat → Crobat | Fighter ✋ | Bite / Bite / Air Slash | Venoshock* / Venoshock* / Venoshock* | Poison Fang / Poison Fang / Poison Fang | Leech Life / Leech Life / Leech Life | Poison Fang, then Leech Life |
| Oddish → Gloom → Vileplume | Mage | Moonblast / Moonblast / Giga Drain | Acid* / Acid* / Moonblast* | Sleep Powder / Sleep Powder / Sleep Powder | Giga Drain / Giga Drain / Petal Blizzard | Sleep Powder, then Petal Blizzard |
| Oddish → Gloom → Bellossom | Tank | Moonblast / Moonblast / Petal Blizzard | Acid* / Acid* / Quiver Dance | Sleep Powder / Sleep Powder / Sleep Powder | Giga Drain / Giga Drain / Moonlight | Sleep Powder, then Petal Blizzard |
| Paras → Parasect | Tank | Slash / Cross Poison | Scratch* / Slash* | Spore / Spore | Giga Drain / Giga Drain | Spore, then Giga Drain |
| Venonat → Venomoth | Marksman | Poison Fang / Psychic | Zen Headbutt / Zen Headbutt | Sleep Powder / Sleep Powder | Bug Buzz / Leech Life | Sleep Powder, then Leech Life |
| Diglett → Dugtrio | Assassin | Slash / Night Slash | Dig / Dig | Bulldoze / Bulldoze | Earth Power / Earth Power | Bulldoze, then Earth Power |
| Meowth → Persian | Fighter | Pay Day / Scratch | Play Rough / Play Rough | Fake Out / Fake Out | Scratch / Power Gem | Fake Out, then Power Gem |
| Meowth → Perrserker | Tank | Pay Day / Metal Claw | Play Rough / Play Rough | Fake Out / Fake Out | Scratch / Iron Defense | Fake Out, then Metal Claw |
| Psyduck → Golduck | Marksman | Confusion / Water Gun | Zen Headbutt / Zen Headbutt | Water Pulse / Water Pulse | Water Gun / Aqua Tail | Water Pulse, then Aqua Tail |
| Mankey → Primeape → Annihilape | Fighter | Stomping Tantrum / Stomping Tantrum / Shadow Punch | Outrage* / Outrage* / Outrage* | Thrash* / Thrash* / Thrash* | Cross Chop / Cross Chop / Cross Chop |  |
| Growlithe → Arcanine | Fighter ✋ | Fire Fang / Fire Fang | Take Down / Extreme Speed | Bite / Bite | Flamethrower / Flamethrower | Bite, then Flamethrower |
| Poliwag → Poliwhirl → Poliwrath | Tank | Earth Power / Earth Power / Bubble Beam | Double Edge / Double Edge / Double Edge | Hypnosis / Hypnosis / Hypnosis | Bubble Beam / Bubble Beam / Hydro Pump | Hypnosis, then Hydro Pump |
| Poliwag → Poliwhirl → Politoed | Tank | Earth Power / Earth Power / Bubble Beam | Double Edge / Double Edge / Bounce | Hypnosis / Hypnosis / Hypnosis | Bubble Beam / Bubble Beam / Double Edge | Hypnosis, then Double Edge |
| Abra → Kadabra → Alakazam | Assassin ✋ | Psyshock / Psyshock / Psyshock | Psycho Cut* / Psycho Cut* / Psycho Cut* | Confusion / Confusion / Confusion | Psychic / Psychic / Psychic | Confusion, then Psychic |
| Machop → Machoke → Machamp | Fighter ✋ | Cross Chop / Cross Chop / Cross Chop | Double Edge / Double Edge / Double Edge | Vital Throw / Vital Throw / Vital Throw | Low Sweep / Low Sweep / Low Sweep | Vital Throw, then Low Sweep |
| Bellsprout → Weepinbell → Victreebel | Fighter | Razor Leaf / Razor Leaf / Leaf Blade | Slam* / Slam* / Poison Jab* | Vine Whip / Vine Whip / Sleep Powder | Poison Jab / Poison Jab / Leaf Storm | Sleep Powder, then Leaf Storm |
| Tentacool → Tentacruel | Mage | Surf / Surf | Poison Jab* / Poison Jab* | Water Pulse / Water Pulse | Sludge Wave / Sludge Wave | Water Pulse, then Sludge Wave |
| Geodude → Graveler → Golem | Tank ✋ | Stone Edge / Stone Edge / Stone Edge | Rollout / Rollout / Rollout | Bulldoze / Bulldoze / Bulldoze | Earthquake / Earthquake / Earthquake | Bulldoze, then Earthquake |
| Ponyta → Rapidash | Assassin ✋ | Flame Wheel / Flame Wheel | Take Down / Smart Strike | Stomp / Stomp | Fire Blast / Fire Blast | Stomp, then Fire Blast |
| Slowpoke → Slowbro | Tank ✋ | Psychic / Psychic | Headbutt / Zen Headbutt | Water Pulse / Water Pulse | Slack Off / Slack Off | Water Pulse, then Psychic |
| Slowpoke → Slowking | Tank | Psychic / Psychic | Headbutt / Zen Headbutt | Water Pulse / Headbutt | Slack Off / Amnesia | Headbutt, then Psychic |
| Magnemite → Magneton → Magnezone | Mage ✋ | Discharge / Discharge / Discharge | Tackle / Tackle / Tackle | Thunder Wave / Thunder Wave / Thunder Wave | Flash Cannon / Flash Cannon / Flash Cannon | Thunder Wave, then Flash Cannon |
| Farfetchd | Fighter | Leaf Blade | Aerial Ace | Air Slash | Slash | Air Slash, then Slash |
| Doduo → Dodrio | Assassin | Drill Peck / Drill Peck | Quick Attack / Quick Attack | Pluck* / Tri Attack* | Uproar / Uproar |  |
| Seel → Dewgong | Tank | Brine / Ice Beam | Dive / Dive | Icy Wind / Icy Wind | Aqua Tail / Aqua Tail | Icy Wind, then Aqua Tail |
| Grimer → Muk | Tank | Sludge Bomb / Sludge Bomb | Belch* / Belch* | Mud Shot / Mud Shot | Harden / Harden | Mud Shot, then Sludge Bomb |
| Shellder → Cloyster | Tank | Razor Shell / Ice Beam | Tackle / Ice Shard | Ice Beam / Icicle Crash | Protect / Protect | Icicle Crash, then Ice Beam |
| Gastly → Haunter → Gengar | Assassin ✋ | Hex / Hex / Shadow Ball | Sucker Punch / Sucker Punch / Sucker Punch | Hypnosis / Hypnosis / Hypnosis | Dream Eater / Dream Eater / Dream Eater | Hypnosis, then Dream Eater |
| Onix → Steelix | Tank ✋ | Iron Tail / Iron Tail | Dig / Dig | Dragon Breath / Dragon Breath | Stone Edge / Stone Edge | Dragon Breath, then Stone Edge |
| Drowzee → Hypno | Tank | Psychic / Psychic | Zen Headbutt / Zen Headbutt | Headbutt / Headbutt | Future Sight / Future Sight | Headbutt, then Future Sight |
| Krabby → Kingler | Fighter | Slam / Slam | Bubble Beam* / Hammer Arm* | Mud Shot / Mud Shot | Razor Shell / Razor Shell | Mud Shot, then Razor Shell |
| Voltorb → Electrode | Mage | Discharge / Discharge | Tackle / Tackle | Spark / Spark | Self Destruct / Self Destruct | Spark, then Self Destruct |
| Exeggcute → Exeggutor | Mage | Extrasensory / Extrasensory | Uproar* / Wood Hammer | Hypnosis / Hypnosis | Solar Beam / Solar Beam | Hypnosis, then Solar Beam |
| Exeggcute → Exeggutor Alola | Mage | Extrasensory / Giga Drain | Uproar* / Wood Hammer | Hypnosis / Hypnosis | Solar Beam / Solar Beam | Hypnosis, then Solar Beam |
| Cubone → Marowak | Tank | Retaliate / Retaliate | Double Edge / Double Edge | Headbutt / Headbutt | Stomping Tantrum / Stomping Tantrum | Headbutt, then Stomping Tantrum |
| Cubone → Marowak Alola | Tank | Retaliate / Flame Wheel | Double Edge / Double Edge | Headbutt / Headbutt | Stomping Tantrum / Shadow Bone | Headbutt, then Shadow Bone |
| Lickitung → Lickilicky | Tank | Stomp / Stomp | Rollout / Rollout | Power Whip / Power Whip | Defense Curl / Defense Curl | Power Whip, then Stomp |
| Koffing → Weezing | Tank | Sludge Bomb / Sludge Bomb | Tackle / Tackle | Smokescreen / Smokescreen | Self Destruct / Self Destruct | Smokescreen, then Self Destruct |
| Koffing → Weezing Galar | Tank | Sludge Bomb / Sludge Bomb | Tackle / Tackle | Smokescreen / Smokescreen | Self Destruct / Explosion | Smokescreen, then Explosion |
| Rhyhorn → Rhydon → Rhyperior | Tank ✋ | Stone Edge / Stone Edge / Stone Edge | Drill Run / Drill Run / Drill Run | Bulldoze / Bulldoze / Bulldoze | Megahorn / Megahorn / Earthquake | Bulldoze, then Earthquake |
| Tangela → Tangrowth | Fighter | Mega Drain / Slam | Ancient Power / Ancient Power | Vine Whip / Vine Whip | Giga Drain / Giga Drain | Vine Whip, then Giga Drain |
| Kangaskhan | Fighter ✋ | Crunch | Fake Out | Stomp | Outrage | Stomp, then Outrage |
| Horsea → Seadra → Kingdra | Fighter ✋ | Dragon Pulse / Dragon Pulse / Dragon Pulse | Agility / Agility / Agility | Smokescreen / Smokescreen / Smokescreen | Bubble Beam / Bubble Beam / Hydro Pump | Smokescreen, then Hydro Pump |
| Goldeen → Seaking | Fighter | Peck / Peck | Megahorn / Megahorn | Water Pulse / Water Pulse | Horn Attack / Horn Attack | Water Pulse, then Horn Attack |
| Staryu → Starmie | Assassin | Brine / Psychic | Rapid Spin / Rapid Spin | Psybeam / Psybeam | Surf / Surf | Psybeam, then Surf |
| Scyther → Scizor | Fighter ✋ | Slash / X Scissor | Quick Attack / Bullet Punch | Air Slash / Air Slash | Swords Dance / Swords Dance | Air Slash, then X Scissor |
| Scyther → Kleavor | Fighter | Slash / Stone Axe | Quick Attack / Wing Attack | Air Slash / Air Slash | Swords Dance / Rock Slide | Air Slash, then Rock Slide |
| Pinsir | Fighter | Bug Bite | Submission | Vital Throw | Superpower | Vital Throw, then Superpower |
| Tauros | Fighter | Assurance | Double Edge | Scary Face | Giga Impact | Scary Face, then Giga Impact |
| Magikarp → Gyarados | Fighter ✋ | Waterfall / Waterfall | Dragon Dance / Dragon Dance | Bite / Bite | Hydro Pump / Hydro Pump | Bite, then Hydro Pump |
| Lapras | Support ✋ | Ice Beam | Ice Shard | Sing | Life Dew | Sing, then Ice Beam |
| Ditto | Fighter ✋ | Tackle | Quick Attack | Scary Face | Body Slam | Scary Face, then Body Slam |
| Eevee → Vaporeon | Tank ✋ | Covet / Muddy Water | Quick Attack / Quick Attack | Bite / Water Pulse | Double Edge / Acid Armor | Water Pulse, then Muddy Water |
| Eevee → Jolteon | Assassin ✋ | Covet / Discharge | Quick Attack / Quick Attack | Bite / Thunder Wave | Double Edge / Last Resort | Thunder Wave, then Last Resort |
| Eevee → Flareon | Fighter ✋ | Covet / Fire Fang | Quick Attack / Quick Attack | Bite / Lava Plume | Double Edge / Last Resort | Lava Plume, then Last Resort |
| Eevee → Espeon | Assassin ✋ | Covet / Psychic | Quick Attack / Quick Attack | Bite / Confusion | Double Edge / Last Resort | Confusion, then Last Resort |
| Eevee → Umbreon | Tank ✋ | Covet / Dark Pulse | Quick Attack / Quick Attack | Bite / Bite | Double Edge / Last Resort | Bite, then Last Resort |
| Eevee → Leafeon | Fighter ✋ | Covet / Razor Leaf | Quick Attack / Quick Attack | Bite / Bite | Double Edge / Leaf Blade | Bite, then Leaf Blade |
| Eevee → Glaceon | Mage ✋ | Covet / Freeze Dry | Quick Attack / Ice Shard | Bite / Icy Wind | Double Edge / Last Resort | Icy Wind, then Last Resort |
| Eevee → Sylveon | Tank ✋ | Covet / Draining Kiss | Quick Attack / Quick Attack | Bite / Bite | Double Edge / Last Resort | Bite, then Last Resort |
| Porygon → Porygon2 → Porygon Z | Mage | Discharge / Discharge / Tri Attack | Tackle / Double Edge / Double Edge | Zap Cannon / Zap Cannon / Zap Cannon | Tri Attack / Tri Attack / Hyper Beam | Zap Cannon, then Hyper Beam |
| Omanyte → Omastar | Tank | Surf / Surf | Rollout / Rollout | Mud Shot / Mud Shot | Protect / Protect | Mud Shot, then Surf |
| Kabuto → Kabutops | Fighter | Leech Life / Leech Life | Aqua Jet / Aqua Jet | Mud Shot / Mud Shot | Liquidation / Liquidation | Mud Shot, then Liquidation |
| Aerodactyl | Assassin ✋ | Rock Slide | Wing Attack | Bite | Hyper Beam | Bite, then Hyper Beam |
| Articuno | Support | Ice Beam | Ice Shard | Hurricane | Roost | Hurricane, then Ice Beam |
| Zapdos | Mage | Drill Peck | Agility | Zap Cannon | Discharge | Zap Cannon, then Discharge |
| Moltres | Mage | Heat Wave | Wing Attack | Hurricane | Sky Attack | Hurricane, then Sky Attack |
| Dratini → Dragonair → Dragonite | Fighter ✋ | Aqua Tail / Aqua Tail / Aqua Tail | Dragon Rush / Dragon Rush / Extreme Speed | Thunder Wave / Thunder Wave / Thunder Wave | Hyper Beam / Hyper Beam / Hurricane | Thunder Wave, then Hurricane |
| Mewtwo | Assassin ✋ | Psychic | Ancient Power | Confusion | Future Sight | Confusion, then Future Sight |
| Mew | Marksman ✋ | Pound | Ancient Power | - | Aura Sphere |  **(1 empty: needs a hand-written kit)** |
| Chikorita → Bayleef → Meganium | Tank ✋ | Magical Leaf / Magical Leaf / Magical Leaf | Body Slam / Body Slam / Body Slam | Poison Powder / Poison Powder / Poison Powder | Synthesis / Synthesis / Synthesis | Poison Powder, then Magical Leaf |
| Cyndaquil → Quilava → Typhlosion | Mage ✋ | Flamethrower / Flamethrower / Flamethrower | Flame Charge / Flame Charge / Flame Charge | Lava Plume / Lava Plume / Lava Plume | Overheat / Overheat / Overheat | Lava Plume, then Overheat |
| Cyndaquil → Quilava → Typhlosion Hisui | Mage | Flamethrower / Flamethrower / Flamethrower | Flame Charge / Flame Charge / Double Edge | Lava Plume / Lava Plume / Smokescreen | Overheat / Overheat / Overheat | Smokescreen, then Overheat |
| Totodile → Croconaw → Feraligatr | Fighter ✋ | Aqua Tail / Aqua Tail / Aqua Tail | Thrash* / Thrash* / Agility | Ice Fang / Ice Fang / Ice Fang | Superpower / Superpower / Superpower | Ice Fang, then Superpower |
| Sentret → Furret | Fighter | Slam / Slam | Sucker Punch / Sucker Punch | Scratch* / Quick Attack* | Hyper Voice / Hyper Voice |  |
| Hoothoot → Noctowl | Support | Uproar / Uproar | Take Down / Take Down | Hypnosis / Hypnosis | Roost / Roost | Hypnosis, then Uproar |
| Ledyba → Ledian | Support | Bug Buzz / Bug Buzz | Double Edge / Double Edge | Air Slash / Air Slash | Roost / Roost | Air Slash, then Bug Buzz |
| Spinarak → Ariados | Tank | Psychic / Bug Bite | Sucker Punch / Sucker Punch | String Shot / String Shot | Cross Poison / Cross Poison | String Shot, then Cross Poison |
| Chinchou → Lanturn | Support | Discharge / Discharge | Take Down / Take Down | Thunder Wave / Thunder Wave | Charge / Swallow | Thunder Wave, then Discharge |
| Pichu → Pikachu → Raichu | Mage ✋ | Thunderbolt / Thunderbolt / Thunderbolt | Quick Attack / Quick Attack / Quick Attack | Nuzzle / Thunder Wave / Thunder Wave | Discharge / Discharge / Discharge | Thunder Wave, then Discharge |
| Pichu → Pikachu → Raichu Alola | Mage | Thunderbolt / Thunderbolt / Thunderbolt | Quick Attack / Quick Attack / Quick Attack | Nuzzle / Thunder Wave / Nuzzle | Discharge / Discharge / Psychic | Nuzzle, then Psychic |
| Cleffa → Clefairy → Clefable | Tank | - / Disarming Voice / Disarming Voice | - / Meteor Mash* / Meteor Mash* | Sing / Sing / Sing | Pound / Defense Curl / Defense Curl | Sing, then Disarming Voice |
| Igglybuff → Jigglypuff → Wigglytuff | Support | Pound / Hyper Voice / Hyper Voice | - / Body Slam / Play Rough | Sing / Sing / Sing | Defense Curl / Swallow / Swallow | Sing, then Hyper Voice |
| Togepi → Togetic → Togekiss | Tank ✋ | Ancient Power / Fairy Wind / Air Slash | Double Edge / Double Edge / Extreme Speed | Last Resort* / Last Resort* / Last Resort* | Life Dew / Life Dew / Aura Sphere |  |
| Natu → Xatu | Marksman | Peck / Peck | - / Stored Power* | Stored Power* / Air Slash | Psychic / Psychic | Air Slash, then Psychic |
| Mareep → Flaaffy → Ampharos | Mage ✋ | Discharge / Discharge / Discharge | Take Down / Take Down / Take Down | Thunder Wave / Thunder Wave / Thunder Wave | Dazzling Gleam / Dazzling Gleam / Thunder | Thunder Wave, then Thunder |
| Hoppip → Skiploom → Jumpluff | Support | Acrobatics / Acrobatics / Acrobatics | Bounce / Bounce / Bounce | Stun Spore / Stun Spore / Stun Spore | Synthesis / Synthesis / Synthesis | Stun Spore, then Acrobatics |
| Aipom → Ambipom | Assassin | Scratch / Scratch | Agility / Agility | Astonish / Astonish | Swift / Swift | Astonish, then Swift |
| Sunkern → Sunflora | Mage | Giga Drain / Petal Blizzard | Double Edge / Double Edge | Razor Leaf* / Petal Dance* | Seed Bomb / Solar Beam |  |
| Yanma → Yanmega | Mage | Air Cutter / Air Cutter | U Turn / U Turn | Hypnosis / Hypnosis | Air Slash / Air Slash | Hypnosis, then Air Slash |
| Wooper → Quagsire | Tank | Aqua Tail / Aqua Tail | Muddy Water* / Muddy Water* | Mud Shot / Mud Shot | Amnesia / Amnesia | Mud Shot, then Aqua Tail |
| Wooper → Clodsire | Tank | Aqua Tail / Poison Jab | Muddy Water* / Megahorn | Mud Shot / Mud Shot | Amnesia / Amnesia | Mud Shot, then Poison Jab |
| Murkrow → Honchkrow | Fighter | Assurance / Night Slash | Sucker Punch / Sucker Punch | Astonish / Astonish | Wing Attack / Dark Pulse | Astonish, then Dark Pulse |
| Misdreavus → Mismagius | Assassin | Power Gem / Power Gem | Psybeam* / Phantom Force | Astonish / Astonish | Hex / Hex | Astonish, then Hex |
| Unown | Marksman ✋ | - | Extrasensory | Confusion | Psychic | Confusion, then Psychic **(1 empty: needs a hand-written kit)** |
| Girafarig → Farigiraf | Mage | Confusion / Confusion | Tackle / Tackle | Astonish / Astonish | Psybeam / Psybeam | Astonish, then Psybeam |
| Pineco → Forretress | Tank | Bug Bite / Bug Bite | Take Down / Take Down | Self Destruct* / Zap Cannon | Protect / Protect | Zap Cannon, then Bug Bite |
| Dunsparce → Dudunsparce | Tank | Ancient Power / Ancient Power | Double Edge / Double Edge | Glare / Glare | Defense Curl / Defense Curl | Glare, then Ancient Power |
| Gligar → Gliscor | Fighter | X Scissor / Poison Jab | U Turn / U Turn | Slash* / Ice Fang | Acrobatics / Acrobatics | Ice Fang, then Acrobatics |
| Snubbull → Granbull | Fighter | Fire Fang / Crunch | Play Rough / Play Rough | Scary Face / Scary Face | Crunch / Outrage | Scary Face, then Outrage |
| Qwilfish → Overqwil | Fighter | Brine / Barb Barrage | Tackle / Tackle | Fell Stinger* / Bite | Poison Jab / Crunch | Bite, then Crunch |
| Shuckle | Tank | Stone Edge | Rollout | Rock Slide | Withdraw | Rock Slide, then Stone Edge |
| Heracross | Fighter ✋ | Brick Break | Aerial Ace | Throat Chop | Close Combat | Throat Chop, then Close Combat |
| Sneasel → Weavile | Assassin | Scratch / Assurance | Quick Attack / Ice Shard | Icy Wind / Icy Wind | Metal Claw / Dark Pulse | Icy Wind, then Dark Pulse |
| Sneasel → Sneasler | Assassin | Scratch / Poison Jab | Quick Attack / Quick Attack | Icy Wind / Icy Wind | Metal Claw / Dire Claw | Icy Wind, then Dire Claw |
| Teddiursa → Ursaring → Ursaluna | Tank | Covet / Covet / Slash | Play Rough / Play Rough / High Horsepower | Lick / Scary Face / Scary Face | Slash / Slash / Thrash | Scary Face, then Thrash |
| Slugma → Magcargo | Tank | Lava Plume / Flamethrower | Ancient Power / Ancient Power | Body Slam / Body Slam | Harden / Harden | Body Slam, then Flamethrower |
| Swinub → Piloswine → Mamoswine | Fighter | Powder Snow / Ice Fang / Ice Fang | Take Down / Take Down / Take Down | Icy Wind / Icy Wind / Icy Wind | Blizzard / Blizzard / Blizzard | Icy Wind, then Blizzard |
| Corsola → Cursola | Marksman | Ancient Power / Power Gem | Tackle / Tackle | Bubble Beam / Astonish | Power Gem / Earth Power | Astonish, then Earth Power |
| Remoraid → Octillery | Mage | Bubble Beam / Octazooka | Ice Beam* / Gunk Shot* | Water Pulse / Water Pulse | Hyper Beam / Hyper Beam | Water Pulse, then Hyper Beam |
| Delibird | Marksman ✋ | - | Aerial Ace | Icy Wind | Blizzard | Icy Wind, then Blizzard **(1 empty: needs a hand-written kit)** |
| Skarmory | Tank | Drill Peck | Wing Attack | Slash* | Iron Defense |  |
| Houndour → Houndoom | Mage | Incinerate / Incinerate | Foul Play* / Foul Play* | Bite / Bite | Flamethrower / Flamethrower | Bite, then Flamethrower |
| Phanpy → Donphan | Tank | Slam / Stomping Tantrum | Take Down / Take Down | Bulldoze / Bulldoze | Endure / Endure | Bulldoze, then Stomping Tantrum |
| Stantler → Wyrdeer | Fighter | Astonish / Psyshield Bash | Take Down / Take Down | Hypnosis / Hypnosis | Stomp / Zen Headbutt | Hypnosis, then Zen Headbutt |
| Smeargle | Tank ✋ | Tackle | Quick Attack | Spore | Dazzling Gleam | Spore, then Dazzling Gleam |
| Tyrogue → Hitmonlee | Fighter ✋ | Blaze Kick / Blaze Kick | Tackle / Fake Out | Low Sweep / Low Sweep | High Jump Kick / High Jump Kick | Low Sweep, then High Jump Kick |
| Tyrogue → Hitmonchan | Tank ✋ | Blaze Kick / Drain Punch | Tackle / Mach Punch | Low Sweep / Thunder Punch | High Jump Kick / Close Combat | Thunder Punch, then Close Combat |
| Tyrogue → Hitmontop | Tank | Blaze Kick / Triple Kick | Tackle / Dig | Low Sweep / Fake Out | High Jump Kick / Detect | Fake Out, then Triple Kick |
| Smoochum → Jynx | Mage | Confusion / Psychic | Ice Punch* / Ice Punch* | Sing / Sing | Psychic / Blizzard | Sing, then Blizzard |
| Elekid → Electabuzz → Electivire | Fighter ✋ | Thunder Punch / Thunder Punch / Thunder Punch | Quick Attack / Quick Attack / Quick Attack | Thunder Wave / Thunder Wave / Thunder Wave | Thunderbolt / Giga Impact / Thunder | Thunder Wave, then Thunder |
| Magby → Magmar → Magmortar | Mage ✋ | Flamethrower / Flamethrower / Flamethrower | Fire Punch* / Lava Plume* / Lava Plume* | Smokescreen / Smokescreen / Smokescreen | Lava Plume / Hyper Beam / Hyper Beam | Smokescreen, then Hyper Beam |
| Miltank | Fighter | High Horsepower* | Headbutt | Body Slam | Stomp | Body Slam, then Stomp |
| Raikou | Assassin | Discharge | Extreme Speed | Spark | Thunder | Spark, then Thunder |
| Entei | Fighter | Fire Fang | Crunch* | Scary Face | Fire Blast | Scary Face, then Fire Blast |
| Suicune | Tank | Surf | Hydro Pump* | Bite | Calm Mind | Bite, then Surf |
| Larvitar → Pupitar → Tyranitar | Fighter ✋ | Crunch / Crunch / Crunch | Tackle / Tackle / Giga Impact | Rock Slide / Rock Slide / Rock Slide | Stone Edge / Stone Edge / Hyper Beam | Rock Slide, then Hyper Beam |
| Lugia | Support ✋ | Extrasensory | Ancient Power | Sky Attack | Recover | Sky Attack, then Extrasensory |
| Ho Oh | Fighter ✋ | Extrasensory | Ancient Power | Sky Attack | Fire Blast | Sky Attack, then Fire Blast |
| Celebi | Marksman | Magical Leaf | Ancient Power | Confusion | Future Sight | Confusion, then Future Sight |
| Treecko → Grovyle → Sceptile | Assassin ✋ | Giga Drain / Leaf Blade / Leaf Blade | Quick Attack / Quick Attack / Quick Attack | Detect / Detect / Detect | Energy Ball / Energy Ball / Energy Ball | Detect, then Energy Ball |
| Torchic → Combusken → Blaziken | Fighter ✋ | Ember / Blaze Kick / Flamethrower | Bounce / Bounce / Bounce | Detect / Detect / Detect | Flamethrower / Flamethrower / Flare Blitz | Detect, then Flare Blitz |
| Mudkip → Marshtomp → Swampert | Tank ✋ | Surf / Muddy Water / Muddy Water | Take Down / Take Down / Take Down | Rock Slide / Mud Shot / Mud Shot | Protect / Protect / Protect | Mud Shot, then Muddy Water |
| Poochyena → Mightyena | Fighter | Assurance / Bite | Sucker Punch / Sucker Punch | Scary Face / Scary Face | Bite / Snarl | Scary Face, then Snarl |
| Zigzagoon → Linoone → Obstagoon | Fighter | Pin Missile / Covet / Slash | Take Down / Take Down / Take Down | Headbutt / Headbutt / Submission | Covet / Slash / Double Edge | Submission, then Double Edge |
| Wurmple → Silcoon → Beautifly | Mage | - / - / Air Cutter | Tackle / Tackle / Tackle | String Shot / String Shot / Stun Spore | Poison Sting / Poison Sting / Leech Life | Stun Spore, then Leech Life |
| Wurmple → Cascoon → Dustox | Support | - / Poison Sting / Bug Buzz | Tackle / Tackle / Tackle | String Shot / String Shot / String Shot | Poison Sting / Harden / Moonlight | String Shot, then Bug Buzz |
| Lotad → Lombre → Ludicolo | Tank | Bubble Beam / Giga Drain / Giga Drain | Zen Headbutt / Zen Headbutt / Zen Headbutt | Astonish / Fake Out / Fake Out | Giga Drain / Energy Ball / Energy Ball | Fake Out, then Energy Ball |
| Seedot → Nuzleaf → Shiftry | Fighter | Payback / Razor Leaf / Razor Leaf | Headbutt / Sucker Punch / Sucker Punch | Astonish / Fake Out / Fake Out | Sucker Punch / Leaf Blade / Leaf Blade | Fake Out, then Leaf Blade |
| Taillow → Swellow | Fighter | Peck / Peck | Wing Attack / Wing Attack | Air Slash / Air Slash | Aerial Ace / Pluck | Air Slash, then Pluck |
| Wingull → Pelipper | Tank | Water Pulse / Water Pulse | Wing Attack / Wing Attack | Air Slash / Air Slash | Roost / Protect | Air Slash, then Water Pulse |
| Ralts → Kirlia → Gardevoir | Mage ✋ | Psychic / Psychic / Psychic | Double Team / Double Team / Double Team | Hypnosis / Hypnosis / Hypnosis | Dream Eater / Dream Eater / Future Sight | Hypnosis, then Future Sight |
| Ralts → Kirlia → Gallade | Fighter ✋ | Psychic / Psychic / Sacred Sword | Double Team / Double Team / Aerial Ace | Hypnosis / Hypnosis / Confusion | Dream Eater / Dream Eater / Future Sight | Confusion, then Future Sight |
| Surskit → Masquerain | Mage | - / Air Cutter | Quick Attack / Quick Attack | - / Stun Spore | Water Gun / Air Slash | Stun Spore, then Air Slash |
| Shroomish → Breloom | Fighter | Giga Drain / Seed Bomb | Headbutt / Headbutt | Stun Spore / Spore | Seed Bomb / Dynamic Punch | Spore, then Dynamic Punch |
| Slakoth → Vigoroth → Slaking | Fighter | Throat Chop / Slash / Slash | Play Rough / Play Rough / Play Rough | Scratch* / Headbutt / Headbutt | Covet / Uproar / Focus Punch | Headbutt, then Focus Punch |
| Nincada → Ninjask | Fighter | Scratch / Bug Bite | Mud Slap* / Dig | False Swipe* / Slash* | Metal Claw / Aerial Ace |  |
| Nincada → Shedinja | Fighter | Scratch / Shadow Claw | Mud Slap* / Dig | False Swipe* / Metal Claw* | Metal Claw / Shadow Ball |  |
| Whismur → Loudred → Exploud | Mage | Echoed Voice / Echoed Voice / Uproar | Stomp* / Stomp* / Hyper Voice* | Astonish / Bite / Bite | Hyper Voice / Hyper Voice / Boomburst | Bite, then Boomburst |
| Makuhita → Hariyama | Tank | Force Palm / Force Palm | Tackle / Tackle | Fake Out / Fake Out | Detect / Detect | Fake Out, then Force Palm |
| Azurill → Marill → Azumarill | Tank ✋ | - / Aqua Tail / Aqua Tail | Bounce / Bounce / Bounce | Bubble Beam / Bubble Beam / Bubble Beam | Water Gun / Play Rough / Play Rough | Bubble Beam, then Play Rough |
| Nosepass → Probopass | Tank | Power Gem / Power Gem | Tackle / Tackle | Zap Cannon / Zap Cannon | Harden / Iron Defense | Zap Cannon, then Power Gem |
| Skitty → Delcatty | Fighter | Covet / Covet | Play Rough / Play Rough | Sing / Sing | Facade / Facade | Sing, then Facade |
| Sableye | Fighter | Shadow Claw | Zen Headbutt | Fake Out | Shadow Ball | Fake Out, then Shadow Ball |
| Mawile | Fighter | Bite | Iron Head | Astonish | Crunch | Astonish, then Crunch |
| Aron → Lairon → Aggron | Tank | Metal Claw / Metal Claw / Metal Claw | Iron Head / Iron Head / Iron Head | Rock Tomb / Rock Tomb / Rock Tomb | Protect / Protect / Protect | Rock Tomb, then Metal Claw |
| Meditite → Medicham | Support | Psybeam / Fire Punch | Zen Headbutt / Zen Headbutt | Force Palm / Force Palm | Work Up / Recover | Force Palm, then Fire Punch |
| Electrike → Manectric | Assassin | Shock Wave / Shock Wave | Wild Charge / Wild Charge | Thunder Wave / Thunder Wave | Discharge / Discharge | Thunder Wave, then Discharge |
| Plusle | Mage | Discharge | Quick Attack | Thunder Wave | Last Resort | Thunder Wave, then Last Resort |
| Minun | Mage | Discharge | Quick Attack | Thunder Wave | Last Resort | Thunder Wave, then Last Resort |
| Volbeat | Tank | Bug Buzz | Play Rough | Zen Headbutt | Protect | Zen Headbutt, then Bug Buzz |
| Illumise | Tank | Struggle Bug | Play Rough | Zen Headbutt | Moonlight | Zen Headbutt, then Struggle Bug |
| Gulpin → Swalot | Support | Sludge Bomb / Sludge Bomb | Sludge* / Belch* | Belch* / Body Slam | Swallow / Swallow | Body Slam, then Sludge Bomb |
| Carvanha → Sharpedo | Fighter | Bite / Night Slash | Take Down / Take Down | Scary Face / Scary Face | Crunch / Crunch | Scary Face, then Crunch |
| Wailmer → Wailord | Tank | Brine / Brine | Dive / Dive | Bounce / Bounce | Amnesia / Amnesia | Bounce, then Brine |
| Numel → Camerupt | Mage | Flamethrower / Earth Power | Take Down / Take Down | Bulldoze / Bulldoze | Earthquake / Earthquake | Bulldoze, then Earthquake |
| Torkoal | Tank | Flamethrower | Body Slam | Smokescreen | Protect | Smokescreen, then Flamethrower |
| Spoink → Grumpig | Tank | Psybeam / Psyshock | Power Gem* / Zen Headbutt | Bounce / Bounce | Psyshock / Belch | Bounce, then Belch |
| Spinda | Fighter | Uproar | Body Slam | Hypnosis | Thrash | Hypnosis, then Thrash |
| Trapinch → Vibrava → Flygon | Fighter | Crunch / Earth Power / Dragon Claw | Dig / Dig / Dig | Bulldoze / Dragon Tail / Dragon Tail | Earth Power / Boomburst / Boomburst | Dragon Tail, then Boomburst |
| Cacnea → Cacturne | Marksman | Bullet Seed / Bullet Seed | Sucker Punch / Sucker Punch | Cotton Spore / Cotton Spore | Payback / Payback | Cotton Spore, then Payback |
| Swablu → Altaria | Tank | Round / Pluck | Take Down / Take Down | Sing / Sing | Moonblast / Sky Attack | Sing, then Sky Attack |
| Zangoose | Fighter | Slash | Quick Attack | X Scissor* | Crush Claw |  |
| Seviper | Marksman | Venoshock | Feint | Glare | Sludge Bomb | Glare, then Sludge Bomb |
| Lunatone | Tank | Psychic | Tackle | Hypnosis | Harden | Hypnosis, then Psychic |
| Solrock | Tank | Stone Edge | Zen Headbutt | Hypnosis | Harden | Hypnosis, then Stone Edge |
| Barboach → Whiscash | Tank | Aqua Tail / Aqua Tail | Future Sight* / Zen Headbutt | Snore / Snore | Amnesia / Amnesia | Snore, then Aqua Tail |
| Corphish → Crawdaunt | Fighter | Crunch / Razor Shell | Night Slash* / Night Slash* | Bubble Beam / Bubble Beam | Razor Shell / Crunch | Bubble Beam, then Crunch |
| Baltoy → Claydol | Tank | Earth Power / Earth Power | Rapid Spin / Rapid Spin | Rock Tomb / Rock Tomb | Harden / Harden | Rock Tomb, then Earth Power |
| Lileep → Cradily | Support | Giga Drain / Giga Drain | Ancient Power / Ancient Power | Astonish / Astonish | Swallow / Swallow | Astonish, then Giga Drain |
| Anorith → Armaldo | Fighter | Smack Down / Smack Down | Ancient Power / Ancient Power | Crush Claw* / Crush Claw* | Bug Bite / Bug Bite |  |
| Feebas → Milotic | Tank ✋ | Surf / Surf | - / Tackle | Dragon Tail / Dragon Tail | Recover / Recover | Dragon Tail, then Surf |
| Castform → Castform Sunny | Marksman | Weather Ball / Ember | Tackle / Headbutt | Hurricane / Hurricane | Blizzard / Blizzard | Hurricane, then Blizzard |
| Castform → Castform Rainy | Marksman | Weather Ball / Water Gun | Tackle / Headbutt | Hurricane / Hurricane | Blizzard / Blizzard | Hurricane, then Blizzard |
| Castform → Castform Snowy | Mage | Weather Ball / Powder Snow | Tackle / Headbutt | Hurricane / Hurricane | Blizzard / Hydro Pump | Hurricane, then Hydro Pump |
| Kecleon | Tank | Foul Play | Sucker Punch | Lick | Detect | Lick, then Foul Play |
| Shuppet → Banette | Fighter | Hex / Knock Off | Sucker Punch / Sucker Punch | Astonish / Astonish | Shadow Ball / Shadow Ball | Astonish, then Shadow Ball |
| Duskull → Dusclops → Dusknoir | Tank | Hex / Shadow Punch / Shadow Punch | Shadow Sneak / Shadow Sneak / Shadow Sneak | Astonish / Astonish / Astonish | Shadow Ball / Shadow Ball / Shadow Ball | Astonish, then Shadow Ball |
| Tropius | Support | Air Slash | Outrage* | Body Slam | Synthesis | Body Slam, then Air Slash |
| Absol | Fighter ✋ | Knock Off | Sucker Punch | Detect | Future Sight | Detect, then Future Sight |
| Wynaut → Wobbuffet | Tank ✋ | Psybeam / Psybeam | Zen Headbutt / Zen Headbutt | Confusion / Confusion | Psychic / Psychic | Confusion, then Psychic |
| Snorunt → Glalie | Mage | Frost Breath / Frost Breath | Headbutt / Headbutt | Icy Wind / Icy Wind | Ice Fang / Freeze Dry | Icy Wind, then Freeze Dry |
| Snorunt → Froslass | Mage | Frost Breath / Hex | Headbutt / Headbutt | Icy Wind / Icy Wind | Ice Fang / Shadow Ball | Icy Wind, then Shadow Ball |
| Spheal → Sealeo → Walrein | Tank | Surf / Surf / Surf | Rollout / Rollout / Rollout | Body Slam / Body Slam / Body Slam | Defense Curl / Defense Curl / Defense Curl | Body Slam, then Surf |
| Clamperl → Huntail | Marksman | Brine / Brine | Dive / Dive | Scary Face / Scary Face | Whirlpool / Aqua Tail | Scary Face, then Aqua Tail |
| Clamperl → Gorebyss | Marksman | Brine / Psychic | Dive / Dive | Scary Face / Water Pulse | Whirlpool / Aqua Tail | Water Pulse, then Aqua Tail |
| Relicanth | Tank | Aqua Tail | Dive | Double Edge* | Harden |  |
| Luvdisc | Mage | Water Gun | Take Down | Water Pulse | Hydro Pump | Water Pulse, then Hydro Pump |
| Bagon → Shelgon → Salamence | Fighter ✋ | Dragon Claw / Dragon Claw / Dragon Claw | Double Edge / Double Edge / Fly | Dragon Breath / Dragon Breath / Dragon Breath | Flamethrower / Flamethrower / Double Edge | Dragon Breath, then Double Edge |
| Beldum → Metang → Metagross | Fighter ✋ | Psychic / Psychic / Psychic | Bullet Punch / Bullet Punch / Bullet Punch | Confusion / Confusion / Confusion | Hyper Beam / Hyper Beam / Hammer Arm | Confusion, then Hammer Arm |
| Regirock | Tank | Stone Edge | Ancient Power | Zap Cannon | Iron Defense | Zap Cannon, then Stone Edge |
| Regice | Tank | Ice Beam | Ancient Power | Zap Cannon | Amnesia | Zap Cannon, then Ice Beam |
| Registeel | Tank | Metal Claw | Iron Head | Zap Cannon | Amnesia | Zap Cannon, then Metal Claw |
| Latias | Mage | Psychic | Zen Headbutt | Dragon Breath | Dragon Pulse | Dragon Breath, then Dragon Pulse |
| Latios | Assassin | Psychic | Zen Headbutt | Dragon Breath | Dragon Pulse | Dragon Breath, then Dragon Pulse |
| Kyogre → Kyogre Primal | Mage | Muddy Water / Muddy Water | Double Edge / Double Edge | Scary Face / Scary Face | Water Spout / Water Spout | Scary Face, then Water Spout |
| Groudon → Groudon Primal | Fighter | Earth Power / Earth Power | Ancient Power / Ancient Power | Mud Shot / Mud Shot | Earthquake / Eruption | Mud Shot, then Eruption |
| Rayquaza | Fighter ✋ | Dragon Pulse | Extreme Speed | Twister | Outrage | Twister, then Outrage |
| Jirachi | Marksman | Psychic | Double Edge | Zen Headbutt | Future Sight | Zen Headbutt, then Future Sight |
| Deoxys | Assassin | Psychic | Psyshock* | Zen Headbutt | Hyper Beam | Zen Headbutt, then Hyper Beam |
| Turtwig → Grotle → Torterra | Tank ✋ | Giga Drain / Giga Drain / Giga Drain | Tackle / Tackle / Tackle | Bite / Bite / Bite | Withdraw / Withdraw / Earthquake | Bite, then Earthquake |
| Chimchar → Monferno → Infernape | Assassin ✋ | Flame Wheel / Flame Wheel / Flame Wheel | Scratch* / Mach Punch / Mach Punch | Acrobatics* / Flamethrower* / Flare Blitz* | Facade / Flare Blitz / Close Combat |  |
| Piplup → Prinplup → Empoleon | Mage ✋ | Brine / Brine / Brine | Pound* / Tackle / Aqua Jet | Bubble Beam / Bubble Beam / Bubble Beam | Drill Peck / Drill Peck / Wave Crash | Bubble Beam, then Wave Crash |
| Starly → Staravia → Staraptor | Fighter | Tackle* / Quick Attack* / Aerial Ace* | Take Down / Take Down / Take Down | Aerial Ace* / Aerial Ace* / Wing Attack* | Wing Attack / Wing Attack / Close Combat |  |
| Bidoof → Bibarel | Fighter | Crunch / Crunch | Tackle / Aqua Jet | Headbutt / Headbutt | Superpower / Superpower | Headbutt, then Superpower |
| Kricketot → Kricketune | Fighter | - / Bug Bite | Tackle / Tackle | - / Sing | Struggle Bug / Bug Buzz | Sing, then Bug Buzz |
| Shinx → Luxio → Luxray | Fighter | Spark / Spark / Spark | Tackle / Tackle / Tackle | Thunder Wave / Thunder Wave / Thunder Wave | Discharge / Discharge / Discharge | Thunder Wave, then Discharge |
| Budew → Roselia → Roserade | Mage | Giga Drain / Giga Drain / Giga Drain | Magical Leaf* / Magical Leaf* / Magical Leaf* | - / Stun Spore / Stun Spore | Absorb / Petal Blizzard / Petal Blizzard | Stun Spore, then Petal Blizzard |
| Cranidos → Rampardos | Fighter | Slam / Slam | Take Down / Take Down | Scary Face / Scary Face | Ancient Power / Ancient Power | Scary Face, then Ancient Power |
| Shieldon → Bastiodon | Tank | Ancient Power / Ancient Power | Take Down / Take Down | Tackle* / Iron Head | Protect / Protect | Iron Head, then Ancient Power |
| Burmy → Wormadam | Tank | - / Bug Buzz | Tackle / Sucker Punch | String Shot / String Shot | Protect / Protect | String Shot, then Bug Buzz |
| Burmy → Mothim | Fighter | - / Bug Bite | Tackle / Tackle | String Shot / String Shot | Protect / Bug Buzz | String Shot, then Bug Buzz |
| Combee → Vespiquen | Tank | Gust / Bug Bite | - / Power Gem* | - / Air Slash | Struggle Bug / Defend Order | Air Slash, then Bug Bite |
| Pachirisu | Fighter | Spark | Quick Attack | Nuzzle | Thunder | Nuzzle, then Thunder |
| Buizel → Floatzel | Assassin | Aqua Tail / Aqua Tail | Aqua Jet / Aqua Jet | Bite / Bite | Hydro Pump / Hydro Pump | Bite, then Hydro Pump |
| Cherubi → Cherrim | Mage | Magical Leaf / Petal Blizzard | Take Down / Take Down | Tackle* / Magical Leaf* | Petal Blizzard / Petal Dance |  |
| Shellos → Gastrodon | Tank | Water Pulse / Earth Power | Ancient Power / Ancient Power | Body Slam / Body Slam | Harden / Harden | Body Slam, then Earth Power |
| Drifloon → Drifblim | Support | Shadow Ball / Shadow Ball | Self Destruct* / Phantom Force | Astonish / Astonish | Swallow / Swallow | Astonish, then Shadow Ball |
| Buneary → Lopunny | Fighter | Double Kick / Pound | Quick Attack / Headbutt | Bounce / Bounce | Pound / High Jump Kick | Bounce, then High Jump Kick |
| Glameow → Purugly | Fighter | Scratch / Slash | Play Rough / Play Rough | Hypnosis / Hypnosis | Slash / Retaliate | Hypnosis, then Retaliate |
| Chingling → Chimecho | Tank | Confusion / Uproar | Wrap* / Take Down | Astonish / Astonish | Uproar / Last Resort | Astonish, then Last Resort |
| Stunky → Skuntank | Fighter | Night Slash / Night Slash | Sucker Punch / Sucker Punch | Smokescreen / Smokescreen | Belch / Belch | Smokescreen, then Belch |
| Bronzor → Bronzong | Tank | Extrasensory / Extrasensory | Tackle / Tackle | Hypnosis / Hypnosis | Iron Defense / Iron Defense | Hypnosis, then Extrasensory |
| Bonsly → Sudowoodo | Tank | Rock Throw / Slam | Sucker Punch / Wood Hammer | Rock Tomb / Rock Tomb | Rock Slide / Stone Edge | Rock Tomb, then Stone Edge |
| Mime Jr → Mr Mime | Mage | Dazzling Gleam / Psybeam | Sucker Punch / Sucker Punch | Confusion / Confusion | Psychic / Dazzling Gleam | Confusion, then Dazzling Gleam |
| Mime Jr → Mr Mime Galar | Mage | Dazzling Gleam / Freeze Dry | Sucker Punch / Sucker Punch | Confusion / Hypnosis | Psychic / Psybeam | Hypnosis, then Psybeam |
| Happiny → Chansey → Blissey | Support ✋ | Disarming Voice / Disarming Voice / Disarming Voice | - / Take Down / Take Down | Pound* / Sing / Sing | Defense Curl / Life Dew / Life Dew | Sing, then Disarming Voice |
| Chatot | Mage | Chatter | Round* | Sing | Uproar | Sing, then Uproar |
| Spiritomb | Tank | Payback | Shadow Sneak | Hypnosis | Shadow Ball | Hypnosis, then Shadow Ball |
| Gible → Gabite → Garchomp | Fighter ✋ | Dragon Claw / Dragon Claw / Dragon Claw | Dig / Dig / Dig | Bulldoze / Bulldoze / Bulldoze | Dragon Breath / Dragon Breath / Crunch | Bulldoze, then Crunch |
| Munchlax → Snorlax | Tank ✋ | Covet / Crunch | Tackle / High Horsepower | Body Slam / Body Slam | Defense Curl / Defense Curl | Body Slam, then Crunch |
| Riolu → Lucario | Marksman ✋ | Metal Claw / Dragon Pulse | Quick Attack / Extreme Speed | Vacuum Wave* / Force Palm | Rock Smash / Close Combat | Force Palm, then Close Combat |
| Hippopotas → Hippowdon | Tank | Crunch / Crunch | Dig / Dig | Bite / Bite | Slack Off / Slack Off | Bite, then Crunch |
| Skorupi → Drapion | Fighter | Bug Bite / Cross Poison | Crunch* / X Scissor* | Scary Face / Scary Face | Cross Poison / Night Slash | Scary Face, then Night Slash |
| Croagunk → Toxicroak | Fighter | Poison Jab / Poison Jab | Sucker Punch / Sucker Punch | Astonish / Astonish | Sludge Bomb / Sludge Bomb | Astonish, then Sludge Bomb |
| Carnivine | Fighter | Crunch | Leaf Tornado* | Vine Whip | Seed Bomb | Vine Whip, then Seed Bomb |
| Finneon → Lumineon | Fighter | Pound / Pound | U Turn / U Turn | Water Pulse / Water Pulse | Water Gun / Water Gun | Water Pulse, then Water Gun |
| Mantyke → Mantine | Support | Air Slash / Air Slash | Wing Attack / Wing Attack | Bounce / Bounce | Agility / Roost | Bounce, then Air Slash |
| Snover → Abomasnow | Fighter | Razor Leaf / Ice Punch | Ice Shard / Ice Shard | Icy Wind / Icy Wind | Blizzard / Blizzard | Icy Wind, then Blizzard |
| Rotom | Marksman | Hex | Double Team | Thunder Wave | Uproar | Thunder Wave, then Uproar |
| Uxie | Mage | Extrasensory | Mystical Power* | Confusion | Psychic | Confusion, then Psychic |
| Mesprit | Mage | Extrasensory | Mystical Power* | Confusion | Psychic | Confusion, then Psychic |
| Azelf | Assassin | Psychic | Last Resort* | Confusion | Future Sight | Confusion, then Future Sight |
| Dialga | Mage | Flash Cannon | Ancient Power | Scary Face | Iron Tail | Scary Face, then Iron Tail |
| Palkia | Mage | Water Pulse | Ancient Power | Scary Face | Hydro Pump | Scary Face, then Hydro Pump |
| Heatran | Mage | Lava Plume | Iron Head | Scary Face | Heat Wave | Scary Face, then Heat Wave |
| Regigigas | Fighter | Facade | Zen Headbutt | Stomp | Mega Punch | Stomp, then Mega Punch |
| Giratina | Fighter ✋ | Shadow Claw | Shadow Sneak | Dragon Breath | Earth Power | Dragon Breath, then Earth Power |
| Cresselia | Support | Psychic | Double Team | Confusion | Moonlight | Confusion, then Psychic |
| Phione | Fighter | Water Gun | Whirlpool* | Water Pulse | Bubble Beam | Water Pulse, then Bubble Beam |
| Manaphy | Mage | Water Gun | Dive | Water Pulse | Bubble Beam | Water Pulse, then Bubble Beam |
| Darkrai | Assassin ✋ | Dark Pulse | Double Team | Hypnosis | Dream Eater | Hypnosis, then Dream Eater |
| Shaymin | Marksman | Magical Leaf | Play Rough | - | Energy Ball |  **(1 empty: needs a hand-written kit)** |
| Arceus | Mage | Hyper Voice | Extreme Speed | Future Sight* | Hyper Beam |  |
| Victini | Fighter | Flame Charge | Flare Blitz | Headbutt | Overheat | Headbutt, then Overheat |
| Snivy → Servine → Serperior | Marksman ✋ | Magical Leaf / Magical Leaf / Magical Leaf | Tackle / Tackle / Tackle | Vine Whip / Vine Whip / Vine Whip | Leaf Blade / Leaf Blade / Leaf Storm | Vine Whip, then Leaf Storm |
| Tepig → Pignite → Emboar | Fighter ✋ | Flame Charge / Flame Charge / Flame Charge | Take Down / Take Down / Take Down | Smog / Smog / Smog | Head Smash / Head Smash / Head Smash | Smog, then Head Smash |
| Oshawott → Dewott → Samurott | Marksman ✋ | Razor Shell / Razor Shell / Razor Shell | Aqua Jet / Aqua Jet / Aqua Jet | Water Pulse / Water Pulse / Water Pulse | Aqua Tail / Aqua Tail / Aqua Tail | Water Pulse, then Aqua Tail |
| Oshawott → Dewott → Samurott Hisui | Marksman | Razor Shell / Razor Shell / Razor Shell | Aqua Jet / Aqua Jet / Sucker Punch | Water Pulse / Water Pulse / Water Pulse | Aqua Tail / Aqua Tail / Aqua Tail | Water Pulse, then Aqua Tail |
| Patrat → Watchog | Fighter | Crunch / Crunch | Tackle / Tackle | Hypnosis / Hypnosis | Slam / Slam | Hypnosis, then Slam |
| Lillipup → Herdier → Stoutland | Tank | Retaliate / Retaliate / Retaliate | Take Down / Take Down / Take Down | Bite / Bite / Bite | Last Resort / Last Resort / Last Resort | Bite, then Last Resort |
| Purrloin → Liepard | Fighter | Assurance / Assurance | Play Rough / Play Rough | Fake Out / Fake Out | Night Slash / Night Slash | Fake Out, then Night Slash |
| Pansage → Simisage | Fighter | Bite / Bite | Acrobatics* / Acrobatics* | Vine Whip / Vine Whip | Crunch / Crunch | Vine Whip, then Crunch |
| Pansear | Marksman | Incinerate | Crunch* | Lick | Flame Burst | Lick, then Flame Burst |
| Panpour | Marksman | Water Gun | Crunch* | Lick | Brine | Lick, then Brine |
| Munna → Musharna | Tank | Psychic / Psychic | Zen Headbutt / Zen Headbutt | Hypnosis / Hypnosis | Defense Curl / Calm Mind | Hypnosis, then Psychic |
| Pidove | Fighter | Gust | Quick Attack | Air Slash | Air Cutter | Air Slash, then Air Cutter |
| Unfezant | Fighter | Gust | Quick Attack | Air Slash | Air Cutter | Air Slash, then Air Cutter |
| Roggenrola → Boldore → Gigalith | Tank | Stone Edge / Stone Edge / Stone Edge | Tackle / Tackle / Tackle | Headbutt / Headbutt / Headbutt | Harden / Harden / Harden | Headbutt, then Stone Edge |
| Woobat → Swoobat | Mage | Air Cutter / Air Cutter | Assurance* / Assurance* | Air Slash / Air Slash | Psychic / Psychic | Air Slash, then Psychic |
| Drilbur → Excadrill | Fighter | Crush Claw / Metal Claw | Dig / Dig | Rock Slide / Rock Slide | Drill Run / Drill Run | Rock Slide, then Drill Run |
| Audino | Support | Hyper Voice | Take Down | Zen Headbutt | Life Dew | Zen Headbutt, then Hyper Voice |
| Timburr → Gurdurr → Conkeldurr | Tank | Hammer Arm / Hammer Arm / Hammer Arm | Superpower* / Superpower* / Superpower* | Dynamic Punch / Dynamic Punch / Dynamic Punch | Bulk Up / Bulk Up / Bulk Up | Dynamic Punch, then Hammer Arm |
| Tympole → Palpitoad → Seismitoad | Mage | Bubble Beam / Bubble Beam / Bubble Beam | Uproar* / Uproar* / Uproar* | Mud Shot / Mud Shot / Mud Shot | Muddy Water / Muddy Water / Muddy Water | Mud Shot, then Muddy Water |
| Sawk | Fighter | Retaliate | Rock Smash* | Low Sweep | Brick Break | Low Sweep, then Brick Break |
| Sewaddle → Swadloon → Leavanny | Fighter | Razor Leaf / Razor Leaf / Leaf Blade | Tackle / Tackle / Tackle | String Shot / String Shot / String Shot | Bug Bite / Bug Bite / Bug Buzz | String Shot, then Bug Buzz |
| Venipede → Whirlipede → Scolipede | Assassin | Bug Bite / Bug Bite / Bug Bite | Take Down / Take Down / Take Down | Venom Drench / Venom Drench / Venom Drench | Venoshock / Venoshock / Double Edge | Venom Drench, then Double Edge |
| Cottonee → Whimsicott | Marksman | Energy Ball / Energy Ball | Giga Drain* / Hurricane* | Stun Spore / Stun Spore | Solar Beam / Moonblast | Stun Spore, then Moonblast |
| Petilil → Lilligant | Mage | Giga Drain / Energy Ball | Magical Leaf* / Quiver Dance | Sleep Powder / Sleep Powder | Energy Ball / Petal Dance | Sleep Powder, then Petal Dance |
| Petilil → Lilligant Hisui | Assassin | Giga Drain / Leaf Blade | Magical Leaf* / Mega Kick* | Sleep Powder / Sleep Powder | Energy Ball / Leaf Storm | Sleep Powder, then Leaf Storm |
| Basculin → Basculegion | Fighter | Crunch / Crunch | Take Down / Phantom Force | Scary Face / Scary Face | Head Smash / Head Smash | Scary Face, then Head Smash |
| Sandile → Krokorok → Krookodile | Fighter | Crunch / Crunch / Crunch | Dig / Dig / Dig | Scary Face / Scary Face / Scary Face | Foul Play / Foul Play / Foul Play | Scary Face, then Foul Play |
| Darumaka → Darmanitan | Fighter | Fire Punch / Fire Punch | Headbutt / Headbutt | Bite / Bite | Thrash / Thrash | Bite, then Thrash |
| Maractus | Mage | Petal Blizzard | Sucker Punch | Cotton Spore | Petal Dance | Cotton Spore, then Petal Dance |
| Dwebble | Tank | X Scissor | Rock Polish | Rock Slide | Withdraw | Rock Slide, then X Scissor |
| Scraggy → Scrafty | Tank | Crunch / Crunch | Head Smash / Head Smash | Scary Face / Scary Face | High Jump Kick / High Jump Kick | Scary Face, then High Jump Kick |
| Sigilyph | Mage | Air Slash | Psybeam* | Hypnosis | Psychic | Hypnosis, then Psychic |
| Yamask → Cofagrigus | Tank | Shadow Ball / Shadow Ball | Dark Pulse* / Dark Pulse* | Astonish / Scary Face | Protect / Protect | Scary Face, then Shadow Ball |
| Yamask → Runerigus | Tank | Shadow Ball / Shadow Claw | Dark Pulse* / Earthquake* | Astonish / Scary Face | Protect / Protect | Scary Face, then Shadow Claw |
| Archen → Archeops | Assassin | Pluck / Pluck | Wing Attack / Wing Attack | Scary Face / Scary Face | Rock Slide / Rock Slide | Scary Face, then Rock Slide |
| Trubbish → Garbodor | Fighter | Sludge Bomb / Sludge Bomb | Take Down / Take Down | Gunk Shot* / Body Slam | Belch / Belch | Body Slam, then Belch |
| Zorua → Zoroark | Assassin ✋ | Knock Off / Night Slash | Agility / U Turn | Scary Face / Scary Face | Foul Play / Foul Play | Scary Face, then Foul Play |
| Minccino → Cinccino | Fighter | Slam / Slam | Swift* / Swift* | Sing / Sing | Hyper Voice / Hyper Voice | Sing, then Hyper Voice |
| Gothita → Gothorita → Gothitelle | Tank | Psyshock / Psyshock / Psyshock | Psybeam* / Psybeam* / Psybeam* | Hypnosis / Hypnosis / Hypnosis | Psychic / Psychic / Psychic | Hypnosis, then Psychic |
| Solosis → Duosion → Reuniclus | Tank | Psychic / Psychic / Psychic | Psyshock* / Psyshock* / Hammer Arm* | Confusion / Confusion / Confusion | Protect / Protect / Protect | Confusion, then Psychic |
| Ducklett → Swanna | Fighter | Bubble Beam / Bubble Beam | Wing Attack / Wing Attack | Hurricane / Hurricane | Air Slash / Air Slash | Hurricane, then Air Slash |
| Vanillite → Vanillish → Vanilluxe | Mage | Uproar / Uproar / Freeze Dry | Avalanche* / Avalanche* / Uproar* | Icy Wind / Icy Wind / Icy Wind | Ice Beam / Ice Beam / Ice Beam | Icy Wind, then Ice Beam |
| Deerling → Sawsbuck | Fighter | Energy Ball / Horn Leech | Take Down / Take Down | Zen Headbutt / Zen Headbutt | Solar Beam / Solar Beam | Zen Headbutt, then Solar Beam |
| Emolga | Marksman | Thunder Shock | Quick Attack | Nuzzle | Volt Switch | Nuzzle, then Volt Switch |
| Karrablast → Escavalier | Tank | Bug Buzz / X Scissor | Take Down / Iron Head | Scary Face / Scary Face | Endure / Endure | Scary Face, then X Scissor |
| Foongus | Support | Giga Drain | Clear Smog* | Spore | Synthesis | Spore, then Giga Drain |
| Alomomola | Tank | Brine | Aqua Jet | Water Pulse | Protect | Water Pulse, then Brine |
| Joltik → Galvantula | Mage | Electroweb / Electroweb | Sucker Punch / Sucker Punch | Thunder Wave / Thunder Wave | Discharge / Discharge | Thunder Wave, then Discharge |
| Ferroseed → Ferrothorn | Tank | Metal Claw / Metal Claw | Tackle / Iron Head | Iron Head / Power Whip | Harden / Harden | Power Whip, then Metal Claw |
| Klink → Klang → Klinklang | Fighter | Gear Grind / Gear Grind / Gear Grind | Autotomize / Autotomize / Autotomize | Zap Cannon / Zap Cannon / Zap Cannon | Hyper Beam / Discharge / Discharge | Zap Cannon, then Discharge |
| Tynamo → Eelektrik → Eelektross | Mage | - / Discharge / Discharge | Tackle / Wild Charge / Wild Charge | Thunder Wave / Thunder Wave / Thunder Wave | Charge Beam / Thunderbolt / Thunderbolt | Thunder Wave, then Thunderbolt |
| Elgyem → Beheeyem | Mage | Confusion / Confusion | Zen Headbutt / Zen Headbutt | Headbutt / Headbutt | Psybeam / Psybeam | Headbutt, then Psybeam |
| Litwick → Lampent → Chandelure | Marksman ✋ | Shadow Ball / Shadow Ball / Shadow Ball | Hex* / Hex* / Hex* | Will O Wisp / Will O Wisp / Will O Wisp | Inferno / Inferno / Inferno | Will O Wisp, then Inferno |
| Axew → Fraxure → Haxorus | Fighter | Dragon Claw / Dragon Claw / Dragon Claw | Giga Impact / Giga Impact / Giga Impact | Scary Face / Scary Face / Scary Face | Dragon Pulse / Dragon Pulse / Dragon Pulse | Scary Face, then Dragon Pulse |
| Cubchoo → Beartic | Fighter | Slash / Slash | Brine* / Aqua Jet | Icy Wind / Icy Wind | Thrash / Icicle Crash | Icy Wind, then Icicle Crash |
| Cryogonal | Support | Ice Beam | Ice Shard | Icy Wind | Recover | Icy Wind, then Ice Beam |
| Accelgor | Assassin | Giga Drain | U Turn | Body Slam | Struggle Bug | Body Slam, then Struggle Bug |
| Mienfoo → Mienshao | Assassin | Drain Punch / Drain Punch | Bounce / Bounce | Fake Out / Fake Out | Aura Sphere / Aura Sphere | Fake Out, then Aura Sphere |
| Druddigon | Tank | Crunch | Iron Head | Dragon Tail | Dragon Claw | Dragon Tail, then Dragon Claw |
| Golett → Golurk | Fighter | Stomping Tantrum / Stomping Tantrum | Phantom Force / Phantom Force | Dynamic Punch / Dynamic Punch | Shadow Ball / High Horsepower | Dynamic Punch, then High Horsepower |
| Pawniard → Bisharp → Kingambit | Tank | Night Slash / Night Slash / Night Slash | Slash* / Slash* / Iron Head | Scary Face / Scary Face / Scary Face | Iron Defense / Iron Defense / Iron Defense | Scary Face, then Night Slash |
| Rufflet → Braviary | Fighter | Slash / Crush Claw | Brave Bird / Brave Bird | Scary Face / Scary Face | Crush Claw / Thrash | Scary Face, then Thrash |
| Rufflet → Braviary Hisui | Marksman | Slash / Esper Wing | Brave Bird / Brave Bird | Scary Face / Scary Face | Crush Claw / Hurricane | Scary Face, then Hurricane |
| Vullaby → Mandibuzz | Tank | Knock Off / Knock Off | Brave Bird / Brave Bird | Air Slash / Sky Attack | Iron Defense / Iron Defense | Sky Attack, then Knock Off |
| Heatmor | Marksman | Incinerate | Flare Blitz | Lick | Fire Lash | Lick, then Fire Lash |
| Durant | Assassin | Bug Bite | Dig | Bite | Iron Head | Bite, then Iron Head |
| Deino → Zweilous → Hydreigon | Mage ✋ | Dragon Pulse / Dragon Pulse / Dragon Pulse | Body Slam / Body Slam / Body Slam | Dragon Breath / Dragon Breath / Dragon Breath | Dragon Rush / Dragon Rush / Hyper Beam | Dragon Breath, then Hyper Beam |
| Larvesta → Volcarona | Mage ✋ | Leech Life / Fiery Dance | Take Down / Quiver Dance | String Shot / String Shot | Bug Buzz / Flare Blitz | String Shot, then Flare Blitz |
| Cobalion | Fighter | Metal Claw | Take Down | Iron Head | Sacred Sword | Iron Head, then Sacred Sword |
| Terrakion | Fighter | Sacred Sword | Take Down | Rock Slide | Stone Edge | Rock Slide, then Stone Edge |
| Virizion | Fighter | Sacred Sword | Quick Attack | Leaf Blade* | Close Combat |  |
| Tornadus | Assassin | Air Slash | Agility | Hurricane | Thrash | Hurricane, then Thrash |
| Thundurus | Assassin | Volt Switch | Agility | Discharge | Thunder | Discharge, then Thunder |
| Reshiram | Mage | Flamethrower | Ancient Power | Dragon Breath | Outrage | Dragon Breath, then Outrage |
| Zekrom | Fighter | Dragon Claw | Zen Headbutt | Dragon Breath | Outrage | Dragon Breath, then Outrage |
| Landorus | Mage | Earth Power | Outrage* | Bulldoze | Earthquake | Bulldoze, then Earthquake |
| Kyurem | Fighter | Ice Beam | Ancient Power | Glaciate | Blizzard | Glaciate, then Blizzard |
| Keldeo | Mage | Secret Sword | Take Down | Bubble Beam | Close Combat | Bubble Beam, then Close Combat |
| Meloetta | Mage | Relic Song | U Turn | Sing | Hyper Voice | Sing, then Hyper Voice |
| Genesect | Mage | Bug Buzz | Quick Attack | Zap Cannon | Self Destruct | Zap Cannon, then Self Destruct |
| Chespin → Quilladin → Chesnaught | Tank ✋ | Seed Bomb / Seed Bomb / Seed Bomb | Body Slam / Body Slam / Body Slam | Vine Whip / Vine Whip / Vine Whip | Take Down / Bulk Up / Spiky Shield | Vine Whip, then Seed Bomb |
| Fennekin → Braixen → Delphox | Mage ✋ | Psychic / Psychic / Mystical Fire | Flame Charge / Flame Charge / Flame Charge | Will O Wisp / Will O Wisp / Will O Wisp | Flamethrower / Flamethrower / Fire Blast | Will O Wisp, then Fire Blast |
| Froakie → Frogadier → Greninja | Assassin ✋ | Water Gun / Water Gun / Water Pulse | Double Team / Double Team / Double Team | Smokescreen / Smokescreen / Smokescreen | Water Pulse / Water Pulse / Night Slash | Smokescreen, then Night Slash |
| Bunnelby → Diggersby | Tank | Dig / Dig | Bounce / Bounce | Mud Shot / Mud Shot | Earthquake / Take Down | Mud Shot, then Take Down |
| Fletchling → Fletchinder → Talonflame | Fighter | Steel Wing / Flame Charge / Acrobatics | Aerial Ace / Aerial Ace / Fly | Quick Attack* / Steel Wing* / Steel Wing* | Acrobatics / Acrobatics / Brave Bird |  |
| Scatterbug → Spewpa → Vivillon | Mage | - / - / Struggle Bug | Tackle / Tackle / Tackle | Stun Spore / String Shot / Sleep Powder | - / Bug Bite / Bug Buzz | Sleep Powder, then Bug Buzz |
| Litleo | Mage | Hyper Voice | Take Down | Headbutt | Flamethrower | Headbutt, then Flamethrower |
| Flabebe → Floette → Florges | Tank | Moonblast / Moonblast / Moonblast | Tackle / Tackle / Tackle | Vine Whip / Vine Whip / Vine Whip | Synthesis / Synthesis / Synthesis | Vine Whip, then Moonblast |
| Skiddo → Gogoat | Fighter | Horn Leech / Seed Bomb | Take Down / Take Down | Vine Whip / Vine Whip | Seed Bomb / Leaf Blade | Vine Whip, then Leaf Blade |
| Pancham → Pangoro | Fighter | Crunch / Night Slash | Body Slam / Body Slam | Circle Throw / Circle Throw | Low Sweep / Crunch | Circle Throw, then Crunch |
| Furfrou | Fighter | Bite | Sucker Punch | Headbutt | Retaliate | Headbutt, then Retaliate |
| Espurr → Meowstic | Mage | Confusion / Psybeam | Covet* / Sucker Punch | Fake Out / Fake Out | Psybeam / Psyshock | Fake Out, then Psyshock |
| Honedge → Doublade → Aegislash | Tank ✋ | Sacred Sword / Sacred Sword / Sacred Sword | Shadow Sneak / Shadow Sneak / Shadow Sneak | Slash* / Slash* / Iron Head | Iron Defense / Iron Defense / Iron Defense | Iron Head, then Sacred Sword |
| Spritzee | Tank | Psychic | Fairy Wind* | Draining Kiss* | Calm Mind |  |
| Swirlix → Slurpuff | Fighter | Draining Kiss / Draining Kiss | Tackle / Tackle | String Shot / String Shot | Energy Ball / Energy Ball | String Shot, then Energy Ball |
| Inkay → Malamar | Fighter | Night Slash / Night Slash | Tackle / Tackle | Hypnosis / Hypnosis | Superpower / Superpower | Hypnosis, then Superpower |
| Binacle → Barbaracle | Tank | Razor Shell / Razor Shell | Ancient Power / Ancient Power | Cross Chop* / Cross Chop* | Withdraw / Withdraw |  |
| Skrelp → Dragalge | Tank | Sludge Bomb / Dragon Pulse | Tackle / Tackle | Smokescreen / Smokescreen | Aqua Tail / Sludge Bomb | Smokescreen, then Sludge Bomb |
| Clauncher → Clawitzer | Marksman | Water Pulse / Water Pulse | Aqua Jet / Aqua Jet | Bounce / Bounce | Crabhammer / Crabhammer | Bounce, then Crabhammer |
| Helioptile → Heliolisk | Assassin | Volt Switch / Discharge | Quick Attack / Quick Attack | Thunder Wave / Thunder Wave | Thunderbolt / Thunderbolt | Thunder Wave, then Thunderbolt |
| Tyrunt → Tyrantrum | Fighter | Crunch / Dragon Claw | Tackle / Giga Impact | Dragon Tail / Dragon Tail | Rock Slide / Rock Slide | Dragon Tail, then Rock Slide |
| Amaura → Aurorus | Tank | Ice Beam / Ice Beam | Ancient Power / Ancient Power | Thunder Wave / Thunder Wave | Hyper Beam / Hyper Beam | Thunder Wave, then Hyper Beam |
| Hawlucha | Fighter | Brick Break | Wing Attack | Bounce | Sky Attack | Bounce, then Sky Attack |
| Dedenne | Mage | Volt Switch | Play Rough | Nuzzle | Discharge | Nuzzle, then Discharge |
| Carbink | Tank | Stone Edge | Tackle | Rock Slide | Harden | Rock Slide, then Stone Edge |
| Goomy → Sliggoo → Goodra | Mage ✋ | Dragon Pulse / Dragon Pulse / Dragon Pulse | Body Slam / Body Slam / Body Slam | Dragon Breath / Dragon Breath / Dragon Breath | Muddy Water / Muddy Water / Muddy Water | Dragon Breath, then Muddy Water |
| Goomy → Sliggoo Hisui → Goodra Hisui | Tank | Dragon Pulse / Dragon Pulse / Dragon Pulse | Body Slam / Iron Head / Iron Head | Dragon Breath / Dragon Breath / Dragon Breath | Muddy Water / Protect / Protect | Dragon Breath, then Dragon Pulse |
| Klefki | Fighter | Foul Play | Play Rough | Astonish | Flash Cannon | Astonish, then Flash Cannon |
| Phantump → Trevenant | Fighter | Branch Poke / Shadow Claw | Phantom Force / Phantom Force | Astonish / Astonish | Horn Leech / Horn Leech | Astonish, then Horn Leech |
| Pumpkaboo → Gourgeist | Tank | Razor Leaf / Razor Leaf | Shadow Sneak / Phantom Force | Scary Face / Scary Face | Shadow Ball / Seed Bomb | Scary Face, then Seed Bomb |
| Bergmite → Avalugg | Tank | Ice Fang / Icicle Crash | Take Down / Take Down | Icy Wind / Icy Wind | Protect / Protect | Icy Wind, then Icicle Crash |
| Bergmite → Avalugg Hisui | Tank | Ice Fang / Stone Edge | Take Down / Take Down | Icy Wind / Icy Wind | Protect / Protect | Icy Wind, then Stone Edge |
| Noibat → Noivern | Mage | Air Cutter / Dragon Pulse | Wing Attack / Wing Attack | Bite / Bite | Air Slash / Boomburst | Bite, then Boomburst |
| Xerneas | Fighter | Horn Leech | Take Down | Megahorn* | Giga Impact |  |
| Yveltal | Mage | Dark Pulse | Phantom Force | Hurricane | Sky Attack | Hurricane, then Sky Attack |
| Zygarde | Fighter | Lands Wrath | Dig | Glare | Outrage | Glare, then Outrage |
| Diancie | Tank | Stone Edge | Tackle | Rock Slide | Harden | Rock Slide, then Stone Edge |
| Hoopa → Hoopa Unbound | Fighter | Shadow Ball / Knock Off | Phantom Force / Phantom Force | Astonish / Astonish | Psychic / Psychic | Astonish, then Psychic |
| Volcanion | Mage | Scald | Flare Blitz | Scary Face | Explosion | Scary Face, then Explosion |
| Rowlet → Dartrix → Decidueye | Marksman ✋ | Leaf Blade / Leaf Blade / Leaf Blade | Sucker Punch / Sucker Punch / Phantom Force | Astonish / Astonish / Astonish | Pluck / Pluck / Spirit Shackle | Astonish, then Spirit Shackle |
| Rowlet → Dartrix → Decidueye Hisui | Fighter | Leaf Blade / Leaf Blade / Leaf Blade | Sucker Punch / Sucker Punch / Brave Bird | Astonish / Astonish / Astonish | Pluck / Pluck / Leaf Storm | Astonish, then Leaf Storm |
| Litten → Torracat → Incineroar | Fighter ✋ | Fire Fang / Fire Fang / Fire Fang | Thrash* / Thrash* / Thrash* | Lick / Lick / Lick | Flamethrower / Flamethrower / Darkest Lariat | Lick, then Darkest Lariat |
| Popplio → Brionne → Primarina | Mage ✋ | Bubble Beam / Bubble Beam / Bubble Beam | Aqua Jet / Aqua Jet / Aqua Jet | Sing / Sing / Sing | Moonblast / Moonblast / Moonblast | Sing, then Moonblast |
| Pikipek | Fighter | Pluck | Rock Smash* | Echoed Voice* | Hyper Voice |  |
| Yungoos | Fighter | Bite | Take Down | Scary Face | Crunch | Scary Face, then Crunch |
| Grubbin → Charjabug → Vikavolt | Mage | Crunch / Spark / Thunderbolt | Dig / Dig / Fly | String Shot / String Shot / String Shot | Bug Bite / Discharge / Bug Buzz | String Shot, then Bug Buzz |
| Crabrawler → Crabominable | Fighter | Slam / Ice Punch | Crabhammer* / Crabhammer* | Dynamic Punch / Dynamic Punch | Brick Break / Close Combat | Dynamic Punch, then Close Combat |
| Oricorio | Mage | Air Cutter | Agility | Hurricane | Air Slash | Hurricane, then Air Slash |
| Cutiefly → Ribombee | Mage | Draining Kiss / Dazzling Gleam | Quiver Dance / Quiver Dance | Stun Spore / Stun Spore | Dazzling Gleam / Bug Buzz | Stun Spore, then Bug Buzz |
| Rockruff → Lycanroc | Assassin | Crunch / Crunch | Tackle / Sucker Punch | Rock Tomb / Rock Tomb | Rock Slide / Rock Slide | Rock Tomb, then Rock Slide |
| Wishiwashi | Marksman | Brine | Dive | Double Edge* | Aqua Tail |  |
| Mareanie → Toxapex | Support ✋ | Poison Jab / Poison Jab | Venoshock* / Liquidation* | Toxic / Toxic | Recover / Recover | Toxic, then Poison Jab |
| Mudbray → Mudsdale | Tank | Strength / Strength | High Horsepower / High Horsepower | Bulldoze / Bulldoze | Iron Defense / Iron Defense | Bulldoze, then Strength |
| Dewpider → Araquanid | Tank | Leech Life / Lunge | Headbutt / Headbutt | Bite / Bite | Lunge / Liquidation | Bite, then Liquidation |
| Fomantis → Lurantis | Tank | Leaf Blade / Leaf Blade | Slash* / Petal Blizzard* | X Scissor* / Solar Beam* | Synthesis / Synthesis |  |
| Morelull | Tank | Dazzling Gleam | Dream Eater* | Sleep Powder | Moonlight | Sleep Powder, then Dazzling Gleam |
| Salandit → Salazzle | Assassin | Incinerate / Venoshock | Poison Fang* / Knock Off* | Dragon Pulse* / Dragon Pulse* | Venoshock / Fire Lash |  |
| Stufful → Bewear | Tank | Strength / Strength | Take Down / Take Down | Double Edge* / Double Edge* | Endure / Endure |  |
| Bounsweet → Steenee → Tsareena | Tank | - / Razor Leaf / Trop Kick | Rapid Spin / Rapid Spin / Rapid Spin | - / Stomp / Stomp | Magical Leaf / Magical Leaf / Leaf Storm | Stomp, then Leaf Storm |
| Comfey | Marksman | Petal Blizzard | Play Rough | Vine Whip | Petal Dance | Vine Whip, then Petal Dance |
| Passimian | Fighter | Rock Smash | Take Down | Scary Face | Giga Impact | Scary Face, then Giga Impact |
| Wimpod → Golisopod | Tank | Liquidation / Liquidation | Sucker Punch / Sucker Punch | Mud Shot / Mud Shot | Defense Curl / Defense Curl | Mud Shot, then Liquidation |
| Sandygast → Palossand | Tank | Earth Power / Earth Power | Shadow Ball* / Shadow Ball* | Hypnosis / Hypnosis | Harden / Harden | Hypnosis, then Earth Power |
| Pyukumuku | Support ✋ | Water Gun | Rollout | Toxic | Recover | Toxic, then Water Gun |
| Type Null → Silvally | Fighter | Crush Claw / Crush Claw | Take Down / Take Down | Scary Face / Scary Face | Tri Attack / Explosion | Scary Face, then Explosion |
| Minior | Tank | Power Gem | Take Down | Explosion* | Defense Curl |  |
| Komala | Fighter | Rapid Spin* | Wood Hammer | Sucker Punch* | Slam |  |
| Turtonator | Tank | Flamethrower | Tackle | Body Slam | Protect | Body Slam, then Flamethrower |
| Togedemaru | Fighter | Zing Zap | Tackle | Nuzzle | Discharge | Nuzzle, then Discharge |
| Mimikyu | Fighter ✋ | Shadow Claw | Shadow Sneak | Astonish | Wood Hammer | Astonish, then Wood Hammer |
| Bruxish | Fighter | Psychic Fangs | Aqua Jet | Astonish | Aqua Tail | Astonish, then Aqua Tail |
| Drampa | Tank | Hyper Voice | Fly | Glare | Protect | Glare, then Hyper Voice |
| Dhelmise | Fighter | Slam | Phantom Force | Astonish | Energy Ball | Astonish, then Energy Ball |
| Jangmo O → Hakamo O → Kommo O | Marksman ✋ | Dragon Claw / Dragon Claw / Dragon Claw | Headbutt / Headbutt / Clangorous Soul | Dragon Tail / Dragon Tail / Dragon Tail | Tackle / Close Combat / Outrage | Dragon Tail, then Outrage |
| Tapu Koko | Assassin | Shock Wave | Brave Bird | Spark | Discharge | Spark, then Discharge |
| Tapu Lele | Mage | Psyshock | Psybeam* | Astonish | Extrasensory | Astonish, then Extrasensory |
| Tapu Bulu | Fighter | Horn Leech | Wood Hammer | Scary Face | Megahorn | Scary Face, then Megahorn |
| Tapu Fini | Tank | Surf | Hydro Pump* | Water Pulse | Withdraw | Water Pulse, then Surf |
| Cosmog → Cosmoem → Solgaleo | Fighter | Crunch / Crunch / Crunch | Zen Headbutt / Zen Headbutt / Zen Headbutt | Iron Head / Iron Head / Iron Head | Giga Impact / Giga Impact / Giga Impact | Iron Head, then Giga Impact |
| Cosmog → Cosmoem → Lunala | Marksman | Crunch / Crunch / Psychic | Zen Headbutt / Zen Headbutt / Phantom Force | Iron Head / Iron Head / Hypnosis | Giga Impact / Giga Impact / Dream Eater | Hypnosis, then Dream Eater |
| Nihilego | Marksman | Venoshock | Headbutt | Venom Drench | Power Gem | Venom Drench, then Power Gem |
| Buzzwole | Tank | Lunge | Superpower* | Vital Throw | Endure | Vital Throw, then Lunge |
| Pheromosa | Assassin | Lunge | Rapid Spin | Bounce | Bug Buzz | Bounce, then Bug Buzz |
| Xurkitree | Mage | Discharge | Power Whip* | Hypnosis | Thunderbolt | Hypnosis, then Thunderbolt |
| Celesteela | Tank | Flash Cannon | Double Edge | Giga Drain* | Harden |  |
| Kartana | Assassin | Razor Leaf | Aerial Ace | Night Slash* | Sacred Sword |  |
| Guzzlord | Tank | Crunch | Giga Impact | Dragon Tail | Swallow | Dragon Tail, then Crunch |
| Necrozma | Marksman | Power Gem | Slash* | Confusion | Photon Geyser | Confusion, then Photon Geyser |
| Magearna | Mage | Aura Sphere | Iron Head | Zap Cannon | Flash Cannon | Zap Cannon, then Flash Cannon |
| Marshadow | Assassin | Drain Punch | Sucker Punch | Force Palm | Close Combat | Force Palm, then Close Combat |
| Poipole → Naganadel | Assassin | Dragon Pulse / Venoshock | Fell Stinger* / Dragon Rush | Venom Drench / Venom Drench | Venoshock / Poison Jab | Venom Drench, then Poison Jab |
| Stakataka | Tank | Rock Slide | Iron Head | Stomp | Protect | Stomp, then Rock Slide |
| Blacephalon | Assassin | Shadow Ball | Mystical Fire* | Hypnosis | Fire Blast | Hypnosis, then Fire Blast |
| Zeraora | Assassin | Thunder Punch | Wild Charge | Fake Out | Discharge | Fake Out, then Discharge |
| Meltan → Melmetal | Tank | Thunder Shock / Mega Punch | Headbutt / Headbutt | Thunder Wave / Dynamic Punch | Harden / Protect | Dynamic Punch, then Mega Punch |
| Grookey → Thwackey → Rillaboom | Fighter ✋ | Razor Leaf / Razor Leaf / Razor Leaf | Knock Off* / Knock Off* / Uproar* | Slam* / Slam* / Drum Beating | Uproar / Uproar / Boomburst | Drum Beating, then Boomburst |
| Scorbunny → Raboot → Cinderace | Assassin ✋ | Flame Charge / Flame Charge / Flame Charge | Bounce / Bounce / Bounce | Headbutt / Headbutt / Headbutt | Ember / Ember / Double Edge | Headbutt, then Double Edge |
| Sobble → Drizzile → Inteleon | Assassin ✋ | Water Gun / Water Gun / Snipe Shot | U Turn / U Turn / U Turn | Water Pulse / Water Pulse / Water Pulse | Sucker Punch / Sucker Punch / Liquidation | Water Pulse, then Liquidation |
| Skwovet → Greedent | Tank | Bullet Seed / Covet | Tackle / Tackle | Bite / Bite | Stuff Cheeks / Stuff Cheeks | Bite, then Covet |
| Rookidee → Corvisquire → Corviknight | Tank ✋ | Drill Peck / Drill Peck / Drill Peck | Peck* / Peck* / Steel Wing* | Scary Face / Scary Face / Scary Face | Pluck / Pluck / Iron Defense | Scary Face, then Drill Peck |
| Blipbug → Dottler → Orbeetle | Mage | Psybeam / - / Psychic | Agility / - / Agility | Confusion / Confusion / Hypnosis | Bug Buzz / Struggle Bug / Bug Buzz | Hypnosis, then Bug Buzz |
| Nickit → Thievul | Mage | Snarl / Snarl | Sucker Punch / Sucker Punch | Assurance* / Thief* | Night Slash / Night Slash |  |
| Gossifleur → Eldegoss | Support | Leaf Tornado / Leaf Tornado | Rapid Spin / Rapid Spin | Sing / Sing | Synthesis / Synthesis | Sing, then Leaf Tornado |
| Wooloo → Dubwool | Tank | Double Kick / Double Kick | Take Down / Take Down | Headbutt / Headbutt | Defense Curl / Defense Curl | Headbutt, then Double Kick |
| Chewtle → Drednaw | Fighter | Bite / Razor Shell | Headbutt / Body Slam | Body Slam / Rock Tomb | Jaw Lock / Liquidation | Rock Tomb, then Liquidation |
| Yamper → Boltund | Fighter | Crunch / Crunch | Play Rough / Play Rough | Nuzzle / Nuzzle | Spark / Spark | Nuzzle, then Spark |
| Applin → Flapple | Fighter | Grav Apple / Grav Apple | Fly / Fly | Dragon Breath / Dragon Breath | Dragon Pulse / Dragon Pulse | Dragon Breath, then Dragon Pulse |
| Applin → Appletun | Tank | Grav Apple / Dragon Pulse | Fly / Headbutt | Dragon Breath / Body Slam | Dragon Pulse / Protect | Body Slam, then Dragon Pulse |
| Applin → Dipplin → Hydrapple | Tank | Grav Apple / Dragon Pulse / Energy Ball | Fly / Dragon Breath* / Dragon Pulse* | Dragon Breath / Dragon Tail / Dragon Tail | Dragon Pulse / Protect / Protect | Dragon Tail, then Energy Ball |
| Silicobra → Sandaconda | Tank | Slam / Slam | Dig / Headbutt | Bulldoze / Glare | Coil / Coil | Glare, then Slam |
| Cramorant | Marksman | Water Gun | Dive | Thrash* | Drill Peck |  |
| Arrokuda → Barraskewda | Assassin | Crunch / Throat Chop | Dive / Dive | Bite / Bite | Double Edge / Double Edge | Bite, then Double Edge |
| Toxel → Toxtricity | Mage | - / Discharge | - / Shift Gear | Nuzzle / Nuzzle | Acid / Boomburst | Nuzzle, then Boomburst |
| Sizzlipede → Centiskorch | Fighter | Lunge / Fire Lash | Slam* / Slam* | Smokescreen / Smokescreen | Fire Lash / Inferno | Smokescreen, then Inferno |
| Clobbopus → Grapploct | Tank | Brick Break / Brick Break | Feint / Feint | Submission / Submission | Detect / Detect | Submission, then Brick Break |
| Sinistea → Polteageist | Marksman | Mega Drain / Mega Drain | Sucker Punch / Sucker Punch | Astonish / Astonish | Giga Drain / Giga Drain | Astonish, then Giga Drain |
| Hatenna → Hattrem → Hatterene | Mage | Dazzling Gleam / Dazzling Gleam / Psybeam | Disarming Voice* / Brutal Swing* / Psycho Cut* | Confusion / Confusion / Confusion | Psybeam / Psybeam / Dazzling Gleam | Confusion, then Dazzling Gleam |
| Impidimp → Morgrem → Grimmsnarl | Fighter | Bite / False Surrender / False Surrender | Play Rough / Play Rough / Play Rough | Fake Out / Fake Out / Fake Out | Foul Play / Foul Play / Dark Pulse | Fake Out, then Dark Pulse |
| Alcremie | Tank | Draining Kiss | Tackle | - | Acid Armor |  **(1 empty: needs a hand-written kit)** |
| Pincurchin | Tank | Poison Jab | Discharge* | Spark | Charge | Spark, then Poison Jab |
| Snom → Frosmoth | Mage | Aurora Beam / Aurora Beam | Quiver Dance / Quiver Dance | Powder Snow / Stun Spore | Bug Buzz / Bug Buzz | Stun Spore, then Bug Buzz |
| Eiscue | Tank | Freeze Dry | Headbutt | Icy Wind | Amnesia | Icy Wind, then Freeze Dry |
| Indeedee | Mage | Disarming Voice | Stored Power* | Psybeam | Psychic | Psybeam, then Psychic |
| Morpeko | Fighter | Bite | Quick Attack | Spark | Crunch | Spark, then Crunch |
| Dracozolt | Fighter | Bolt Beak | Aerial Ace | Dragon Tail | Dragon Pulse | Dragon Tail, then Dragon Pulse |
| Arctozolt | Mage | Freeze Dry | Ancient Power | Discharge | Bolt Beak | Discharge, then Bolt Beak |
| Dracovish | Tank | Fishious Rend | Tackle | Dragon Breath | Protect | Dragon Breath, then Fishious Rend |
| Duraludon → Archaludon | Mage | Breaking Swipe / Flash Cannon | Dragon Claw* / Dragon Claw* | Dragon Tail / Dragon Tail | Flash Cannon / Hyper Beam | Dragon Tail, then Hyper Beam |
| Dreepy → Drakloak → Dragapult | Assassin ✋ | - / Bite / Dragon Darts | Quick Attack / Phantom Force / Phantom Force | Astonish / Astonish / Dragon Breath | Infestation / Dragon Pulse / Dragon Pulse | Dragon Breath, then Dragon Pulse |
| Zacian | Fighter | Sacred Sword | Iron Head | Bite | Moonblast | Bite, then Moonblast |
| Zamazenta | Fighter | Crunch | Giga Impact | Bite | Moonblast | Bite, then Moonblast |
| Eternatus | Mage | Dragon Pulse | Agility | Dragon Tail | Outrage | Dragon Tail, then Outrage |
| Kubfu → Urshifu | Fighter | Brick Break / Wicked Blow | Iron Head / Sucker Punch | Dynamic Punch / Dynamic Punch | Close Combat / Close Combat | Dynamic Punch, then Close Combat |
| Regieleki | Assassin | Thunderbolt | Extreme Speed | Zap Cannon | Hyper Beam | Zap Cannon, then Hyper Beam |
| Regidrago | Mage | Dragon Claw | Ancient Power | Dragon Breath | Explosion | Dragon Breath, then Explosion |
| Glastrier | Tank | Avalanche | Take Down | Stomp | Iron Defense | Stomp, then Avalanche |
| Spectrier | Assassin | Hex | Take Down | Stomp | Thrash | Stomp, then Thrash |
| Calyrex | Support | Energy Ball | Future Sight* | Confusion | Life Dew | Confusion, then Energy Ball |
| Enamorus | Assassin | Dazzling Gleam | Superpower* | Astonish | Moonblast | Astonish, then Moonblast |
| Sprigatito → Floragato → Meowscarada | Assassin ✋ | Slash / Seed Bomb / Flower Trick | Quick Attack / Quick Attack / Quick Attack | Bite / Bite / Bite | Energy Ball / Energy Ball / Energy Ball | Bite, then Energy Ball |
| Fuecoco → Crocalor → Skeledirge | Tank ✋ | Incinerate / Incinerate / Torch Song | Tackle / Tackle / Tackle | Bite / Will O Wisp / Will O Wisp | Flamethrower / Flamethrower / Fire Blast | Will O Wisp, then Fire Blast |
| Quaxly → Quaxwell → Quaquaval | Fighter ✋ | Acrobatics / Acrobatics / Aqua Step | Aqua Jet / Aqua Jet / Aqua Jet | Air Slash / Low Sweep / Low Sweep | Aqua Cutter / Aqua Cutter / Wave Crash | Low Sweep, then Wave Crash |
| Lechonk → Oinkologne | Tank | Covet / Covet | Dig / Dig | Mud Shot / Mud Shot | Take Down / Take Down | Mud Shot, then Take Down |
| Spidops | Tank | Bug Bite | Headbutt | Circle Throw | Skitter Smack | Circle Throw, then Skitter Smack |
| Nymble → Lokix | Fighter | Assurance / Throat Chop | Sucker Punch / First Impression | Astonish / Bounce | Bug Bite / Lunge | Bounce, then Lunge |
| Pawmi → Pawmo → Pawmot | Assassin | Spark / Spark / Spark | Dig / Dig / Dig | Nuzzle / Nuzzle / Nuzzle | Discharge / Discharge / Close Combat | Nuzzle, then Close Combat |
| Tandemaus → Maushold | Fighter | Pound / Pound | Play Rough / Play Rough | Double Hit* / Double Hit* | Echoed Voice / Echoed Voice |  |
| Fidough → Dachsbun | Fighter | Crunch / Crunch | Play Rough / Play Rough | Lick / Lick | Double Edge / Double Edge | Lick, then Double Edge |
| Smoliv | Tank | Terrain Pulse | Tackle | Razor Leaf* | Seed Bomb |  |
| Arboliva | Tank | Petal Blizzard | Tackle | Seed Bomb* | Energy Ball |  |
| Nacli → Naclstack → Garganacl | Tank | Stone Edge / Stone Edge / Stone Edge | Headbutt / Headbutt / Headbutt | Mud Shot / Mud Shot / Mud Shot | Harden / Harden / Harden | Mud Shot, then Stone Edge |
| Charcadet → Armarouge | Mage | Ember / Psyshock | Flame Charge / Flame Charge | Astonish / Astonish | Incinerate / Flamethrower | Astonish, then Flamethrower |
| Charcadet → Ceruledge | Fighter | Ember / Shadow Claw | Flame Charge / Flare Blitz | Astonish / Astonish | Incinerate / Lava Plume | Astonish, then Lava Plume |
| Tadbulb → Bellibolt | Tank | Discharge / Discharge | Sucker Punch / Sucker Punch | Mud Shot / Mud Shot | Charge / Charge | Mud Shot, then Discharge |
| Wattrel → Kilowattrel | Assassin | Uproar / Volt Switch | Quick Attack / Quick Attack | Spark / Spark | Volt Switch / Discharge | Spark, then Discharge |
| Bramblin | Fighter | Hex | Phantom Force | Astonish | Giga Drain | Astonish, then Giga Drain |
| Capsakid → Scovillain | Mage | Razor Leaf / Flamethrower | Zen Headbutt / Zen Headbutt | Bite / Bite | Seed Bomb / Solar Beam | Bite, then Solar Beam |
| Rellor | Tank | Bug Bite | Dig | Mud Shot | Defense Curl | Mud Shot, then Bug Bite |
| Flittle | Marksman | Disarming Voice | Quick Attack | Confusion | Uproar | Confusion, then Uproar |
| Tinkatink → Tinkatuff → Tinkaton | Fighter | Slam / Slam / Slam | Skitter Smack* / Skitter Smack* / Play Rough | Fake Out / Fake Out / Fake Out | Flash Cannon / Flash Cannon / Flash Cannon | Fake Out, then Flash Cannon |
| Wiglett → Wugtrio | Assassin | Slam / Slam | Dig / Dig | Headbutt / Headbutt | Water Pulse / Water Pulse | Headbutt, then Water Pulse |
| Finizen → Palafin → Palafin Hero | Fighter | Acrobatics / Aqua Tail / Aqua Tail | Dive / Dive / Dive | Astonish / Astonish / Astonish | Aqua Tail / Hydro Pump / Hydro Pump | Astonish, then Hydro Pump |
| Varoom → Revavroom | Fighter | Poison Jab / Poison Jab | Iron Head / Iron Head | Lick / Lick | Gunk Shot / Gunk Shot | Lick, then Gunk Shot |
| Cyclizar | Fighter | Dragon Claw | Dragon Rush | Bite | Dragon Pulse | Bite, then Dragon Pulse |
| Glimmet → Glimmora | Mage | Power Gem / Power Gem | Ancient Power / Ancient Power | Rock Slide / Rock Slide | Sludge Wave / Sludge Wave | Rock Slide, then Sludge Wave |
| Greavard → Houndstone | Tank | Crunch / Crunch | Dig / Dig | Lick / Lick | Double Edge / Double Edge | Lick, then Double Edge |
| Cetoddle → Cetitan | Tank | Ice Spinner / Ice Spinner | Take Down / Take Down | Bounce / Bounce | Amnesia / Amnesia | Bounce, then Ice Spinner |
| Veluza | Fighter | Aqua Cutter | Aqua Jet | Water Pulse | Liquidation | Water Pulse, then Liquidation |
| Dondozo | Tank | Order Up | Dive | Body Slam | Aqua Tail | Body Slam, then Aqua Tail |
| Tatsugiri | Mage | Water Gun | - | Water Pulse | Dragon Pulse | Water Pulse, then Dragon Pulse **(1 empty: needs a hand-written kit)** |
| Great Tusk | Tank | Brick Break | Giga Impact | Bulldoze | Defense Curl | Bulldoze, then Brick Break |
| Scream Tail | Fighter | Psychic Fangs | Play Rough | Sing | Boomburst | Sing, then Boomburst |
| Flutter Mane | Assassin | Shadow Ball | Phantom Force | Astonish | Dazzling Gleam | Astonish, then Dazzling Gleam |
| Slither Wing | Fighter | Leech Life | First Impression | Stun Spore | Lunge | Stun Spore, then Lunge |
| Sandy Shocks | Mage | Discharge | Tri Attack* | Thunder Wave | Earth Power | Thunder Wave, then Earth Power |
| Iron Bundle | Assassin | Ice Beam | Take Down | Powder Snow | Blizzard | Powder Snow, then Blizzard |
| Iron Hands | Tank | Thunder Punch | Wild Charge | Fake Out | Detect | Fake Out, then Thunder Punch |
| Iron Moth | Assassin | Fiery Dance | Take Down | Discharge | Sludge Wave | Discharge, then Sludge Wave |
| Iron Thorns | Fighter | Thunder Fang | Wild Charge | Rock Tomb | Giga Impact | Rock Tomb, then Giga Impact |
| Frigibax → Arctibax → Baxcalibur | Fighter ✋ | Dragon Claw / Dragon Claw / Icicle Crash | Take Down / Take Down / Ice Shard | Icy Wind / Icy Wind / Icy Wind | Ice Beam / Ice Beam / Ice Beam | Icy Wind, then Ice Beam |
| Gholdengo | Marksman | Power Gem | Tackle | Astonish | Shadow Ball | Astonish, then Shadow Ball |
| Chi Yu | Mage | Dark Pulse | Flame Charge | Bounce | Inferno | Bounce, then Inferno |
| Roaring Moon | Fighter | Throat Chop | Fly | Scary Face | Dragon Claw | Scary Face, then Dragon Claw |
| Iron Valiant | Assassin | Spirit Break | Shadow Sneak | Hypnosis | Moonblast | Hypnosis, then Moonblast |
| Koraidon | Fighter | Dragon Claw | Flare Blitz | Giga Impact* | Outrage |  |
| Walking Wake | Mage | Dragon Pulse | Dragon Rush | Dragon Breath | Outrage | Dragon Breath, then Outrage |
| Iron Leaves | Fighter | Psyblade | Megahorn | Close Combat* | Leaf Blade |  |
| Poltchageist → Sinistcha | Marksman | Giga Drain / Shadow Ball | Foul Play* / Foul Play* | Stun Spore / Stun Spore | Shadow Ball / Matcha Gotcha | Stun Spore, then Matcha Gotcha |
| Munkidori | Assassin | Psychic | Poison Jab* | Fake Out | Sludge Wave | Fake Out, then Sludge Wave |
| Fezandipiti | Fighter | Cross Poison | Wing Attack | Disarming Voice* | Moonblast |  |
| Ogerpon → Ogerpon Wellspring Mask | Fighter | Slam / Slam | Wood Hammer / Wood Hammer | Vine Whip / Vine Whip | Power Whip / Power Whip | Vine Whip, then Power Whip |
| Ogerpon → Ogerpon Hearthflame Mask | Fighter | Slam / Slam | Wood Hammer / Wood Hammer | Vine Whip / Vine Whip | Power Whip / Power Whip | Vine Whip, then Power Whip |
| Ogerpon → Ogerpon Cornerstone Mask | Fighter | Slam / Slam | Wood Hammer / Wood Hammer | Vine Whip / Vine Whip | Power Whip / Power Whip | Vine Whip, then Power Whip |
| Terapagos | Tank | Tri Attack | Double Edge | Headbutt | Protect | Headbutt, then Tri Attack |
| Deoxys Attack | Assassin | Psychic | Zen Headbutt | Zap Cannon | Hyper Beam | Zap Cannon, then Hyper Beam |
| Deoxys Defense | Support | Psychic | Knock Off* | Zen Headbutt | Recover | Zen Headbutt, then Psychic |
| Deoxys Speed | Marksman | Psyshock | Extreme Speed | Zen Headbutt | Psychic | Zen Headbutt, then Psychic |
| Wormadam Trash | Tank | Bug Buzz | Iron Head | String Shot | Protect | String Shot, then Bug Buzz |
| Shaymin Sky | Assassin | Energy Ball | Play Rough | Air Slash | Leaf Storm | Air Slash, then Leaf Storm |
| Giratina Origin | Fighter | Shadow Claw | Shadow Sneak | Scary Face | Dragon Claw | Scary Face, then Dragon Claw |
| Rotom Heat | Marksman | Shock Wave | Double Team | Thunder Wave | Uproar | Thunder Wave, then Uproar |
| Rotom Wash | Marksman | Shock Wave | Double Team | Thunder Wave | Uproar | Thunder Wave, then Uproar |
| Rotom Frost | Marksman | Shock Wave | Double Team | Thunder Wave | Uproar | Thunder Wave, then Uproar |
| Rotom Fan | Marksman | Shock Wave | Double Team | Thunder Wave | Uproar | Thunder Wave, then Uproar |
| Rotom Mow | Marksman | Shock Wave | Double Team | Thunder Wave | Uproar | Thunder Wave, then Uproar |
| Basculin Blue Striped | Fighter | Crunch | Take Down | Scary Face | Head Smash | Scary Face, then Head Smash |
| Darmanitan Zen | Tank | Incinerate | Headbutt | Bite | Thrash | Bite, then Thrash |
| Meloetta Pirouette | Assassin | Relic Song | U Turn | Sing | Hyper Voice | Sing, then Hyper Voice |
| Landorus Therian | Fighter | Earth Power | Outrage* | Bulldoze | Earthquake | Bulldoze, then Earthquake |
| Kyurem Black | Fighter | Ice Beam | Ancient Power | Dragon Breath | Blizzard | Dragon Breath, then Blizzard |
| Kyurem White | Mage | Ice Beam | Ancient Power | Dragon Breath | Blizzard | Dragon Breath, then Blizzard |
| Aegislash Blade | Fighter | Night Slash | Head Smash | Iron Head | Sacred Sword | Iron Head, then Sacred Sword |
| Pumpkaboo Small | Fighter | Razor Leaf | Shadow Sneak | Scary Face | Shadow Ball | Scary Face, then Shadow Ball |
| Pikachu Libre | Mage | Discharge | Wild Charge | Nuzzle | Thunderbolt | Nuzzle, then Thunderbolt |
| Rattata Alola → Raticate Alola | Tank | Crunch / Crunch | Sucker Punch / Sucker Punch | Bite / Scary Face | Hyper Fang / Hyper Fang | Scary Face, then Hyper Fang |
| Sandshrew Alola → Sandslash Alola | Tank | Metal Claw / Metal Claw | Rapid Spin / Iron Head | Iron Head / Icicle Crash | Defense Curl / Defense Curl | Icicle Crash, then Metal Claw |
| Vulpix Alola → Ninetales Alola | Mage | Ice Beam / Dazzling Gleam | Ice Shard / Ice Shard | Icy Wind / Icy Wind | Blizzard / Ice Beam | Icy Wind, then Ice Beam |
| Diglett Alola → Dugtrio Alola | Assassin | Metal Claw / Metal Claw | Dig / Dig | Bulldoze / Bulldoze | Earth Power / Earth Power | Bulldoze, then Earth Power |
| Meowth Alola → Persian Alola | Marksman | Assurance / Power Gem | Play Rough / Play Rough | Fake Out / Fake Out | Bite / Bite | Fake Out, then Bite |
| Geodude Alola → Graveler Alola → Golem Alola | Tank | Thunder Punch / Thunder Punch / Thunder Punch | Double Edge / Double Edge / Double Edge | Spark / Spark / Spark | Defense Curl / Charge / Charge | Spark, then Thunder Punch |
| Grimer Alola → Muk Alola | Tank | Crunch / Crunch | Belch* / Belch* | Bite / Bite | Harden / Harden | Bite, then Crunch |
| Zygarde Complete | Tank | Thousand Arrows | Dig | Glare | Coil | Glare, then Thousand Arrows |
| Oricorio Pom Pom | Mage | Air Cutter | Agility | Hurricane | Air Slash | Hurricane, then Air Slash |
| Oricorio Sensu | Mage | Air Cutter | Agility | Hurricane | Air Slash | Hurricane, then Air Slash |
| Lycanroc Midnight | Fighter | Crunch | Tackle | Rock Tomb | Rock Slide | Rock Tomb, then Rock Slide |
| Wishiwashi School | Marksman | Brine | Dive | Double Edge* | Aqua Tail |  |
| Mimikyu Busted | Fighter | Slash | Wood Hammer | Astonish | Shadow Claw | Astonish, then Shadow Claw |
| Magearna Original | Mage | Aura Sphere | Iron Head | Zap Cannon | Flash Cannon | Zap Cannon, then Flash Cannon |
| Lycanroc Dusk | Assassin | Crunch | Sucker Punch | Rock Tomb | Rock Slide | Rock Tomb, then Rock Slide |
| Necrozma Ultra | Assassin | Power Gem | Autotomize | Confusion | Photon Geyser | Confusion, then Photon Geyser |
| Meowth Galar | Fighter | Slash | Scratch* | Fake Out | Metal Claw | Fake Out, then Metal Claw |
| Ponyta Galar → Rapidash Galar | Assassin | Dazzling Gleam / Psycho Cut | Take Down / Take Down | Stomp / Stomp | Psybeam / Psychic | Stomp, then Psychic |
| Slowpoke Galar → Slowbro Galar | Tank | Psychic / Psychic | Tackle / Zen Headbutt | Headbutt / Headbutt | Amnesia / Withdraw | Headbutt, then Psychic |
| Slowpoke Galar → Slowking Galar | Tank | Psychic / Eerie Spell | Tackle / Zen Headbutt | Headbutt / Headbutt | Amnesia / Amnesia | Headbutt, then Eerie Spell |
| Farfetchd Galar | Fighter | Leaf Blade | Knock Off* | Slam* | Brick Break |  |
| Articuno Galar | Marksman | Dream Eater | Agility | Hypnosis | Future Sight | Hypnosis, then Future Sight |
| Zapdos Galar | Fighter | Thunderous Kick | Agility | Drill Peck* | Close Combat |  |
| Moltres Galar | Marksman | Air Slash | Sucker Punch | Hurricane | Sky Attack | Hurricane, then Sky Attack |
| Corsola Galar | Tank | Power Gem | Tackle | Astonish | Harden | Astonish, then Power Gem |
| Zigzagoon Galar → Linoone Galar | Fighter | Snarl / Snarl | Take Down / Take Down | Scary Face / Scary Face | Headbutt / Night Slash | Scary Face, then Night Slash |
| Darumaka Galar → Darmanitan Galar Standard | Fighter | Ice Punch / Ice Punch | Headbutt / Headbutt | Bite / Icicle Crash | Thrash / Thrash | Icicle Crash, then Thrash |
| Yamask Galar | Tank | Slam | Earthquake* | Astonish | Protect | Astonish, then Slam |
| Zygarde 10 | Assassin | Lands Wrath | Dig | Glare | Outrage | Glare, then Outrage |
| Eiscue Noice | Fighter | Surf | Headbutt | Icy Wind | Freeze Dry | Icy Wind, then Freeze Dry |
| Zacian Crowned | Fighter | Sacred Sword | Iron Head | Bite | Moonblast | Bite, then Moonblast |
| Zamazenta Crowned | Fighter | Crunch | Iron Head | Bite | Giga Impact | Bite, then Giga Impact |
| Growlithe Hisui → Arcanine Hisui | Fighter | Fire Fang / Fire Fang | Take Down / Flare Blitz | Bite / Bite | Flamethrower / Flamethrower | Bite, then Flamethrower |
| Voltorb Hisui → Electrode Hisui | Mage | Energy Ball / Energy Ball | Tackle / Tackle | Stun Spore / Stun Spore | Self Destruct / Explosion | Stun Spore, then Explosion |
| Qwilfish Hisui | Fighter | Fell Stinger | Tackle | Bite | Barb Barrage | Bite, then Barb Barrage |
| Sneasel Hisui | Fighter | Brick Break | Quick Attack | Slash* | Poison Jab |  |
| Zorua Hisui → Zoroark Hisui | Assassin | Foul Play / Shadow Claw | Shadow Sneak / U Turn | Knock Off* / Foul Play* | Bitter Malice / Bitter Malice |  |
| Dialga Origin | Mage | Flash Cannon | Ancient Power | Scary Face | Iron Tail | Scary Face, then Iron Tail |
| Palkia Origin | Assassin | Water Pulse | Ancient Power | Scary Face | Hydro Pump | Scary Face, then Hydro Pump |
| Basculin White Striped | Fighter | Crunch | Take Down | Scary Face | Head Smash | Scary Face, then Head Smash |
| Enamorus Therian | Mage | Dazzling Gleam | Superpower* | Astonish | Moonblast | Astonish, then Moonblast |
| Tauros Paldea Blaze Breed | Fighter | Flame Charge | Flare Blitz | Scary Face | Close Combat | Scary Face, then Close Combat |
| Tauros Paldea Aqua Breed | Fighter | Close Combat | Zen Headbutt | Scary Face | Wave Crash | Scary Face, then Wave Crash |
| Wooper Paldea | Tank | Poison Jab | Tackle | Mud Shot | Amnesia | Mud Shot, then Poison Jab |
| Maushold Family Of Three | Fighter | Pound | Play Rough | Double Hit* | Echoed Voice |  |
| Tatsugiri Droopy | Mage | Water Gun | - | Water Pulse | Dragon Pulse | Water Pulse, then Dragon Pulse **(1 empty: needs a hand-written kit)** |
| Tatsugiri Stretchy | Mage | Water Gun | - | Water Pulse | Dragon Pulse | Water Pulse, then Dragon Pulse **(1 empty: needs a hand-written kit)** |
| Gimmighoul Roaming | Marksman ✋ | Shadow Ball | Tackle | - | Power Gem |  **(1 empty: needs a hand-written kit)** |
| Ursaluna Bloodmoon | Tank | Earth Power | Headlong Rush* | Scary Face | Harden | Scary Face, then Earth Power |
| Arceus Bug | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Dark | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Dragon | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Electric | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Fighting | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Fire | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Flying | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Ghost | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Grass | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Ground | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Ice | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Poison | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Psychic | Marksman | Earth Power | Extreme Speed | Hyper Beam* | Future Sight |  |
| Arceus Rock | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Steel | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Water | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
| Arceus Fairy | Marksman | Earth Power | Extreme Speed | Future Sight* | Hyper Beam |  |
