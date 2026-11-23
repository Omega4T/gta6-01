// People: the on-foot player and the sidewalk crowd.
// Low-poly figures: capsule body, sphere head, simple walk bob.
import * as THREE from 'three';
import { makeRng, clamp } from './rng.js';
import { randomRoadPoint, collideBuildings, clampToCity } from './city.js';

export function makePersonMesh(shirt, pants, skin = 0xc98a6a) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.36),
    new THREE.MeshLambertMaterial({ color: shirt }));
  body.position.y = 1.05; g.add(body);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32),
    new THREE.MeshLambertMaterial({ color: pants }));
  legs.position.y = 0.35; g.add(legs);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.78; g.add(head);
  const armG = new THREE.BoxGeometry(0.16, 0.8, 0.16);
  const armM = new THREE.MeshLambertMaterial({ color: shirt });
  const aL = new THREE.Mesh(armG, armM); aL.position.set(-0.4, 1.05, 0); g.add(aL);
  const aR = new THREE.Mesh(armG, armM); aR.position.set(0.4, 1.05, 0); g.add(aR);
  g.userData.arms = [aL, aR];
  return g;
}

export class Player {
  constructor(scene) {
    this.mesh = makePersonMesh(0x2ad8c8, 0x22304a);
    // player gets a bright jacket so the chase-cam finds him instantly
    scene.add(this.mesh);
    this.x = 0; this.z = 250; this.heading = Math.PI;
    this.health = 100; this.armor = 0;
    this.speed = 0;
    this.inCar = null;
    this.walkPhase = 0;
    this.dead = false;
  }
  update(dt, input, camYaw, colliders) {
    if (this.dead || this.inCar) return;
    const sprint = input.sprint ? 1.55 : 1;
    const sp = 6.2 * sprint;
    let mx = 0, mz = 0;
    if (input.forward) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.back) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
    if (input.left) { mx -= Math.cos(camYaw); mz += Math.sin(camYaw); }
    if (input.right) { mx += Math.cos(camYaw); mz -= Math.sin(camYaw); }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      this.x += mx * sp * dt;
      this.z += mz * sp * dt;
      this.heading = Math.atan2(mx, mz);
      this.walkPhase += dt * 9 * sprint;
      this.speed = sp;
    } else {
      this.speed = 0;
    }
    const fixed = collideBuildings(colliders, this.x, this.z, 0.6);
    this.x = fixed.x; this.z = fixed.z;
    const c = clampToCity(this.x, this.z);
    this.x = c.x; this.z = c.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const bob = Math.abs(Math.sin(this.walkPhase)) * 0.08;
    this.mesh.position.y = bob;
    const swing = Math.sin(this.walkPhase) * 0.5 * (len > 0 ? 1 : 0);
    this.mesh.userData.arms[0].rotation.x = swing;
    this.mesh.userData.arms[1].rotation.x = -swing;
  }
  enterCar(car) {
    this.inCar = car;
    this.mesh.visible = false;
  }
  exitCar() {
    if (!this.inCar) return null;
    const car = this.inCar;
    this.inCar = null;
    this.x = car.x - Math.sin(car.heading) * 3.2;
    this.z = car.z - Math.cos(car.heading) * 3.2;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    return car;
  }
  damage(amount) {
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.6);
      this.armor -= absorbed;
      amount -= absorbed;
    }
    this.health -= amount;
    if (this.health <= 0) { this.health = 0; this.dead = true; }
  }
}

const SHIRTS = [0xd84a4a, 0x4a8ad8, 0xe8a03c, 0x7ac84a, 0xd8d8d8, 0xb04ad8, 0x3ad8c8, 0xe87a4a];
const PANTS = [0x22304a, 0x3a3a3a, 0x5a4a3a, 0x2a4a2a];

export class Crowd {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.rng = makeRng(4242);
    this.walkers = [];
    for (let i = 0; i < 34; i++) {
      const p = randomRoadPoint(this.rng);
      const mesh = makePersonMesh(
        this.rng.pick(SHIRTS), this.rng.pick(PANTS),
        this.rng.pick([0xc98a6a, 0x8a5a3a, 0xe8b88a, 0x6a3a22]));
      mesh.position.set(p.x + this.rng.range(-8, 8), 0, p.z + this.rng.range(-8, 8));
      scene.add(mesh);
      this.walkers.push({
        mesh, x: mesh.position.x, z: mesh.position.z,
        heading: this.rng.range(0, Math.PI * 2),
        speed: this.rng.range(1.2, 2.2),
        phase: this.rng.range(0, 6),
        panic: 0,
      });
    }
  }
  update(dt, dangerX, dangerZ, dangerActive) {
    for (const w of this.walkers) {
      if (dangerActive) {
        const d = Math.hypot(w.x - dangerX, w.z - dangerZ);
        if (d < 40) w.panic = 1.5;
      }
      if (w.panic > 0) {
        w.panic -= dt;
        // run away from the danger
        const a = Math.atan2(w.x - dangerX, w.z - dangerZ);
        w.heading = a;
        w.speed = 5;
      } else {
        w.speed = 1.6;
        if (this.rng.chance(dt * 0.05)) w.heading += this.rng.range(-1.2, 1.2);
      }
      w.x += Math.sin(w.heading) * w.speed * dt;
      w.z += Math.cos(w.heading) * w.speed * dt;
      const fixed = collideBuildings(this.colliders, w.x, w.z, 0.5);
      w.x = fixed.x; w.z = fixed.z;
      const c = clampToCity(w.x, w.z);
      if (c.x !== w.x || c.z !== w.z) { w.heading += Math.PI; w.x = c.x; w.z = c.z; }
      w.phase += dt * 7;
      w.mesh.position.set(w.x, Math.abs(Math.sin(w.phase)) * 0.05, w.z);
      w.mesh.rotation.y = w.heading;
      const swing = Math.sin(w.phase) * 0.45;
      w.mesh.userData.arms[0].rotation.x = swing;
      w.mesh.userData.arms[1].rotation.x = -swing;
    }
  }
}
