// Safehouse garage: buy cars with cash, store the car you drove in, and take
// an owned car back out. The garage sits at SPOTS.garage. Press G near it:
// inside a car stores that car (if a slot is free); on foot it opens the
// garage menu. In the menu Q cycles the entries, Space confirms (buy or take
// out), G closes. Owned cars persist in the save file.
import { CAR_TYPES, GARAGE_SLOTS } from './config.js';
import { dist2 } from './random.js';
import { SPOTS } from './city.js';
import { spawnVehicle, enterCar, playerCar } from './vehicles.js';

export const BUYABLE = ['sports', 'muscle', 'truck', 'beach', 'taxi', 'van'];

export function nearGarage(game) {
  const s = game.state;
  return dist2(s.player.x, s.player.y, SPOTS.garage.x, SPOTS.garage.y) < 130 * 130;
}

export function garageEntries(game) {
  const s = game.state;
  const entries = [];
  for (const type of BUYABLE) {
    const def = CAR_TYPES[type];
    const owned = s.ownedCars.some((c) => c.type === type);
    entries.push({
      kind: owned ? 'take' : 'buy', type,
      label: (owned ? 'TAKE OUT  ' : 'BUY  ') + def.name + '  —  $' + def.price.toLocaleString('en-US') + (owned ? ' (owned)' : ''),
      price: def.price,
    });
  }
  return entries;
}

export function garageAction(game) {
  const s = game.state;
  if (s.screen === 'garage') {
    s.screen = 'play';
    return;
  }
  if (!nearGarage(game)) {
    game.say('No garage here — drive to the Safehouse Garage.', 2);
    return;
  }
  const car = playerCar(game);
  if (car) {
    if (s.ownedCars.length >= GARAGE_SLOTS) {
      game.say('Garage full (' + GARAGE_SLOTS + ' slots). Take a car out first.', 3);
      return;
    }
    if (car.police) {
      game.say('The cops want their cruiser back. Nice try.', 3);
      return;
    }
    s.ownedCars.push({ type: car.type, color: car.color });
    car.dead = true;
    s.playerCar = null;
    s.player.x = SPOTS.garage.x;
    s.player.y = SPOTS.garage.y + 60;
    game.save();
    game.say(CAR_TYPES[car.type].name + ' stored in the garage.', 3);
    if (game.audio) game.audio.buy();
    return;
  }
  s.screen = 'garage';
  s.garageSelected = 0;
}

export function garageCycle(game) {
  const s = game.state;
  const entries = garageEntries(game);
  if (entries.length === 0) return;
  s.garageSelected = (s.garageSelected + 1) % entries.length;
  if (game.audio) game.audio.click();
}

export function garageConfirm(game) {
  const s = game.state;
  const entries = garageEntries(game);
  const e = entries[s.garageSelected];
  if (!e) return;
  if (e.kind === 'take') {
    const car = spawnVehicle(game, e.type, SPOTS.garage.x + 40, SPOTS.garage.y + 40, -Math.PI / 2, { parked: false });
    s.screen = 'play';
    enterCar(game, car);
    game.say('Took out the ' + CAR_TYPES[e.type].name + '.', 3);
    return;
  }
  if (s.cash < e.price) {
    game.say('Not enough cash for the ' + CAR_TYPES[e.type].name + ' ($' + e.price + ').', 3);
    return;
  }
  if (s.ownedCars.length >= GARAGE_SLOTS) {
    game.say('Garage full (' + GARAGE_SLOTS + ' slots).', 3);
    return;
  }
  s.cash -= e.price;
  s.ownedCars.push({ type: e.type, color: CAR_TYPES[e.type].color });
  game.save();
  game.say('Bought the ' + CAR_TYPES[e.type].name + ' — it is in your garage.', 4);
  if (game.audio) game.audio.buy();
}
