// The Safehouse Garage: buy cars with cash, store up to three, and pull one
// out again at the green lot beside the safehouse. Owned cars persist in the
// save file, so the collection grows across sessions.

import { CFG } from './config.js';
import { LANDMARKS } from './city.js';
import { makeCar } from './vehicles.js';
import { dist } from './random.js';

// The lot is the green rectangle beside the safehouse marker.
export function garageLot(S) {
  return { x: LANDMARKS.safehouse.x + 130, y: LANDMARKS.safehouse.y + 40, w: 150, h: 90 };
}

// True when the player is standing or parked on the lot.
export function nearGarage(S) {
  const lot = garageLot(S);
  const p = S.player;
  return Math.abs(p.x - lot.x) < lot.w / 2 + 30 && Math.abs(p.y - lot.y) < lot.h / 2 + 30;
}

// Buy a car type. It goes into storage; retrieve it from the lot.
export function buyCar(S, type) {
  const spec = CFG.carTypes[type];
  if (!spec || !CFG.garageCars.includes(type)) return 'not for sale';
  if (S.garage.owned.includes(type)) return 'already owned';
  if (S.garage.owned.length >= CFG.garageMaxStored) return 'garage full';
  if (S.player.cash < spec.price) return 'not enough cash';
  S.player.cash -= spec.price;
  S.garage.owned.push(type);
  S.audio.jingle();
  S.saveGame();
  return 'bought';
}

// Pull a stored car out onto the lot.
export function retrieveCar(S, type) {
  if (!S.garage.owned.includes(type)) return false;
  const lot = garageLot(S);
  const car = makeCar(type, lot.x + (Math.random() - 0.5) * 60, lot.y + (Math.random() - 0.5) * 30, 0, 'parked');
  S.cars.push(car);
  S.garage.owned = S.garage.owned.filter((t) => t !== type);
  S.audio.pickup();
  S.saveGame();
  return true;
}

// Park the player's current car into storage, freeing the street.
export function storeCurrentCar(S) {
  const p = S.player;
  if (!p.inCar) return false;
  if (S.garage.owned.length >= CFG.garageMaxStored) return false;
  S.garage.owned.push(p.inCar.type);
  p.inCar.dead = true;
  p.inCar = null;
  p.onFoot = true;
  S.audio.pickup();
  S.saveGame();
  return true;
}

// The garage panel lines: name, price, owned marker.
export function garageLines(S) {
  return CFG.garageCars.map((type, i) => {
    const spec = CFG.carTypes[type];
    const owned = S.garage.owned.includes(type);
    return {
      key: String(i + 1),
      type,
      text: (i + 1) + '. ' + spec.name + ' — $' + spec.price + (owned ? '  [OWNED — press to retrieve]' : ''),
      owned,
      price: spec.price,
    };
  });
}
