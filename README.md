# Retro Arcade

Ten 80s arcade classics that play in the browser. It's a static site with no build step, no dependencies, and it works on desktop, iPad and phones.

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

Every game except Zork is an original rebuild. None of them uses the original code, ROMs or artwork, and each one has its own name, since the original titles are still trademarks. Zork I is Infocom's original story file, released under the MIT license by Microsoft in 2025 ([historicalsource/zork1](https://github.com/historicalsource/zork1)).

## Layout
- `index.html`: the lobby.
- `shared/arcade.js` and `arcade.css`: the shared engine. It handles screen scaling, the fixed 60 Hz loop, keyboard and touch controls, synthesized sound, high scores (saved in localStorage) and the title, pause and game-over screens.
- `games/<id>/index.html`: one file per game.
- `games/zork/zmachine.js`: the Z-machine version 3 interpreter. Zork's page autosaves after every move.

## Run locally
Run `python -m http.server` in this folder, then open http://localhost:8000. Zork loads its game file with `fetch`, so it won't run from `file://`.
