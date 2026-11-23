// Story: eight multi-stage jobs from fixer Marisol Vega, plus taxi fares,
// street races and twelve hidden packages scattered across the six districts.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { randomRoadPoint } from './city.js';

export const JOBS = [
  {
    id: 'first-drop', title: 'FIRST DROP', grade: null,
    intro: 'New in town? I\'m Marisol. Drive to the Marina lookout, pick up my package, and drop it in Old Town. No cops, no questions.',
    stages: [
      { kind: 'goto', text: 'Drive to the Marina lookout', x: 60, z: 300 },
      { kind: 'goto', text: 'Pick up the package — then head to Old Town', x: -200, z: -200 },
      { kind: 'deliver', text: 'Deliver the package to the Old Town drop', x: -220, z: -180 },
    ],
    reward: 800, rp: 150, unlock: null,
  },
  {
    id: 'hot-wheels', title: 'HOT WHEELS', grade: null,
    intro: 'A Rukan Pelo GT is parked on Palm Row. Take it. Bring it to my garage lot in the Marina — and shake the cops first.',
    stages: [
      { kind: 'steal', text: 'Steal the Rukan Pelo GT on Palm Row', x: 260, z: -180 },
      { kind: 'drive', text: 'Bring the GT to the garage lot — lose the heat', x: 40, z: 250 },
    ],
    reward: 1500, rp: 250, unlock: 'smg',
  },
  {
    id: 'dockside-debt', title: 'DOCKSIDE DEBT', grade: null,
    intro: 'The Docks crew owes me. Go to the warehouse, make them pay, and bring back what they owe. They shoot first — so do you.',
    stages: [
      { kind: 'goto', text: 'Reach the Docks warehouse', x: 300, z: 40 },
      { kind: 'kill', text: 'Take out the Docks enforcers', count: 4, x: 300, z: 40 },
      { kind: 'deliver', text: 'Collect the cash and get clear', x: 300, z: 40 },
    ],
    reward: 2200, rp: 350, unlock: 'shotgun',
  },
  {
    id: 'getaway-driver', title: 'GETAWAY DRIVER', grade: null,
    intro: 'A courier van is running my route through Downtown. Tail it, ram it off the road, grab the case. Cops will notice — drive like it.',
    stages: [
      { kind: 'tail', text: 'Tail the courier van through Downtown', x: 0, z: 0 },
      { kind: 'ram', text: 'Ram the van until it stops', x: 0, z: 0 },
      { kind: 'deliver', text: 'Grab the case and deliver it to Palm Row', x: 220, z: -120 },
    ],
    reward: 2600, rp: 400, unlock: null,
  },
  {
    id: 'night-market', title: 'NIGHT MARKET', grade: null,
    intro: 'Rivals are hitting my market in Old Town tonight. Get on foot, hold the stalls, and drop every last one of them.',
    stages: [
      { kind: 'goto', text: 'Get to the night market in Old Town', x: -120, z: -120 },
      { kind: 'kill', text: 'Defend the market stalls', count: 5, x: -120, z: -120 },
    ],
    reward: 3000, rp: 450, unlock: 'ar',
  },
  {
    id: 'beach-run', title: 'BEACH RUN', grade: null,
    intro: 'Street race down the Beachfront strip. Three checkpoints, clock running. Win it and the strip respects your name.',
    stages: [
      { kind: 'race', text: 'Race the Beachfront strip — 3 checkpoints', checkpoints: [
        { x: -260, z: 320 }, { x: 0, z: 330 }, { x: 260, z: 320 }], time: 75 },
    ],
    reward: 3500, rp: 500, unlock: null,
  },
  {
    id: 'big-score', title: 'THE BIG SCORE', grade: null,
    intro: 'One bank, Downtown, four guards, one vault. Hit it hard, grab the cash, and lose the helicopter. This is the one, kid.',
    stages: [
      { kind: 'goto', text: 'Reach the Downtown bank', x: 40, z: -40 },
      { kind: 'kill', text: 'Clear the bank guards', count: 4, x: 40, z: -40 },
      { kind: 'deliver', text: 'Grab the vault cash and escape the heat', x: 40, z: -40 },
    ],
    reward: 6000, rp: 700, unlock: null,
  },
  {
    id: 'king-solara', title: 'KING OF SOLARA', grade: null,
    intro: 'The whole city is watching. Chase the rival boss across Solara, end his crew at the docks, and bring me his ledger. Then the city is ours.',
    stages: [
      { kind: 'tail', text: 'Chase the boss convoy out of Downtown', x: 0, z: 0 },
      { kind: 'kill', text: 'Finish the boss crew at the Docks', count: 6, x: 300, z: 100 },
      { kind: 'deliver', text: 'Bring the ledger to Marisol at the Marina', x: 60, z: 300 },
    ],
    reward: 10000, rp: 1000, unlock: null,
  },
];

export const PACKAGE_SPOTS = [
  [-260, -260], [-40, -280], [200, -280], [320, -160], [320, 140],
  [-280, 60], [-120, 120], [80, 180], [-260, 320], [120, 330],
  [280, 320], [0, -80],
];

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.rng = makeRng(2024);
    this.jobIndex = -1;       // no active job
    this.stageIndex = 0;
    this.stageProgress = 0;   // kills done / checkpoints done
    this.stageTimer = 0;
    this.active = false;
    this.completedJobs = [];
    this.beacon = null;
    this.marker = null;
    this.target = null;       // {x, z} current objective point
    this.targetCar = null;    // tail/ram target vehicle
    this.taxi = null;         // {pickup, dropoff, fare, phase}
    this.race = null;
    this.packagesFound = 0;
    this.packageMeshes = [];
    this.buildPackages();
    this.buildBeacon();
  }
  buildBeacon() {
    const geo = new THREE.CylinderGeometry(1.1, 1.1, 90, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffb02e, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 45;
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    const mGeo = new THREE.SphereGeometry(1.4, 10, 8);
    const mMat = new THREE.MeshBasicMaterial({ color: 0xffd23e });
    this.marker = new THREE.Mesh(mGeo, mMat);
    this.marker.visible = false;
    this.scene.add(this.marker);
  }
  buildPackages() {
    const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: 0x7dff9b });
    for (const [x, z] of PACKAGE_SPOTS) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, 1.2, z);
      this.scene.add(m);
      this.packageMeshes.push({ mesh: m, x, z, found: false });
    }
  }
  get job() { return this.jobIndex >= 0 ? JOBS[this.jobIndex] : null; }
  get stage() { return this.job ? this.job.stages[this.stageIndex] : null; }
  get stageCount() { return this.job ? this.job.stages.length : 0; }

  startJob(index, hooks) {
    this.jobIndex = index;
    this.stageIndex = 0;
    this.stageProgress = 0;
    this.stageTimer = 0;
    this.active = true;
    const job = this.job;
    hooks.say('MARISOL VEGA — FIXER', job.intro);
    this.setupStage(hooks);
  }
  nextJob(hooks) {
    const next = this.completedJobs.length;
    if (next >= JOBS.length) { hooks.say('MARISOL VEGA — FIXER', 'That\'s all eight, kid. Solara is yours now.'); return false; }
    this.startJob(next, hooks);
    return true;
  }
  setupStage(hooks) {
    const s = this.stage;
    if (!s) return;
    this.stageProgress = 0;
    this.stageTimer = s.time || 0;
    if (s.kind === 'kill') {
      hooks.spawnEnemies(s.x, s.z, s.count);
      this.target = { x: s.x, z: s.z };
    } else if (s.kind === 'tail' || s.kind === 'ram') {
      this.targetCar = hooks.spawnTargetCar();
      this.target = null;
    } else if (s.kind === 'race') {
      this.target = s.checkpoints[0];
      this.stageTimer = s.time;
    } else if (s.x !== undefined) {
      this.target = { x: s.x, z: s.z };
    } else {
      this.target = null;
    }
    this.updateBeacon();
  }
  updateBeacon() {
    const t = this.currentTargetPoint();
    if (t) {
      this.beacon.visible = true;
      this.marker.visible = true;
      this.beacon.position.x = t.x; this.beacon.position.z = t.z;
      this.marker.position.set(t.x, 3 + Math.sin(performance.now() / 300) * 0.5, t.z);
    } else {
      this.beacon.visible = false;
      this.marker.visible = false;
    }
  }
  currentTargetPoint() {
    if (this.targetCar && !this.targetCar.dead) return { x: this.targetCar.x, z: this.targetCar.z };
    return this.target;
  }
  stageTotal() {
    const s = this.stage;
    if (!s) return 1;
    if (s.kind === 'kill') return s.count;
    if (s.kind === 'race') return s.checkpoints.length;
    return 1;
  }
  // returns 'stage' | 'job' | null
  update(dt, px, pz, player, hooks) {
    // packages
    for (const p of this.packageMeshes) {
      if (!p.found) {
        p.mesh.rotation.y += dt;
        p.mesh.position.y = 1.2 + Math.sin(performance.now() / 400) * 0.25;
        if (Math.hypot(px - p.x, pz - p.z) < 3) {
          p.found = true; p.mesh.visible = false;
          this.packagesFound++;
          hooks.onPackage(p);
        }
      }
    }
    if (!this.active || !this.job) return null;
    const s = this.stage;
    if (s.kind === 'race') this.stageTimer -= dt;
    if (s.kind === 'race' && this.stageTimer <= 0) {
      hooks.say('MARISOL VEGA — FIXER', 'Too slow — the race is lost. Come back and try again.');
      this.active = false; this.jobIndex = -1;
      this.updateBeacon();
      return null;
    }
    const t = this.currentTargetPoint();
    if (t) {
      const d = Math.hypot(px - t.x, pz - t.z);
      if (s.kind === 'goto' || s.kind === 'deliver' || s.kind === 'drive') {
        if (d < 9) return this.advanceStage(hooks);
      } else if (s.kind === 'steal') {
        if (player.inCar && player.inCar.type.id === 'rukano' && d < 12) return this.advanceStage(hooks);
      } else if (s.kind === 'race') {
        if (d < 12) {
          this.stageProgress++;
          if (this.stageProgress >= s.checkpoints.length) return this.completeJob(hooks);
          this.target = s.checkpoints[this.stageProgress];
          hooks.say('RACE', `Checkpoint ${this.stageProgress + 1}/${s.checkpoints.length} — keep it flat out!`);
          this.updateBeacon();
        }
      } else if (s.kind === 'tail') {
        if (d < 14) {
          this.stageProgress += dt;
          if (this.stageProgress > 6) return this.advanceStage(hooks);
        }
      } else if (s.kind === 'ram') {
        if (this.targetCar && (this.targetCar.dead || this.targetCar.health < 35)) return this.advanceStage(hooks);
      }
    }
    if (s.kind === 'kill' && hooks.enemiesLeft() === 0 && this.stageProgress >= 0) {
      // all spawned enemies dead
      if (hooks.killCount() >= s.count) return this.advanceStage(hooks);
    }
    return null;
  }
  onKill() { this.stageProgress++; }
  advanceStage(hooks) {
    this.stageIndex++;
    if (this.stageIndex >= this.job.stages.length) return this.completeJob(hooks);
    this.setupStage(hooks);
    hooks.say('MARISOL VEGA — FIXER', this.stage.text);
    return 'stage';
  }
  completeJob(hooks) {
    const job = this.job;
    job.grade = this.stageTimer > 0 || true ? 'G' : 'G';
    this.completedJobs.push(job.id);
    this.active = false;
    this.jobIndex = -1;
    this.updateBeacon();
    hooks.onJobComplete(job);
    return 'job';
  }
  startTaxi(px, pz, hooks) {
    if (this.taxi) return false;
    const p = randomRoadPoint(this.rng);
    const d = randomRoadPoint(this.rng);
    const fare = Math.round(40 + Math.hypot(d.x - p.x, d.z - p.z) * 0.9);
    this.taxi = { pickup: p, dropoff: d, fare, phase: 'pickup' };
    this.target = p;
    this.updateBeacon();
    hooks.say('TAXI DISPATCH', `Fare waiting at ${Math.round(Math.hypot(px - p.x, pz - p.z))} m — pick them up.`);
    return true;
  }
  updateTaxi(px, pz, player, hooks) {
    if (!this.taxi) return;
    const t = this.taxi.phase === 'pickup' ? this.taxi.pickup : this.taxi.dropoff;
    if (Math.hypot(px - t.x, pz - t.z) < 9) {
      if (this.taxi.phase === 'pickup') {
        this.taxi.phase = 'dropoff';
        this.target = this.taxi.dropoff;
        this.updateBeacon();
        hooks.say('PASSENGER', 'To the drop-off, quick — I\'m late!');
      } else {
        hooks.onTaxiPaid(this.taxi.fare);
        this.taxi = null;
        if (!this.active) { this.target = null; this.updateBeacon(); }
        else this.updateBeacon();
      }
    }
  }
}
