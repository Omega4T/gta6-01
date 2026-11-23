// Every tunable number of Solara City lives here: the city size, the cars, the
// weapons, the police response, the mission payouts and the look of the place.
// Balance is adjusted by editing this file alone.

export const CFG = {
  worldSize: 4800,
  roadGap: 600,
  roadWidth: 120,
  citySeed: 20261123,

  // How many of each crowd the city holds.
  trafficCount: 48,
  pedCount: 44,
  parkedCount: 71,
  treeCount: 180,

  player: {
    walkSpeed: 190,
    runSpeed: 300,
    radius: 14,
    maxHealth: 100,
    maxArmor: 100,
    startCash: 250,
  },

  // Seven drivable car types. maxSpeed is pixels per second.
  carTypes: {
    sedan:   { name: 'Solara Sedan',   maxSpeed: 430, accel: 260, grip: 3.4, color: '#c8ccd4', price: 0 },
    taxi:    { name: 'Marina Taxi',    maxSpeed: 410, accel: 250, grip: 3.3, color: '#f2c200', price: 3000 },
    van:     { name: 'Cargo Van',      maxSpeed: 360, accel: 200, grip: 3.0, color: '#7fa3c7', price: 2800 },
    sports:  { name: 'Viento GT',      maxSpeed: 560, accel: 380, grip: 4.2, color: '#d42a2a', price: 8000 },
    muscle:  { name: 'Bravado Muscle', maxSpeed: 480, accel: 320, grip: 3.6, color: '#2a6fd4', price: 5000 },
    truck:   { name: 'Hauler Truck',   maxSpeed: 340, accel: 180, grip: 2.8, color: '#8a7a52', price: 3500 },
    beach:   { name: 'Dune Buggy',     maxSpeed: 400, accel: 300, grip: 3.8, color: '#3ec98a', price: 2500 },
    police:  { name: 'SCPD Cruiser',   maxSpeed: 500, accel: 340, grip: 3.9, color: '#1c2733', price: 0 },
  },

  garageCars: ['sports', 'muscle', 'truck', 'beach', 'taxi', 'van'],
  garageMaxStored: 3,

  weapons: {
    fists:   { name: 'Fists',    damage: 12, rate: 0.35, range: 42,  auto: false, ammo: Infinity },
    pistol:  { name: 'Pistol',   damage: 22, rate: 0.28, range: 520, auto: false, ammo: 120 },
    shotgun: { name: 'Shotgun',  damage: 16, rate: 0.85, range: 340, auto: false, ammo: 36, pellets: 5 },
    smg:     { name: 'SMG',      damage: 11, rate: 0.09, range: 460, auto: true,  ammo: 90 },
  },
  weaponOrder: ['fists', 'pistol', 'shotgun', 'smg'],

  police: {
    heatPerKill: 1.2,
    heatPerShot: 0.15,
    heatPerTheft: 0.8,
    heatPerCrash: 0.1,
    decayPerSecond: 0.12,
    wantedThresholds: [0, 1, 2.2, 3.4, 4.6, 6.0],
    maxCops: 5,
    bustedFine: 200,
    wastedFine: 300,
  },

  missions: [
    { name: 'First Delivery',   brief: 'Pick up the parcel at the docks and deliver it to Old Town.', payout: 400 },
    { name: 'Wheels Up',        brief: 'Steal a Viento GT and bring it to the garage lot.', payout: 650 },
    { name: 'Dockside Debt',    brief: 'The crew at the docks owes Marisol. Settle it.', payout: 900 },
    { name: 'Cab Call',         brief: 'Drive the taxi. Three fares, no complaints.', payout: 750 },
    { name: 'Street King',      brief: 'Beat the checkpoint race across the city in 75 seconds.', payout: 1200 },
    { name: 'Hot Pursuit',      brief: 'Lose a three-star wanted level. Stay out of sight.', payout: 1000 },
    { name: 'Harbor Lights',    brief: 'Move the cargo while the police are already on you.', payout: 1500 },
    { name: 'The Big Score',    brief: 'Hit the Uptown bank, hold the lobby, then vanish.', payout: 4000 },
  ],
  packageReward: 100,
  packageCount: 12,

  radio: [
    { name: 'SOLARA FM',   style: 'sunny pop',    tempo: 112, root: 60 },
    { name: 'BAY BEATS',   style: 'funk',         tempo: 100, root: 55 },
    { name: 'NIGHT DRIVE', style: 'synthwave',    tempo: 90,  root: 48 },
  ],

  districts: [
    { name: 'Marina',   x0: 0,    y0: 0,    x1: 1200, y1: 4800, tint: '#e8d9a0' },
    { name: 'Uptown',   x0: 1200, y0: 0,    x1: 4800, y1: 1200, tint: '#c9d4e8' },
    { name: 'Old Town', x0: 1200, y0: 1200, x1: 3600, y1: 3600, tint: '#e8c9a0' },
    { name: 'Docks',    x0: 1200, y0: 3600, x1: 4800, y1: 4800, tint: '#b8c4b0' },
    { name: 'East End', x0: 3600, y0: 1200, x1: 4800, y1: 3600, tint: '#d8c9d4' },
  ],

  colors: {
    grass: '#7fae5a',
    sand: '#e8d9a0',
    water: '#2a7fa8',
    road: '#3a3f46',
    roadLine: '#d8d8c0',
    sidewalk: '#9a9a92',
    park: '#5d9e4a',
    plaza: '#b0a898',
    roofA: '#b0503c',
    roofB: '#4a6a8a',
    roofC: '#8a7a52',
    roofD: '#5a4a6a',
    wall: '#c9bfae',
  },
};
