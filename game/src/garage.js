// Garage: buy cars with cash, keep up to three in the safehouse garage,
// pull one out at the green lot in the Marina.
import { CAR_TYPES, Car } from './cars.js';

export class Garage {
  constructor(scene) {
    this.scene = scene;
    this.owned = ['peko'];   // starter car in the garage
    this.stored = [];
    this.open = false;
  }
  buy(typeId, cash) {
    const type = CAR_TYPES.find(t => t.id === typeId);
    if (!type) return { ok: false, msg: 'No such car.' };
    if (this.owned.includes(typeId)) return { ok: false, msg: 'Already in your garage.' };
    if (this.owned.length >= 3) return { ok: false, msg: 'Garage full — 3 cars max.' };
    if (cash < type.price) return { ok: false, msg: `Need $${type.price.toLocaleString()} — you don't have it yet.` };
    this.owned.push(typeId);
    return { ok: true, msg: `${type.name} is yours. Park it at the lot and press G to pull it out.` };
  }
  pullOut(typeId, x, z, heading) {
    const type = CAR_TYPES.find(t => t.id === typeId);
    if (!type) return null;
    const car = new Car(this.scene, type, x, z, heading);
    this.stored.push(car);
    return car;
  }
  list() {
    return CAR_TYPES.map(t => ({
      ...t,
      owned: this.owned.includes(t.id),
    }));
  }
}
