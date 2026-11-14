// 投影スクリーン側：3Dのクレーンゲーム本体。スマホからの入力を受けてクレーンを動かす。
import * as THREE from 'three';
import { createNet } from './net.js';

const qs = new URLSearchParams(location.search);
const LOCAL = qs.has('local');
const TEST = qs.has('test');
const PLAYS = Math.max(1, +(qs.get('plays') || 2));      // 1人あたりの回数
const PRIZE_COUNT = 13;
const $ = (id) => document.getElementById(id);

// ---------- 部屋コード ----------
let room = (qs.get('room') || localStorage.getItem('crane-room-code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
if (!room) room = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
localStorage.setItem('crane-room-code', room);
const ctrlUrl = new URL(`controller.html?room=${room}${LOCAL ? '&local' : ''}`, location.href).href;
$('roomcode').textContent = `へや: ${room}`;
try {
  const q = qrcode(0, 'M'); q.addData(ctrlUrl); q.make();
  $('qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
} catch { $('qr').textContent = ctrlUrl; $('qr').style.color = '#000'; }

// ---------- 3D シーン ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
scene.background = canvasTex(16, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#2a1a7a'); gr.addColorStop(.55, '#6b2fa0'); gr.addColorStop(1, '#ff7ab8');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x8866cc, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 14, 7); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
scene.add(sun);
const pl1 = new THREE.PointLight(0xff66aa, 30, 20); pl1.position.set(-4, 6.5, 3); scene.add(pl1);
const pl2 = new THREE.PointLight(0x66ccff, 30, 20); pl2.position.set(4, 6.5, -2); scene.add(pl2);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, ...o });
function box(w, h, d, m, x, y, z, parent = scene) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b;
}

// 床・筐体
const FX = 5, FZ = 4;                                  // 床の半分の大きさ
const CHUTE = { x1: -FX, x2: -2.6, z1: 1.6, z2: FZ };   // 景品のおとし口（手前の左）
const HOME = { x: -3.8, z: 2.8 };
const LIM = { x: 4.3, z: -3.3 };
const TOP_Y = 6, GRAB_Y = 1.9, CARRY = 1.9, SPEED = 2.2;

const floorTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#fff3fa'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ffd6ea'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(5, 4);
box(FX * 2, .4, FZ * 2, mat(0xffffff, { map: floorTex }), 0, -.2, 0);
const hole = new THREE.Mesh(new THREE.PlaneGeometry(CHUTE.x2 - CHUTE.x1, CHUTE.z2 - CHUTE.z1), new THREE.MeshBasicMaterial({ color: 0x1a0a33 }));
hole.rotation.x = -Math.PI / 2; hole.position.set((CHUTE.x1 + CHUTE.x2) / 2, .01, (CHUTE.z1 + CHUTE.z2) / 2); scene.add(hole);
const fenceM = mat(0xff5fa2, { transparent: true, opacity: .55 });
box(.12, .8, CHUTE.z2 - CHUTE.z1, fenceM, CHUTE.x2, .4, (CHUTE.z1 + CHUTE.z2) / 2);
box(CHUTE.x2 - CHUTE.x1, .8, .12, fenceM, (CHUTE.x1 + CHUTE.x2) / 2, .4, CHUTE.z1);
const arrowTex = canvasTex(256, 128, (g) => {
  g.fillStyle = '#ffd93b'; g.font = 'bold 80px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GET!', 128, 68);
});
const getLabel = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true }));
getLabel.rotation.x = -Math.PI / 2; getLabel.position.set(-3.8, .02, 2.8); scene.add(getLabel);

const cabM = mat(0xff5fa2), trimM = mat(0xffd93b), frameM = mat(0x3b2a99, { metalness: .3, roughness: .4 });
box(FX * 2 + .8, 3.2, FZ * 2 + .8, cabM, 0, -2, 0);
box(FX * 2 + .9, .3, FZ * 2 + .9, trimM, 0, -.45, 0);
for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.4, 8, .4, frameM, sx * (FX + .2), 3.8, sz * (FZ + .2));
box(FX * 2 + .8, 1.3, FZ * 2 + .8, cabM, 0, 8.45, 0);
const signTex = canvasTex(1024, 128, (g, w, h) => {
  g.fillStyle = '#ffd93b'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e0247a'; g.font = '900 92px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('★ クレーンゲーム ★', w / 2, h / 2 + 6);
});
const sign = new THREE.Mesh(new THREE.PlaneGeometry(FX * 2 + .2, 1.05), new THREE.MeshBasicMaterial({ map: signTex }));
sign.position.set(0, 8.45, FZ + .41); scene.add(sign);
document.fonts?.ready.then(() => { signTex.image.getContext('2d'); redrawSign(); });
function redrawSign() {
  const g = signTex.image.getContext('2d'), w = 1024, h = 128;
  g.fillStyle = '#ffd93b'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e0247a'; g.font = '900 92px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('★ クレーンゲーム ★', w / 2, h / 2 + 6); signTex.needsUpdate = true;
}
const back = new THREE.Mesh(new THREE.PlaneGeometry(FX * 2, 8), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: .18 }));
back.position.set(0, 3.8, -FZ - .2); scene.add(back);
const bulbs = [];
for (let i = 0; i < 14; i++) {
  const b = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffee88 }));
  b.position.set(-FX + (i + .5) * (FX * 2 / 14), 7.72, FZ + .42); scene.add(b); bulbs.push(b);
}

// クレーン
const steelM = mat(0xd8dcec, { metalness: .8, roughness: .25 });
box(FX * 2 + .4, .2, .2, steelM, 0, 7.5, -FZ - .1); box(FX * 2 + .4, .2, .2, steelM, 0, 7.5, FZ + .1);
const beam = box(.3, .22, FZ * 2 + .4, steelM, 0, 7.5, 0);
const trolley = box(.9, .5, .9, mat(0xffd93b), 0, 7.2, 0);
const cable = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 1, 8), mat(0x555566)); scene.add(cable);
const claw = new THREE.Group(); scene.add(claw);
const hub = new THREE.Mesh(new THREE.CylinderGeometry(.34, .42, .5, 20), mat(0xff5fa2, { metalness: .3 }));
hub.castShadow = true; claw.add(hub);
const hinges = [];
for (let i = 0; i < 3; i++) {
  const finger = new THREE.Group(); finger.rotation.y = i * Math.PI * 2 / 3 + Math.PI / 2; claw.add(finger);
  const hinge = new THREE.Group(); hinge.position.y = -.15; finger.add(hinge);
  box(.12, 1, .22, steelM, 0, -.5, 0, hinge);
  const elbow = new THREE.Group(); elbow.position.y = -1; elbow.rotation.z = -.7; hinge.add(elbow);
  box(.12, .8, .22, steelM, 0, -.4, 0, elbow);
  hinges.push(hinge);
}
const marker = new THREE.Mesh(new THREE.RingGeometry(.55, .72, 32), new THREE.MeshBasicMaterial({ color: 0xff2e88, transparent: true, opacity: .8 }));
marker.rotation.x = -Math.PI / 2; marker.position.y = .03; scene.add(marker);

const crane = { x: HOME.x, z: HOME.z, y: TOP_Y, open: 0 };   // open: 0=とじる 1=ひらく
function placeCrane() {
  beam.position.x = crane.x; trolley.position.set(crane.x, 7.2, crane.z);
  claw.position.set(crane.x, crane.y, crane.z);
  const len = 7.0 - crane.y; cable.scale.y = len; cable.position.set(crane.x, crane.y + len / 2, crane.z);
  hinges.forEach((h) => { h.rotation.z = .35 + crane.open * .5; });
  marker.position.x = crane.x; marker.position.z = crane.z;
}

// ---------- 景品 ----------
const PRIZES = [
  { name: 'くま', emoji: '🐻', body: 0xb9783f, belly: 0xf3d9b1, ear: 'round', s: .95 },
  { name: 'うさぎ', emoji: '🐰', body: 0xffb7d5, belly: 0xffffff, ear: 'long', s: .9 },
  { name: 'ねこ', emoji: '🐱', body: 0xffb347, belly: 0xfff1d6, ear: 'cat', s: .9 },
  { name: 'パンダ', emoji: '🐼', body: 0xffffff, belly: 0xffffff, ear: 'round', earColor: 0x222222, limb: 0x222222, s: 1 },
  { name: 'ひよこ', emoji: '🐥', body: 0xffe14d, belly: 0xfff6b0, ear: 'none', beak: true, s: .8 },
  { name: 'ペンギン', emoji: '🐧', body: 0x2f4a8a, belly: 0xffffff, ear: 'none', beak: true, s: .9 },
  { name: 'カエル', emoji: '🐸', body: 0x6ccf5a, belly: 0xd9f7c4, ear: 'frog', s: .85 },
  { name: 'カプセル', emoji: '🔮', capsule: true, s: .62 },
  { name: 'きんのくま', emoji: '🏆', body: 0xffc21a, belly: 0xffe58a, ear: 'round', s: .8, gold: true, rare: true },
];
const sph = (r, m, x, y, z, p, sx = 1, sy = 1, sz = 1) => {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
  o.castShadow = true; p.add(o); return o;
};
function buildPrize(d) {
  const g = new THREE.Group();
  if (d.capsule) {
    const col = [0xff5fa2, 0x4dc3ff, 0x8ce04a, 0xffa733, 0xb07cff][Math.floor(Math.random() * 5)];
    const top = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(col, { roughness: .25 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xffffff, { roughness: .25 }));
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, .06, 8, 24), mat(0xeeeeee)); band.rotation.x = Math.PI / 2;
    [top, bot, band].forEach((m) => { m.position.y = 1; m.castShadow = true; g.add(m); });
    g.scale.setScalar(d.s); g.userData = { r: d.s, h: d.s * 2 };
    return g;
  }
  const o = d.gold ? { metalness: .85, roughness: .25 } : {};
  const bm = mat(d.body, o), lm = mat(d.limb ?? d.body, o), em = mat(d.earColor ?? d.body, o), wm = mat(d.belly, o), k = mat(0x1a1a1a, { roughness: .3 });
  sph(.62, bm, 0, .62, 0, g, 1, .95, .9);
  sph(.55, bm, 0, 1.38, 0, g);
  sph(.4, wm, 0, .6, .3, g, 1, 1, .7);
  sph(.2, lm, -.6, .78, .1, g); sph(.2, lm, .6, .78, .1, g);
  sph(.22, lm, -.3, .14, .32, g); sph(.22, lm, .3, .14, .32, g);
  if (d.ear === 'frog') {
    for (const s of [-1, 1]) { sph(.2, wm, s * .26, 1.85, .12, g); sph(.09, k, s * .26, 1.88, .29, g); }
  } else {
    sph(.075, k, -.2, 1.45, .49, g); sph(.075, k, .2, 1.45, .49, g);
    if (d.limb) { sph(.15, lm, -.2, 1.45, .42, g, 1, 1.2, .5); sph(.15, lm, .2, 1.45, .42, g, 1, 1.2, .5); }
  }
  if (d.beak) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(.11, .26, 12), mat(0xff8a1f)); c.rotation.x = Math.PI / 2; c.position.set(0, 1.3, .6); g.add(c);
  } else if (d.ear !== 'frog') { sph(.17, wm, 0, 1.27, .45, g, 1, .8, .7); sph(.06, k, 0, 1.31, .58, g); }
  if (d.ear === 'round') { sph(.2, em, -.4, 1.82, 0, g); sph(.2, em, .4, 1.82, 0, g); }
  if (d.ear === 'long') { sph(.14, em, -.2, 2.12, 0, g, 1, 3, .7); sph(.14, em, .2, 2.12, 0, g, 1, 3, .7); }
  if (d.ear === 'cat') for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(.2, .36, 4), em); c.position.set(s * .33, 1.9, 0); c.castShadow = true; g.add(c);
  }
  g.scale.setScalar(d.s); g.userData = { r: .72 * d.s, h: 2 * d.s };
  return g;
}

let prizes = [];   // {def, mesh, x, z, r}
const inChute = (x, z, pad = 0) => x < CHUTE.x2 + pad && z > CHUTE.z1 - pad;
function freeSpot(r) {
  for (let i = 0; i < 300; i++) {
    const x = -4.2 + Math.random() * 8.4, z = -3.3 + Math.random() * 6.6;
    if (inChute(x, z, r + .3)) continue;
    if (prizes.every((p) => Math.hypot(p.x - x, p.z - z) > (p.r + r) * (i < 200 ? 1 : .7))) return { x, z };
  }
  return { x: 2, z: -2 };
}
function spawnPrize(def, animate) {
  const mesh = buildPrize(def); const r = mesh.userData.r; const { x, z } = freeSpot(r);
  mesh.position.set(x, animate ? 9 + Math.random() * 3 : 0, z); mesh.rotation.y = (Math.random() - .5) * 1.2;
  scene.add(mesh);
  const p = { def, mesh, x, z, r }; prizes.push(p);
  const y0 = mesh.position.y;
  if (animate) tween(.7 + Math.random() * .4, (k) => { mesh.position.y = (1 - k * k) * y0; });
  return p;
}
function fillPrizes(animate) {
  let hasRare = prizes.some((p) => p.def.rare);
  while (prizes.length < PRIZE_COUNT) {
    let def;
    if (!hasRare) { def = PRIZES.find((d) => d.rare); hasRare = true; }
    else { const normal = PRIZES.filter((d) => !d.rare); def = normal[(prizes.length * 3 + Math.floor(Math.random() * 2)) % normal.length]; }
    spawnPrize(def, animate);
  }
}

// ---------- アニメーション ----------
const tweens = [];
const tween = (dur, fn) => new Promise((res) => tweens.push({ t: 0, dur, fn, res }));
const wait = (d) => tween(d, () => {});
const ease = (k) => k * k * (3 - 2 * k);

// ---------- 音 ----------
let ac = null, hum = null;
function beep(f, d = .12, type = 'square', v = .08, when = 0) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + when;
  o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + .02);
}
function setHum(on) {
  if (!ac) return;
  if (on && !hum) {
    const o = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
    o.type = 'triangle'; o.frequency.value = 330; g.gain.value = .05; l.frequency.value = 8; lg.gain.value = 40;
    l.connect(lg).connect(o.frequency); o.connect(g).connect(ac.destination); o.start(); l.start(); hum = { o, l };
  } else if (!on && hum) { hum.o.stop(); hum.l.stop(); hum = null; }
}
const fanfare = () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => beep(f, .22, 'square', .09, i * .11));
const sad = () => [392, 330, 262, 196].forEach((f, i) => beep(f, .3, 'triangle', .1, i * .2));

// ---------- 画面の表示 ----------
let bannerTimer = 0;
function banner(html, ms = 1800) {
  const b = $('banner'); b.innerHTML = html; b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), ms);
}
function confetti() {
  const chars = ['🎉', '⭐', '🎊', '✨', '💖'];
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('span'); s.className = 'confetti'; s.textContent = chars[i % chars.length];
    s.style.left = Math.random() * 74 + 'vw'; s.style.animationDuration = 1.6 + Math.random() * 1.6 + 's'; s.style.animationDelay = Math.random() * .5 + 's';
    document.body.appendChild(s); setTimeout(() => s.remove(), 4200);
  }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const GUIDE = {
  idle: '📱 スマホで QRコードを よみとってね',
  x: '① 「→」ボタンを おしている あいだ、よこに うごくよ',
  z: '② 「↑」ボタンを おしている あいだ、おくに うごくよ',
  auto: 'つかめるかな…？',
};
const gets = [];
function renderHud() {
  $('guide').textContent = GUIDE[phase];
  $('now').textContent = cur ? `${cur.name} さん` : '—';
  $('left').textContent = cur ? `のこり ${cur.left} かい` : 'だれでも さんか できるよ';
  const q = $('queue'); q.innerHTML = '';
  if (!queue.length) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'まっている人は いないよ'; q.appendChild(li); }
  queue.slice(0, 7).forEach((id, i) => {
    const li = document.createElement('li'); const b = document.createElement('b'); b.textContent = i + 1;
    li.append(b, `${known[id].name} さん`); q.appendChild(li);
  });
  if (queue.length > 7) { const li = document.createElement('li'); li.className = 'none'; li.textContent = `ほか ${queue.length - 7} 人`; q.appendChild(li); }
  $('gets').textContent = gets.slice(-24).join('');
}

// ---------- ゲームの進行 ----------
const epoch = Math.random().toString(36).slice(2, 8);
const known = {};          // id -> {name, n, join, state}
let queue = [];            // 待っている人の id
let cur = null;            // {id, name, left}
let phase = 'idle';        // idle | x | z | auto
let last = null;           // 直前の結果 {id, n, prize}
let lastN = 0;
let ax = null;             // いま動かしている軸 {state: wait|hold|settle, start, t0, target}
let phaseT = 0;
let net = null;
let now = 0;

function publish() {
  renderHud();
  net?.setRoom({
    epoch, phase, plays: PLAYS,
    cur: cur ? { id: cur.id, name: cur.name, left: cur.left } : null,
    queue: queue.map((id) => ({ id, name: known[id].name })),
    last, t: Date.now(),
  });
}

function onPlayers(m) {
  let changed = false;
  for (const [id, p] of Object.entries(m)) {
    if (p.epoch !== epoch) { net.removePlayer(id); continue; }
    const name = String(p.name || 'ゲスト').slice(0, 8);
    const n = p.ev?.n || 0, join = p.join || 0;
    let k = known[id];
    if (!k) { k = known[id] = { name, n, join, state: 'queue' }; queue.push(id); changed = true; beep(880, .1, 'sine'); }
    else if (k.state === 'done' && join > k.join) { Object.assign(k, { name, n, join, state: 'queue' }); queue.push(id); changed = true; beep(880, .1, 'sine'); }
    if (n > k.n) { k.n = n; if (cur && cur.id === id) input(p.ev.k, !!p.ev.down, p.ev.dur); }
  }
  // いなくなった人を列から外す
  const gone = queue.filter((id) => !m[id]);
  if (gone.length) { queue = queue.filter((id) => m[id]); gone.forEach((id) => delete known[id]); changed = true; }
  if (changed) { publish(); nextTurn(); }
}

function nextTurn() {
  if (cur || phase !== 'idle' || !queue.length) return;
  const id = queue.shift();
  known[id].state = 'play';
  cur = { id, name: known[id].name, left: PLAYS };
  startPlay(true);
}
function startPlay(first) {
  phase = 'x'; ax = { state: 'wait' }; phaseT = now;
  banner(first ? `${esc(cur.name)} さんの ばん！<small>① → ボタンを ながおし</small>` : `もう いっかい！<small>のこり ${cur.left} かい</small>`, 1700);
  beep(660, .1); beep(880, .15, 'square', .08, .12);
  publish();
}
function endTurn() {
  if (cur && known[cur.id]) known[cur.id].state = 'done';
  cur = null; phase = 'idle'; ax = null; setHum(false);
  publish(); nextTurn();
}

// スマホ（またはキーボード）からの入力。down=おした / up=はなした（dur=おしていたミリ秒）
function input(k, down, dur) {
  if (!cur || phase !== k || !ax) return;
  const pos = k === 'x' ? crane.x : crane.z;
  if (down) {
    if (ax.state === 'wait') { ax.state = 'hold'; ax.start = pos; ax.t0 = now; setHum(true); }
  } else if (ax.state === 'wait' || ax.state === 'hold') {
    if (ax.state === 'wait') { ax.start = pos; ax.t0 = now; }
    const sec = dur != null ? Math.min(dur, 10000) / 1000 : now - ax.t0;
    ax.target = k === 'x' ? Math.min(LIM.x, ax.start + SPEED * sec) : Math.max(LIM.z, ax.start - SPEED * sec);
    ax.state = 'settle';
  }
}

function stepAxis(dt) {
  if (phase !== 'x' && phase !== 'z') return;
  const k = phase, dir = k === 'x' ? 1 : -1, lim = LIM[k];
  let pos = k === 'x' ? crane.x : crane.z;
  if (ax.state === 'wait') {
    const limit = k === 'x' ? 25 : 15;
    if (now - phaseT > limit) {
      if (k === 'x') { banner('じかんぎれ…<small>つぎの人へ</small>', 1600); endTurn(); return; }
      ax.target = pos; ax.state = 'settle';
    }
  } else if (ax.state === 'hold') {
    pos += dir * SPEED * dt; pos = dir > 0 ? Math.min(lim, pos) : Math.max(lim, pos);
    if (now - ax.t0 > 9) { ax.target = pos; ax.state = 'settle'; }       // はなした合図が来ないとき
  }
  if (ax.state === 'settle') {
    const d = ax.target - pos, step = SPEED * 1.5 * dt;
    pos = Math.abs(d) <= step ? ax.target : pos + Math.sign(d) * step;
    if (pos === ax.target) {
      setHum(false); beep(520, .08);
      if (k === 'x') { crane.x = pos; phase = 'z'; ax = { state: 'wait' }; phaseT = now; publish(); return; }
      crane.z = pos; phase = 'auto'; ax = null; publish(); runAuto(); return;
    }
  }
  if (k === 'x') crane.x = pos; else crane.z = pos;
}

async function dropPrize(p) {
  const win = inChute(p.x, p.z);
  const y0 = p.mesh.position.y, y1 = win ? -2.5 : 0;
  await tween(Math.sqrt(Math.max(.1, y0 - y1)) * .28, (k) => {
    p.mesh.position.y = y0 + (y1 - y0) * k * k;
    if (win && p.mesh.position.y < 0) p.mesh.scale.multiplyScalar(.9);
  });
  if (win) { scene.remove(p.mesh); prizes = prizes.filter((q) => q !== p); return true; }
  beep(180, .12, 'triangle', .12);
  // ほかの景品と かさならないように すこし ずらす
  for (let it = 0; it < 8; it++) for (const q of prizes) {
    if (q === p) continue;
    const dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz) || .01, min = (p.r + q.r) * .85;
    if (d < min) { p.x += dx / d * (min - d); p.z += dz / d * (min - d); }
  }
  p.x = Math.max(-4.3, Math.min(4.3, p.x)); p.z = Math.max(-3.4, Math.min(3.4, p.z));
  if (inChute(p.x, p.z, p.r)) { p.x = Math.max(p.x, CHUTE.x2 + p.r); }
  const fx = p.mesh.position.x, fz = p.mesh.position.z;
  await tween(.25, (k) => { p.mesh.position.x = fx + (p.x - fx) * k; p.mesh.position.z = fz + (p.z - fz) * k; });
  return false;
}

async function runAuto() {
  const player = cur;
  await tween(.4, (k) => { crane.open = k; });
  beep(300, 1.2, 'sawtooth', .03);
  await tween(1.3, (k) => { crane.y = TOP_Y + (GRAB_Y - TOP_Y) * ease(k); });
  // いちばん近い景品をさがす
  let target = null, best = 1e9;
  for (const p of prizes) { const d = Math.hypot(p.x - crane.x, p.z - crane.z); if (d < best) { best = d; target = p; } }
  let q = target ? 1 - best / (target.r + .3) : 0;      // つかみぐあい 0〜1
  if (target?.def.rare) q -= .12;                        // レアは ちょっと むずかしい
  if (q <= 0) target = null;
  await tween(.5, (k) => { crane.open = 1 - k * (target ? .55 : 1); });
  beep(700, .08);
  let held = target, dropping = null;
  const carry = () => { if (held) { held.x = crane.x; held.z = crane.z; held.mesh.position.set(crane.x, crane.y - CARRY, crane.z); } };
  const release = () => { if (!held) return; const p = held; held = null; dropping = dropPrize(p); tween(.3, (k) => { crane.open = .45 + .55 * k; }); };
  if (held) await tween(.25, (k) => { held.mesh.position.x += (crane.x - held.mesh.position.x) * k; held.mesh.position.z += (crane.z - held.mesh.position.z) * k; });
  const weak = q < .15, secure = q >= .55;
  await tween(1.3, (k) => { crane.y = GRAB_Y + (TOP_Y - GRAB_Y) * ease(k); carry(); if (weak && k > .3) release(); });
  // おとし口へ もどる（つかみが あさいと とちゅうで おちる）
  const slipAt = secure ? 2 : (q - .15) / .4 * .9;
  const dz = HOME.z - crane.z, dx = HOME.x - crane.x, total = Math.abs(dz) + Math.abs(dx) || 1;
  const z0 = crane.z, x0 = crane.x;
  setHum(true);
  await tween(Math.max(.2, total / 3.2), (k) => {
    const d = k * total;
    if (d <= Math.abs(dz)) crane.z = z0 + Math.sign(dz) * d; else { crane.z = HOME.z; crane.x = x0 + Math.sign(dx) * (d - Math.abs(dz)); }
    carry(); if (k >= slipAt) release();
  });
  setHum(false);
  await wait(.25);
  release();
  await tween(.3, (k) => { crane.open = Math.max(crane.open, k); });
  const won = dropping ? await dropping : false;
  await tween(.3, (k) => { crane.open = 1 - k; });

  const prize = won && target ? { name: target.def.name, emoji: target.def.emoji, rare: !!target.def.rare } : null;
  last = { id: player.id, n: ++lastN, prize };
  if (prize) {
    gets.push(prize.emoji); fanfare(); confetti();
    banner(`<span class="big">${prize.emoji}</span>${prize.rare ? 'レア！ ' : ''}${esc(prize.name)} ゲット！<small>${esc(player.name)} さん おめでとう！</small>`, 3000);
  } else {
    sad(); banner(target ? 'おしい！<small>もうちょっと まんなかを ねらおう</small>' : 'ざんねん…<small>かげの わっかを けいひんに あわせよう</small>', 2400);
  }
  player.left--;
  publish();
  await wait(prize ? 3.2 : 2.6);
  if (prizes.length < 6) { fillPrizes(true); banner('けいひんを ほじゅう！', 1400); await wait(1.5); }
  if (cur !== player) return;
  if (player.left > 0) startPlay(false); else endTurn();
}

// キーボードでも遊べる（→ と ↑）。だれも いないときは「キーボード」さんとして始まる
const KEYS = { ArrowRight: 'x', ArrowUp: 'z' };
addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); return; }
  const k = KEYS[e.key]; if (!k || e.repeat) return;
  e.preventDefault(); press(k);
});
addEventListener('keyup', (e) => { const k = KEYS[e.key]; if (k) input(k, false, null); });
function press(k) {
  if (!cur && phase === 'idle' && !queue.length && k === 'x') {
    known.kbd = { name: 'キーボード', n: 0, join: 0, state: 'play' };
    cur = { id: 'kbd', name: 'キーボード', left: 1 }; startPlay(true);
  }
  input(k, true);
}

// ---------- ループ ----------
function resize() {
  const w = innerWidth, h = innerHeight, panel = $('panel').offsetWidth;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.setViewOffset(w, h, panel / 2, 0, w, h); camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

let prev = performance.now(), manual = false;
function update(dt) {
  now += dt;
  stepAxis(dt);
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i]; tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn(k);
    if (k >= 1) { tweens.splice(i, 1); tw.res(); }
  }
  placeCrane();
}
function frame(t) {
  const dt = Math.min(.05, (t - prev) / 1000); prev = t;
  if (!manual) update(dt);
  const sway = phase === 'idle' ? 2.2 : .5;
  camera.position.set(Math.sin(now * .25) * sway, 8.4, 19.5); camera.lookAt(0, 3.7, 0);
  bulbs.forEach((b, i) => { b.material.emissiveIntensity = (Math.floor(now * 3) + i) % 2 ? 1.6 : .15; });
  marker.material.opacity = .55 + .35 * Math.sin(now * 6);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

fillPrizes(false);
renderHud();
requestAnimationFrame(frame);

$('start').addEventListener('click', () => {
  $('start').remove();
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); beep(660, .1); beep(990, .2, 'square', .08, .1); } catch {}
});

const showErr = (e) => {
  console.error(e);
  $('err').style.display = 'block';
  $('err').textContent = 'スマホと つながりません（' + (e?.code || e?.message || e) + '）。Firestore のルール（firestore.rules）を かくにんしてね。キーボードの → ↑ では あそべます。';
};
createNet(room, { local: LOCAL, onError: showErr }).then((n) => {
  net = n; publish(); net.onPlayers(onPlayers);
  setInterval(publish, 60000);   // スクリーンが ついている合図
}).catch(showErr);

if (TEST) window.__crane = {
  get state() { return { phase, cur, queue: [...queue], crane: { ...crane }, last, prizes: prizes.map((p) => ({ name: p.def.name, x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: p.r })) }; },
  press, release: (k, dur) => input(k, false, dur ?? null),
  moveTo(x, z) { crane.x = x; crane.z = z; },
  // テスト用：描画を待たずに ゲームの時間を sec 秒すすめる
  async tick(sec) { manual = true; for (let t = 0; t < sec; t += 1 / 30) { update(1 / 30); await new Promise((r) => setTimeout(r, 0)); } },
  auto() { manual = false; },
};
