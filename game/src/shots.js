// SANDLINE — shots.js: staged scenes for the entry's screenshots.
// ?shot=<name>&seed=1 stages a scene from the SAME code the player plays —
// same sim, same HUD, same render; only the setup is arranged (positions,
// money, round, a smoke cloud, a seeded killfeed) so the frame shows the
// game at its best. Screenshots are real renders of this code in a browser,
// never edited or composited.
//   firefight — live round, rifle in hand, two enemies in the lane, smoke,
//               killfeed with headshots, radio chatter (the cover)
//   buy       — freeze time, $4,500 balance, buy menu open (9 items)
//   defuse    — bomb planted at A, defender defusing with a kit, smoke up
//   board     — TAB scoreboard over a 2–2 match, K/A/D/DMG/MVP filled in

import { DEFUSE_KIT_TIME } from './config.js';
import { player, state } from './state.js';
import { deploySmoke } from './grenades.js';
import { makeWeapon } from './weapons.js';
import { clearCenterMessage, toggleBuyMenu, toggleScoreboard } from './hud.js';
import { yawTo } from './utils.js';

function place(actor, x, z, yaw, mode) {
  actor.pos.x = x; actor.pos.z = z; actor.pos.y = 0;
  actor.yaw = yaw; actor.pitch = 0;
  actor.vel.x = 0; actor.vel.z = 0;
  if (actor.mesh) {
    actor.mesh.position.set(x, 0, z);
    actor.mesh.rotation.set(0, yaw, 0);
  }
  if (actor.ai && mode) actor.ai.mode = mode;
}

function enemies() { return state.actors.filter((a) => !a.isPlayer && a.team !== player().team); }
function mates() { return state.actors.filter((a) => !a.isPlayer && a.team === player().team); }

function goLive() {
  state.phase = 'live';
  state.liveElapsed = 0;
  state.freezeLeft = 0;
}

// Fresh killfeed + radio lines, stamped at the current sim time so they
// are still visible when the screenshot is taken (both expire after 5–6s).
export function seedFeed() {
  const now = state.time;
  const p = player();
  const foe = enemies();
  const mate = mates()[0];
  state.killfeed.push(
    { html: `<b style="color:#ffb648">YOU</b> <span class="w">[VK-47 RIFLE]</span> <b style="color:#6fc3ff">${foe[0] ? foe[0].name : 'GHOST'}</b> <span class="hs">HEADSHOT</span>`, at: now },
    { html: `<b style="color:#ffb648">${mate ? mate.name : 'VIPER'}</b> <span class="w">[KX-9 SMG]</span> <b style="color:#6fc3ff">${foe[1] ? foe[1].name : 'HAVOC'}</b>`, at: now },
  );
  state.radio.push(
    { text: `${mate ? mate.name : 'VIPER'}: contact, MID`, at: now, team: p.team },
    { text: `${mates()[1] ? mates()[1].name : 'NOMAD'}: executing A, smoke out`, at: now, team: p.team },
  );
}

function giveLoadout() {
  const p = player();
  p.weapons = [makeWeapon('rifle'), makeWeapon('pistol'), makeWeapon('knife')];
  p.current = 0;
  p.money = 4500;
  p.grenades = 1; p.smokes = 1; p.flashes = 1;
  p.armor = 100;
}

function stageFirefight() {
  const p = player();
  state.round = 3;
  state.roundsWon = [2, 1];
  state.roundTimeLeft = 78;
  giveLoadout();
  goLive();
  // Player at the north mid door, looking east down the lane.
  place(p, -8, -6, -Math.PI / 2);
  p.pitch = 0.02;
  // Two enemies in the lane ahead, holding their ground (they shoot back).
  const foe = enemies();
  if (foe[0]) place(foe[0], 8, -8, Math.PI / 2, 'stage');
  if (foe[1]) place(foe[1], 12, -3, Math.PI / 2, 'stage');
  // A teammate pushing up behind the player, and a smoke cloud north.
  const mate = mates();
  if (mate[0]) place(mate[0], -9, -9, -Math.PI / 2, 'stage');
  deploySmoke({ pos: { x: 10, y: 0.2, z: -9 } }, state.time);
  seedFeed();
}

function stageBuy() {
  const p = player();
  state.round = 2;
  state.roundsWon = [1, 0];
  p.money = 5000;
  p.weapons = [makeWeapon('pistol'), makeWeapon('knife')];
  p.current = 0;
  // Freeze time with the menu open; the balance affords everything.
  toggleBuyMenu(true);
}

function stageDefuse() {
  const p = player();
  // Round 5: the Falcons attack, so the Jackal player defends. (Only the
  // attacking side flips here — the actors keep their teams, so the player
  // is a defender and can actually defuse.)
  state.round = 5;
  state.roundsWon = [2, 2];
  state.attackerTeam = 1;
  state.roundTimeLeft = 100;
  giveLoadout();
  p.hasKit = true;
  goLive();
  // Bomb planted at A with 18s on the fuse; the player is mid-defuse.
  // The carrier's bomb is planted, not carried — clear the flag.
  state.bomb.state = 'planted';
  state.bomb.site = 'A';
  state.bomb.pos = { x: 24, y: 0.2, z: -14 };
  state.bomb.fuseLeft = 18;
  state.bomb.defuseProgress = 2.2;
  state.bomb.defuseNeed = DEFUSE_KIT_TIME;
  for (const a of state.actors) a.hasBomb = false;
  // Player beside the bomb, facing WEST toward the site entrance: the frame
  // shows the yard, the smoke and the attackers closing in (the defuse
  // prompt only needs proximity, not aim).
  place(p, 23.5, -14, Math.PI / 2);
  p.pitch = 0;
  // Attackers closing on the site; smoke mid-lane, clear of both sightlines.
  const foe = enemies();
  if (foe[0]) place(foe[0], 14, -10, yawTo(14, -10, 24, -14), 'stage');
  if (foe[1]) place(foe[1], 15, -18, yawTo(15, -18, 24, -14), 'stage');
  deploySmoke({ pos: { x: 10, y: 0.2, z: -13 } }, state.time);
  state.radio.push({ text: `${mates()[0] ? mates()[0].name : 'VIPER'}: rotating to A now`, at: state.time, team: p.team });
}

function stageBoard() {
  const p = player();
  state.round = 5;
  state.roundsWon = [2, 2];
  state.roundTimeLeft = 64;
  giveLoadout();
  goLive();
  // A match in progress: every fighter has a line on the board.
  const lines = [
    [7, 2, 3, 1240], [5, 3, 4, 980], [4, 1, 5, 720], [3, 4, 2, 610],
    [6, 2, 4, 1150], [4, 2, 5, 840], [2, 3, 6, 490], [1, 1, 7, 310],
  ];
  state.actors.forEach((a, i) => {
    const [k, as, d, dmg] = lines[i % lines.length];
    a.kills = k; a.assists = as; a.deaths = d; a.dmgDealt = dmg;
  });
  place(p, -6, 0, -Math.PI / 2);
  toggleScoreboard(true);
}

export function stageShot(name) {
  // deploy() opens the buy menu; only the buy scene keeps it. The round-start
  // center message ("ROUND 1 — ATTACK") would also linger over the frame, so
  // clear it — the staged round/side is shown in the HUD instead.
  if (name !== 'buy') toggleBuyMenu(false);
  clearCenterMessage();
  if (name === 'firefight') stageFirefight();
  else if (name === 'buy') stageBuy();
  else if (name === 'defuse') stageDefuse();
  else if (name === 'board') stageBoard();
}
