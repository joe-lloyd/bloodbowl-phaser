# Sound credits

Every sound here is cut from a CC0 recording. CC0 needs no attribution, but
the sources are listed so anyone can trace or rebuild a file.
`scripts/build-sounds.sh` shows how each one was trimmed, mixed and
normalized.

Freesound files come from the public MP3 previews of each sound, which need no
login. Kenney files come from the free asset packs.

## Sources

| Source | Author | License |
| --- | --- | --- |
| [Soccer Kick.wav](https://freesound.org/people/musita182/sounds/261267/) | musita182 | CC0 1.0 |
| [Hard Swing 1](https://freesound.org/people/magnuswaker/sounds/523230/) | magnuswaker | CC0 1.0 |
| [Throwing / Whip Effect](https://freesound.org/people/denao270/sounds/346373/) | denao270 | CC0 1.0 |
| [bouncing football ball off the ground](https://freesound.org/people/13GPanska_Lakota_Jan/sounds/378355/) | 13GPanska_Lakota_Jan | CC0 1.0 |
| [BallCatch.wav](https://freesound.org/people/ToastHatter/sounds/514989/) | ToastHatter | CC0 1.0 |
| [Glove Catch 12 FF003.aif](https://freesound.org/people/martinimeniscus/sounds/164536/) | martinimeniscus | CC0 1.0 |
| [body_hit.wav](https://freesound.org/people/insanity54/sounds/276600/) | insanity54 | CC0 1.0 |
| [BODY FALL - V HVY - DIRT](https://freesound.org/people/leonelmail/sounds/504626/) | leonelmail | CC0 1.0 |
| [Body fall.wav](https://freesound.org/people/DylanTheFish/sounds/417994/) | DylanTheFish | CC0 1.0 |
| [Thud / Falling on wooden floor / Snapping, breaking neck](https://freesound.org/people/Breviceps/sounds/447922/) | Breviceps | CC0 1.0 |
| [Referee whistle sound.wav](https://freesound.org/people/Rosa-Orenes256/sounds/538422/) | Rosa-Orenes256 | CC0 1.0 |
| [Trillerpfeife/ Whistle](https://freesound.org/people/Musik-Fan/sounds/631849/) | Musik-Fan | CC0 1.0 |
| [Crowd Cheer](https://freesound.org/people/FoolBoyMedia/sounds/397434/) | FoolBoyMedia | CC0 1.0 |
| [Casino Audio](https://kenney.nl/assets/casino-audio) | Kenney | CC0 1.0 |
| [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 1.0 |

## Files

| File | Game sound | Made from |
| --- | --- | --- |
| `ball-bounce-1.mp3` to `ball-bounce-4.mp3` | Ball bounce | Four single bounces from "bouncing football ball off the ground", low-passed |
| `fumble.mp3` | Fumble | "BallCatch.wav", then four fading bounces from "bouncing football ball off the ground" |
| `kickoff.mp3` | Kick-off | "Soccer Kick.wav" with "Hard Swing 1" under it |
| `pass-1.mp3` | Pass | "Throwing / Whip Effect" |
| `pass-2.mp3` | Pass | "Hard Swing 1" |
| `catch-1.mp3` | Catch | "BallCatch.wav" |
| `catch-2.mp3` | Catch | "Glove Catch 12 FF003.aif" |
| `block-impact-1.mp3` to `block-impact-3.mp3` | Block impact | Kenney Impact Sounds `impactPunch_heavy_000`, `_002`, `_004` |
| `block-impact-4.mp3` | Block impact | "body_hit.wav" |
| `pushback-1.mp3`, `pushback-2.mp3` | Pushback | Kenney Impact Sounds `impactPunch_medium_000`, `_003` |
| `knockdown-1.mp3` | Knockdown | "BODY FALL - V HVY - DIRT" |
| `knockdown-2.mp3` | Knockdown | "Body fall.wav" |
| `ko-injury.mp3` | KO or injury | "Thud / Falling on wooden floor / Snapping, breaking neck" over Kenney `impactSoft_heavy_002` |
| `dice-roll-1.mp3` to `dice-roll-3.mp3` | Dice roll | Kenney Casino Audio `dice-throw-1` to `dice-throw-3` |
| `dice-clack-1.mp3` to `dice-clack-3.mp3` | 3D dice tray collisions | Single knocks cut from Kenney Casino Audio `die-throw-3` and `die-throw-1` |
| `whistle-short.mp3` | Turnover | "Referee whistle sound.wav" |
| `whistle-double.mp3` | Foul | "Referee whistle sound.wav", twice |
| `whistle-long.mp3` | Send-off | "Trillerpfeife/ Whistle" |
| `whistle-final.mp3` | End of half or game | Two short blasts of "Referee whistle sound.wav", then "Trillerpfeife/ Whistle" |
| `touchdown.mp3` | Touchdown | 4.8 seconds of "Crowd Cheer" |
