# Retro Arcade

Twenty-three arcade and PC classics that play in the browser. It's a static site with no build step, no dependencies, and it works on desktop, iPad and phones.

| Game | Tribute to |
|---|---|
| Rock Storm | Asteroids (1979) |
| Star Swarm | Galaga (1981): tractor beam, dual fighter, challenge stages |
| Maze Muncher | Pac-Man (1980): each ghost uses its classic chase and scatter targeting |
| **Zork I** | **The real game**, run by a Z-machine interpreter written for this site |
| Sky Lancers | Joust (1982) |
| Planet Guardian | Defender (1981) |
| Invader Wave | Space Invaders (1978) |
| Road Hopper | Frogger (1981) |
| City Shield | Missile Command (1980) |
| Bug Blaster | Centipede (1981) |
| Sunset Cruiser | Out Run (1986): forks in the road, 15 stages, 5 goals, pick-your-station radio |
| Lean Machine | Hang-On (1985): lean into bends, tuck for top speed, five checkpoints |
| Girder Climb | Donkey Kong (1981): barrels, cement factory, elevators, rivets |
| Knight's Gauntlet | Dragon's Lair (1983): eight rooms of one-wrong-move-and-you're-dead, mirrored on the second quest |
| Miss Muncher | Ms. Pac-Man (1982): four mazes, fruit that bounces in through the tunnels |
| Pin Seeker | Golden Tee (1989): nine generated holes, swipe-to-swing, wind, water and trees |
| Sky Fury | After Burner (1987): banking horizon, lock-on missiles, barrel rolls |
| City Stomper | Rampage (1986): climb, punch and flatten every building in town |
| Castle Escape | Wolfenstein 3D (1992): three floors, keys, secret push walls, a boss |
| Max Havoc | Duke Nukem 3D (1996): keycards, shotgun, ripper, rockets, exploding barrels |
| Vector Strike | Star Wars (1983): vector dogfight, hull run and trench dive |
| **Freedoom** | **The real Doom engine** (Chocolate Doom, GPL, compiled to WebAssembly) with Freedoom's free game data |
| **Blasphemer** | **The real Heretic engine** (Chocolate Heretic, GPL) with Blasphemer's free game data (unfinished fan project, episodes 1-3) |

Every game except Zork is an original rebuild. None of them uses the original code, ROMs or artwork, and each one has its own name, since the original titles are still trademarks. Zork I is Infocom's original story file, released under the MIT license by Microsoft in 2025 ([historicalsource/zork1](https://github.com/historicalsource/zork1)).

## Layout
- `index.html`: the lobby.
- `shared/arcade.js` and `arcade.css`: the shared engine. It handles screen scaling, the fixed 60 Hz loop, keyboard and touch controls, synthesized sound, high scores (saved in localStorage) and the title, pause and game-over screens.
- `games/<id>/index.html`: one file per game.
- `games/zork/zmachine.js`: the Z-machine version 3 interpreter. Zork's page autosaves after every move.
- `shared/audio.js`: sampled music and sound effects on top of the engine's audio, paused with the game.
- `shared/road3d.js` and `roadart.js`: the pseudo-3D road engine and its scenery, used by the two racers.
- `shared/raycast.js` and `fps.js`: the grid raycaster and the first-person shooter kit (doors, enemies, weapons, pickups) used by Castle Escape and Max Havoc.
- `assets/audio/` and `assets/sfx/`: music (AAC) and effects (WAV).

- `engine/`: Chocolate Doom and Chocolate Heretic compiled to WebAssembly, GPL v2 (`engine/COPYING-GPL.md`). Source: https://github.com/chocolate-doom/chocolate-doom, built with Emscripten with two small browser patches (the OPL music timer and a per-frame yield in the main loop).
- `shared/wasmpad.js`: loader, tap-to-start and on-screen touch controls for the compiled engines.

## Credits
- Freedoom (BSD): https://freedoom.github.io, license in `games/freedoom/FREEDOOM-COPYING.txt`.
- Blasphemer (BSD): https://github.com/Blasphemer/blasphemer, license in `games/blasphemer/BLASPHEMER-COPYING.md`.
All music and sound effects are public domain (CC0), from OpenGameArt:
- Juhani Junkala (SubspaceAudio): 5 Action Chiptunes, Chiptune Adventures, JRPG Pack 5, and the 512 Sound Effects pack.
- Alex McCulloch (Pro Sensory): Space Synth Wave.
- Spring Spring: the 80s bassline track.

## Run locally
Run `python -m http.server` in this folder, then open http://localhost:8000. Zork loads its game file with `fetch`, so it won't run from `file://`.
