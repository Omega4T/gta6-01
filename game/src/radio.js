// Radio stations: three synth stations the player flips through with R.
// The station index lives on the game state so it saves with the rest of the
// progress; the audio engine owns the actual sound. This file is only the
// list and the cycle action, so the HUD and the audio engine can never
// disagree about which station is playing or what it is called.
import { RADIO_STATIONS } from './config.js';

// How many stations exist.
export function stationCount() {
  return RADIO_STATIONS.length;
}

// The station at index i, wrapping around both ways.
export function stationAt(i) {
  const n = RADIO_STATIONS.length;
  const wrapped = ((i % n) + n) % n;
  return RADIO_STATIONS[wrapped];
}

export function stationName(i) {
  return stationAt(i).name;
}

export function stationTag(i) {
  return stationAt(i).tag;
}

// R key: advance one station, retune the audio engine, and toast the name.
export function cycleStation(game, audio) {
  const st = game.state;
  st.radioIndex = (st.radioIndex + 1) % RADIO_STATIONS.length;
  if (audio) audio.setStation(st.radioIndex);
  game.say('RADIO: ' + stationName(st.radioIndex) + ' — ' + stationTag(st.radioIndex), 3);
  if (audio) audio.click();
}
