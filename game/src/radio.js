// Radio: three synth stations the player flips through with R.
// The station index lives on the game state so it saves with the rest of the
// game; the audio engine owns the actual sound. This file is just the list and
// the cycle action, so the HUD and the audio engine never disagree about names.
import { RADIO_STATIONS } from './config.js';

export function stationCount() { return RADIO_STATIONS.length; }
export function stationAt(i) { return RADIO_STATIONS[((i % RADIO_STATIONS.length) + RADIO_STATIONS.length) % RADIO_STATIONS.length]; }
export function stationName(i) { return stationAt(i).name; }
export function stationTag(i) { return stationAt(i).tag; }

export function cycleStation(game, audio) {
  const s = game.state;
  s.radioIndex = (s.radioIndex + 1) % RADIO_STATIONS.length;
  if (audio) audio.setStation(s.radioIndex);
  game.say('RADIO: ' + stationName(s.radioIndex) + ' — ' + stationTag(s.radioIndex), 3);
  if (audio) audio.click();
}
