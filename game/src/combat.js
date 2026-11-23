// Combat: the player's weapons, bullets, enemy shooters, and pickups.
// The player aims with the mouse and fires with a click (or holds for the
// SMG). Enemies walk toward the player and shoot when close enough. Bullets
// die on buildings, hurt enemies and cars, and enemy bullets hurt the player
// or the car they are driving. Pickups on the ground refill health, armour
// and ammo; hidden cash packages pay out when found.
import { WEAPONS, PLAYER, PACKAGE_REWARD } from './config.js';
import { dist2, angleTo } from './random.js';
import { scareNearbyPeds } from './crowd.js';
import { damageCar, playerCar } from './vehicles.js';

export function spawnEnemy(game, x, y) {
  const e = {
    x: x + game.rng.range(-60, 60),
    y: y + game.rng.range(-60, 60),
    angle: 0,
    hp: 60,
    cooldown: game.rng.range(0.5, 1.5),
    speed: 120,
    dead: false,
  };
  game.state.enemies.push(e);
  return e;
}

export function fireWeapon(game) {
  const st = game.state;
  const p = st.player;
  const w = WEAPONS[p.weapon];
  if (p.weapon !== 'fists') {
    if ((st.ammo[p.weapon] || 0) <= 0) {
      game.say('Out of ammo — find a pickup (green crate).', 2);
      return;
    }
    st.ammo[p.weapon]--;
  }
  st.stats.shots++;
  const base = p.angle;
  for (let i = 0; i < w.pellets; i++) {
    const a = base + game.rng.range(-1, 1) * w.spread;
    st.bullets.push({
      x: p.x + Math.cos(a) * 22,
      y: p.y + Math.sin(a) * 22,
      angle: a,
      speed: 950,
      life: w.range / 950,
      damage: w.damage,
      fromPlayer: true,
    });
  }
  st.casings.push({
    x: p.x,
    y: p.y,
    angle: base + Math.PI / 2,
    life: 1.2,
  });
  game.burst(p.x + Math.cos(base) * 26, p.y + Math.sin(base) * 26, '#ffd23f', 4, 120);
  if (game.audio) game.audio.shot();
  scareNearbyPeds(game, p.x, p.y, 500);
}

// Damage to the player: armour absorbs first, then health. At zero health
// the player is wasted, pays a hospital bill and retries.
export function hurtPlayer(game, amount) {
  const st = game.state;
  const p = st.player;
  let n = amount;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, n);
    p.armour -= absorbed;
    n -= absorbed;
  }
  p.hp -= n;
  if (p.hp <= 0) {
    p.hp = 0;
    st.screen = 'wasted';
    game.addCash(-Math.min(st.cash, 200));
    game.save();
    if (game.audio) game.audio.busted();
  }
}

export function updateBullets(game, dt) {
  const st = game.state;
  for (const b of st.bullets) {
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    if (game.city.collidesBuilding(b.x, b.y, 2)) {
      b.life = 0;
      game.burst(b.x, b.y, '#d8c98a', 3, 80);
      continue;
    }
    if (b.fromPlayer) {
      for (const e of st.enemies) {
        if (!e.dead && dist2(b.x, b.y, e.x, e.y) < 18 * 18) {
          e.hp -= b.damage;
          b.life = 0;
          game.burst(b.x, b.y, '#c94f43', 6, 120);
          if (e.hp <= 0) {
            e.dead = true;
            st.kills++;
            game.burst(e.x, e.y, '#c94f43', 12, 180);
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const car of st.cars) {
        if (!car.dead && dist2(b.x, b.y, car.x, car.y) < 24 * 24) {
          damageCar(game, car, b.damage);
          b.life = 0;
          // Shooting a traffic car makes its driver flee — and adds a star.
          if (car.traffic) {
            car.traffic = false;
            car.flee = 4;
            game.addWanted(1);
          }
          break;
        }
      }
    } else {
      if (dist2(b.x, b.y, st.player.x, st.player.y) < 16 * 16) {
        b.life = 0;
        hurtPlayer(game, b.damage);
        game.burst(b.x, b.y, '#c94f43', 5, 100);
      }
      const pcar = playerCar(game);
      if (pcar && dist2(b.x, b.y, pcar.x, pcar.y) < 26 * 26) {
        b.life = 0;
        damageCar(game, pcar, b.damage);
      }
    }
  }
  st.bullets = st.bullets.filter((b) => b.life > 0);
}

// Enemies close in to 260 units, then hold and shoot on a random cadence.
export function updateEnemies(game, dt) {
  const st = game.state;
  for (const e of st.enemies) {
    if (e.dead) continue;
    const p = st.player;
    const d = Math.sqrt(dist2(e.x, e.y, p.x, p.y));
    e.angle = angleTo(e.x, e.y, p.x, p.y);
    if (d > 260) {
      e.x += Math.cos(e.angle) * e.speed * dt;
      e.y += Math.sin(e.angle) * e.speed * dt;
    }
    e.cooldown -= dt;
    if (e.cooldown <= 0 && d < 480) {
      e.cooldown = game.rng.range(0.9, 1.8);
      st.bullets.push({
        x: e.x + Math.cos(e.angle) * 20,
        y: e.y + Math.sin(e.angle) * 20,
        angle: e.angle + game.rng.range(-0.06, 0.06),
        speed: 700,
        life: 0.8,
        damage: 9,
        fromPlayer: false,
      });
      game.burst(e.x + Math.cos(e.angle) * 24, e.y + Math.sin(e.angle) * 24, '#ffd23f', 3, 100);
    }
  }
}

// Pickups on the ground and the twelve hidden cash packages.
export function updatePickups(game) {
  const st = game.state;
  const p = st.player;
  for (const pk of game.city.pickups) {
    if (!pk.taken && dist2(p.x, p.y, pk.x, pk.y) < 30 * 30) {
      pk.taken = true;
      if (pk.kind === 'health') p.hp = Math.min(100, p.hp + 40);
      else if (pk.kind === 'armour') p.armour = Math.min(100, p.armour + 50);
      else {
        p.weapon = pk.kind;
        st.ammo[pk.kind] = (st.ammo[pk.kind] || 0) + 60;
      }
      game.say('Picked up ' + pk.kind + '!', 2);
      if (game.audio) game.audio.pickup();
    }
  }
  for (const pkg of game.city.packages) {
    if (!pkg.found && dist2(p.x, p.y, pkg.x, pkg.y) < 30 * 30) {
      pkg.found = true;
      st.packagesFound++;
      game.addCash(PACKAGE_REWARD);
      game.say('Hidden package found! +$' + PACKAGE_REWARD + ' (' + st.packagesFound + '/12)', 3);
      if (game.audio) game.audio.pickup();
    }
  }
}
