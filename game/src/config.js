// Solara City tuning: every number the game balances on lives here.
// Change a value here and the whole game follows; no other file hard-codes a balance number.
export const STEP = 1 / 60;
export const WORLD = { size: 6400, block: 400, road: 96, sidewalk: 26 };
export const SEED_DEFAULT = 20261123;

export const PLAYER = {
  walkSpeed: 210, runSpeed: 330, radius: 13, health: 100, armour: 0,
  punchDamage: 12, punchRange: 34, punchCooldown: 0.38,
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, rate: 0.38, range: 40, ammo: Infinity, auto: false, spread: 0, pellets: 1, kick: 0 },
  pistol: { name: 'Pistol', damage: 26, rate: 0.24, range: 520, ammo: 120, auto: false, spread: 0.03, pellets: 1, kick: 2 },
  shotgun: { name: 'Shotgun', damage: 16, rate: 0.85, range: 300, ammo: 32, auto: false, spread: 0.16, pellets: 6, kick: 7 },
  smg: { name: 'SMG', damage: 14, rate: 0.09, range: 430, ammo: 180, auto: true, spread: 0.07, pellets: 1, kick: 1 },
};

export const CAR_TYPES = {
  sedan:   { name: 'Solara Sedan',  top: 560, accel: 420, brake: 640, turn: 2.6, grip: 3.4, hp: 100, color: '#c94f43', price: 0 },
  taxi:    { name: 'City Taxi',     top: 520, accel: 400, brake: 620, turn: 2.7, grip: 3.4, hp: 90,  color: '#f2b705', price: 1200 },
  van:     { name: 'Cargo Van',     top: 440, accel: 300, brake: 520, turn: 2.1, grip: 3.0, hp: 140, color: '#7d8a99', price: 900 },
  sports:  { name: 'Vento GT',      top: 760, accel: 620, brake: 760, turn: 3.1, grip: 4.2, hp: 80,  color: '#e8b10c', price: 6500 },
  truck:   { name: 'Haul Truck',    top: 400, accel: 260, brake: 460, turn: 1.8, grip: 2.8, hp: 180, color: '#4a7d5a', price: 2200 },
  police:  { name: 'Police Cruiser',top: 680, accel: 560, brake: 720, turn: 3.0, grip: 4.0, hp: 130, color: '#2b4a8f', price: 0 },
  beach:   { name: 'Beach Buggy',   top: 480, accel: 380, brake: 560, turn: 2.9, grip: 3.2, hp: 80,  color: '#3fb6a8', price: 1500 },
};

export const POLICE = {
  starsMax: 5,
  decayDelay: 14, decayRate: 1,
  spawnDist: 620, maxCruisers: [0, 2, 4, 6, 8, 10],
  heliAtStars: 3, roadblockAtStars: 4,
  bustRadius: 46, bustTime: 1.6, ramDamage: 6,
};

export const MISSION_PAYOUTS = [400, 700, 900, 1200, 1600, 2000, 2600, 5000];
export const TAXI_FARE = 90;
export const PACKAGE_REWARD = 250;
export const CAR_PRICES = { sports: 6500, taxi: 1200, van: 900, truck: 2200, beach: 1500, sedan: 0 };

export const DISTRICTS = [
  { name: 'Marina', x0: 0, z0: 1800, x1: 1400, z1: 4600, tint: '#2e7f86' },
  { name: 'Old Town', x0: 1800, z0: 1800, x1: 3800, z1: 4200, tint: '#b98a3e' },
  { name: 'Uptown', x0: 1800, z0: 0, x1: 4600, z1: 1600, tint: '#4a6fa5' },
  { name: 'Docks', x0: 1400, z0: 4600, x1: 4200, z1: 6400, tint: '#7a6a55' },
  { name: 'Bayside', x0: 4600, z0: 1200, x1: 6400, z1: 4600, tint: '#3e8f5a' },
];

export const PALETTE = {
  grass: '#5d9b4a', sand: '#e3c98f', water: '#1f6f8b', road: '#33373d', roadLine: '#d8c95a',
  sidewalk: '#9a938a', buildingRoof: '#8a6f5c', park: '#4e8f3e', plaza: '#b7ab93',
  skyNoon: '#f7c873', skyDusk: '#e07b39', skyNight: '#0d1b33',
  hudPanel: 'rgba(10,14,22,0.72)', hudText: '#f4f1e6', hudGold: '#f2c94c',
  marker: '#ffd23f', policeBlue: '#3b6fe0', policeRed: '#e23b3b',
};

export const SAVE_KEY = 'solara-city.save.v1';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
