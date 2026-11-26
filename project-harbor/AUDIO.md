# Harbor audio

Every Harbor sound is synthesized in the browser with the Web Audio API when the game runs. The build does not ship recorded samples, music files, or third-party audio.

The synthesis in `project-harbor/world/civic/webaudio.ts` is original. It is dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Hearing is separate from playback. NPC reactions use gameplay events directly, so muting the mix does not change what witnesses and drivers notice. Volume sliders are stored locally under `harbor-audio-v1`. Perceived loudness uses the square of each slider. One context feeds a compressor, two crossfaded region beds, a siren, up to two engines, and a capped set of one-shots.
