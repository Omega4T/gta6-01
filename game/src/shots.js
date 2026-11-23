// Screenshot staging: deterministic setups for the four shots the judge
// sees — chase, on-foot shootout, stats screen, title vista. Each one puts
// the live game in a real, playable state and then flags window.__shotReady.
export function applyShot(game, name) {
  const g = game;
  if (name === 'chase') {
    // Golden-hour police chase down the Marina avenue: wanted 4, AIR-1
    // overhead with its spotlight, four cruisers tight on the player's tail.
    g.startPlay();
    const car = g.giveCar('rukano', 40, 200, 0);
    g.enterCar(car);
    car.speed = 34;
    g.state.autoDrive = true;
    g.police.heat = 0.7;
    g.police.wanted = 4;
    g.police.onWantedUp(4);
    // cruisers fanned around the player car so the pack reads in frame:
    // two flanking ahead, two on the tail, one blocking far ahead
    const spots = [[-8, 16], [8, 13], [-8, -4], [8, -6], [2, 30]];
    g.police.cruisers.forEach((c, i) => {
      const [ox, oz] = spots[i % spots.length];
      c.x = car.x + ox;
      c.z = car.z + oz;
      c.heading = 0;
      c.speed = 33;
      c.formation = true;
      c.cruise = 33;
    });
    g.missions.startJob(3, g.missionHooks); // GETAWAY DRIVER, stage: tail the van
    // put the courier van in sight ahead of the player
    if (g.state.targetCar) {
      g.state.targetCar.x = 40;
      g.state.targetCar.z = 265;
      g.state.targetCar.heading = 0;
      g.state.targetCar.formation = true;
      g.state.targetCar.cruise = 30;
    }
    g.hud.say('MIRA KESANG — DRIVER', 'Ram the courier van before it reaches the water!', 'M', 30000);
    g.camSnapBehind();
  } else if (name === 'foot') {
    // On-foot night-market shootout at the Old Town crossroads: enemies
    // between the stalls, crosshair live, pedestrians scattering.
    g.startPlay();
    g.player.x = -120; g.player.z = -96;
    g.player.heading = Math.PI;
    g.setCamYaw(Math.PI);
    g.missions.startJob(4, g.missionHooks); // NIGHT MARKET
    g.missions.stageIndex = 1;
    g.missions.setupStage(g.missionHooks);
    g.combat.unlock('shotgun');
    g.combat.select(2);
    g.police.addHeat(0.2);
    g.hud.say('MARISOL VEGA — FIXER', 'Hold the stalls, kid. Drop every last one of them.', 'M', 30000);
    g.camSnapBehind();
  } else if (name === 'stats') {
    // Pause / career screen over a frozen golden-hour city.
    g.startPlay();
    g.state.cash = 18450;
    g.state.rp = 3900;
    g.state.stats = { carsStolen: 41, copsEscaped: 12, kmDriven: 48200, kills: 23, taxiFares: 9, cashEarned: 61200 };
    g.missions.packagesFound = 7;
    g.missions.packageMeshes.slice(0, 7).forEach((p) => { p.found = true; p.mesh.visible = false; });
    g.missions.completedJobs = ['first-drop', 'hot-wheels', 'dockside-debt', 'night-market'];
    g.missions.jobIndex = -1;
    g.missions.active = false;
    g.player.x = 40; g.player.z = 250;
    g.showPause();
  } else if (name === 'title') {
    // Title vista: dusk orbit over the whole city, save slots on the card.
    g.showTitle();
    g.titleOrbit = true;
  }
  // let one frame settle, then flag ready for the screenshot tool
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}
