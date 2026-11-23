// Safehouse garage: buy cars with cash, store the car you drove in, and take
// an owned car back out. The garage sits at SPOTS.garage. Press G near it:
// inside a car stores that car (if a slot is free); on foot it opens the
// garage menu. In the menu Q cycles the entries, Space confirms (buy or take
// out), G closes. Owned cars persist in the save file.
import { CAR_TYPES, GARAGE_SLOTS } from './config.js';
import { dist2 } from './random.js';
import { SPOTS } from './city.js';
import { spawnVehicle, enterCar, playerCar } from './vehicles.js';

// The six models the garage sells; the starter sedan and police cruisers are
// never for sale (the sedan is free to steal, the cruiser is not yours).
export const BUYABLE = ['sports', 'muscle', 'truck', 'beach', 'taxi', 'van'];

// Is the player close enough to the garage lot to use it?
export function nearGarage(game) {
  const st = game.state;
  const dx = st.player.x - SPOTS.garage.x;
  const dy = st.player.y - SPOTS.garage.y;
  return dx * dx + dy * dy < 130 * 130;
}

// One menu row per buyable model: take it out if owned, buy it if not.
export function garageEntries(game) {
  const st = game.state;
  const entries = [];
  for (const type of BUYABLE) {
    const def = CAR_TYPES[type];
    const owned = st.ownedCars.some((c) => c.type === type);
    const verb = owned ? 'TAKE OUT  ' : 'BUY  ';
    const price = '$' + def.price.toLocaleString('en-US');
    const suffix = owned ? ' (owned)' : '';
    entries.push({
      kind: owned ? 'take' : 'buy',
      type,
      label: verb + def.name + '  —  ' + price + suffix,
      price: def.price,
    });
  }
  return entries;
}

// The G key: close the menu, store the car being driven, or open the menu.
export function garageAction(game) {
  const st = game.state;
  if (st.screen === 'garage') {
    st.screen = 'play';
    return;
  }
  if (!nearGarage(game)) {
    game.say('No garage here — drive to the Safehouse Garage.', 2);
    return;
  }
  const car = playerCar(game);
  if (car) {
    if (st.ownedCars.length >= GARAGE_SLOTS) {
      game.say('Garage full (' + GARAGE_SLOTS + ' slots). Take a car out first.', 3);
      return;
    }
    if (car.police) {
      game.say('The cops want their cruiser back. Nice try.', 3);
      return;
    }
    st.ownedCars.push({ type: car.type, color: car.color });
    car.dead = true;
    st.playerCar = null;
    st.player.x = SPOTS.garage.x;
    st.player.y = SPOTS.garage.y + 60;
    game.save();
    game.say(CAR_TYPES[car.type].name + ' stored in the garage.', 3);
    if (game.audio) game.audio.buy();
    return;
  }
  st.screen = 'garage';
  st.garageSelected = 0;
}

// Q in the menu: move the highlight to the next row.
export function garageCycle(game) {
  const st = game.state;
  const entries = garageEntries(game);
  if (entries.length === 0) return;
  st.garageSelected = (st.garageSelected + 1) % entries.length;
  if (game.audio) game.audio.click();
}

// Space in the menu: take the car out, or buy it if it is not owned yet.
export function garageConfirm(game) {
  const st = game.state;
  const entries = garageEntries(game);
  const e = entries[st.garageSelected];
  if (!e) return;
  if (e.kind === 'take') {
    const car = spawnVehicle(game, e.type, SPOTS.garage.x + 40, SPOTS.garage.y + 40, -Math.PI / 2, { parked: false });
    st.screen = 'play';
    enterCar(game, car);
    game.say('Took out the ' + CAR_TYPES[e.type].name + '.', 3);
    return;
  }
  if (st.cash < e.price) {
    game.say('Not enough cash for the ' + CAR_TYPES[e.type].name + ' ($' + e.price + ').', 3);
    return;
  }
  if (st.ownedCars.length >= GARAGE_SLOTS) {
    game.say('Garage full (' + GARAGE_SLOTS + ' slots).', 3);
    return;
  }
  st.cash -= e.price;
  st.ownedCars.push({ type: e.type, color: CAR_TYPES[e.type].color });
  game.save();
  game.say('Bought the ' + CAR_TYPES[e.type].name + ' — it is in your garage.', 4);
  if (game.audio) game.audio.buy();
}
