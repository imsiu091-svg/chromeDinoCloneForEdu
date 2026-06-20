'use strict';

// ===== 상수 =====
const GRAVITY        = 0.0025;   // px/ms²
const JUMP_VEL       = -0.65;    // px/ms
const INITIAL_SPEED  = 0.25;     // px/ms
const MAX_SPEED      = 0.70;     // px/ms
const SPEED_ACCEL    = 0.000028; // px/ms per ms
const SCORE_INTERVAL = 50;       // ms per score point
const DAY_CYCLE_PTS  = 700;      // 낮/밤 전환 점수

// 공룡 치수 (px)
const PX           = 4;
const DINO_X       = 80;
const DINO_W       = 48;   // 12픽셀 × 4px
const DINO_H_NORM  = 56;   // 14픽셀 × 4px
const DINO_H_CROUCH= 32;   // 8픽셀 × 4px
const GROUND_BOTTOM= 20;   // #ground 높이

// ===== DOM 참조 =====
const gameEl       = document.getElementById('game');
const dinoEl       = document.getElementById('dino');
const obstaclesEl  = document.getElementById('obstacles');
const scoreEl      = document.getElementById('score');
const hiScoreEl    = document.getElementById('hi-score');
const groundA      = document.getElementById('ground-strip-a');
const groundB      = document.getElementById('ground-strip-b');

const GAME_W       = gameEl.clientWidth;  // 800
const GROUND_Y     = gameEl.clientHeight - GROUND_BOTTOM; // 공룡 bottom 기준 (280)

// ===== 게임 상태 =====
let STATE       = 'idle';
let raf         = null;
let prevTs      = 0;

let score       = 0;
let scoreTick   = 0;
let hiScore     = parseInt(localStorage.getItem('dinoHiScore') || '0', 10);
let gameSpeed   = INITIAL_SPEED;
let pteroUnlock = 300;
let cycleCount  = 0;

// 공룡 물리
const dino = { y: 0, vy: 0, onGround: true, crouching: false };

// 바닥 스크롤
let groundX = 0;

// 장애물 배열
let obstacles = [];
let spawnTimer = 0;
let nextSpawn  = 1500;

// 달리기 애니메이션
let legTimer   = 0;
let legFrame   = false; // false=A, true=B

// 익룡 날개 애니메이션
let pteroTimer = 0;

// ===== 초기화 =====
hiScoreEl.textContent = 'HI ' + fmt(hiScore);

function setState(s) {
  STATE = s;
  document.body.dataset.state = s;
}

// ===== 게임 시작 / 리셋 =====
function startGame() {
  // 리셋
  score      = 0;
  scoreTick  = 0;
  gameSpeed  = INITIAL_SPEED;
  groundX    = 0;
  spawnTimer = 0;
  nextSpawn  = 1500;
  legTimer   = 0;
  legFrame   = false;
  pteroTimer = 0;
  cycleCount = 0;
  pteroUnlock= 200 + Math.floor(Math.random() * 300);

  dino.y        = 0;
  dino.vy       = 0;
  dino.onGround = true;
  dino.crouching= false;

  dinoEl.className = '';
  document.body.classList.remove('night');

  obstacles.forEach(o => o.el.remove());
  obstacles = [];

  scoreEl.textContent = fmt(0);

  setState('running');
  prevTs = performance.now();
  raf = requestAnimationFrame(gameLoop);
}

function gameOver() {
  cancelAnimationFrame(raf);
  raf = null;
  if (score > hiScore) {
    hiScore = score;
    localStorage.setItem('dinoHiScore', hiScore);
    hiScoreEl.textContent = 'HI ' + fmt(hiScore);
  }
  setState('gameover');
}

// ===== 입력 =====
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (STATE === 'idle' || STATE === 'gameover') { startGame(); return; }
    if (STATE === 'running') jump();
  }
  if (e.code === 'ArrowDown') {
    e.preventDefault();
    if (STATE !== 'running') return;
    dino.crouching = true;
    dinoEl.classList.add('crouching');
    if (!dino.onGround && dino.vy < 0) dino.vy = 0;
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'ArrowDown') {
    dino.crouching = false;
    dinoEl.classList.remove('crouching');
  }
});

// 터치
gameEl.addEventListener('touchstart', e => {
  e.preventDefault();
  if (STATE === 'idle' || STATE === 'gameover') { startGame(); return; }
  if (STATE === 'running') jump();
}, { passive: false });

function jump() {
  if (dino.onGround && !dino.crouching) {
    dino.vy = JUMP_VEL;
    dino.onGround = false;
  }
}

// ===== 게임 루프 =====
function gameLoop(ts) {
  const dt = Math.min(ts - prevTs, 50);
  prevTs = ts;

  update(dt);

  raf = requestAnimationFrame(gameLoop);
}

function update(dt) {
  updateSpeed(dt);
  updateDino(dt);
  updateGround(dt);
  updateObstacles(dt);
  updateSpawner(dt);
  updateScore(dt);
  updateAnimations(dt);
  checkCollisions();
  checkDayNight();
}

// ===== 속도 =====
function updateSpeed(dt) {
  gameSpeed = Math.min(MAX_SPEED, gameSpeed + SPEED_ACCEL * dt);
}

// ===== 공룡 물리 =====
function updateDino(dt) {
  if (!dino.onGround) {
    dino.vy += GRAVITY * dt;
    dino.y  -= dino.vy  * dt;  // y는 바닥에서의 높이 (bottom offset)
    if (dino.y <= 0) {
      dino.y = 0;
      dino.vy = 0;
      dino.onGround = true;
    }
  }
  dinoEl.style.bottom = (GROUND_BOTTOM + dino.y) + 'px';
}

// ===== 바닥 스크롤 =====
function updateGround(dt) {
  groundX -= gameSpeed * dt;
  if (groundX <= -800) groundX += 800;
  groundA.style.transform = `translateX(${groundX}px)`;
  groundB.style.transform = `translateX(${groundX + 800}px)`;
}

// ===== 장애물 이동 =====
function updateObstacles(dt) {
  const dx = gameSpeed * dt;
  for (const obs of obstacles) {
    obs.divX -= dx;
    obs.x    -= dx;
    obs.el.style.left = obs.divX + 'px';
  }
  obstacles = obstacles.filter(obs => {
    if (obs.divX < -200) { obs.el.remove(); return false; }
    return true;
  });
}

// ===== 스폰 =====
function updateSpawner(dt) {
  spawnTimer += dt;
  if (spawnTimer >= nextSpawn) {
    spawnTimer = 0;
    nextSpawn = Math.max(600, 2000 - gameSpeed * 1500) + Math.random() * 600;
    spawnObstacle();
  }
}

function spawnObstacle() {
  const spawnPtero = score >= pteroUnlock && Math.random() < 0.3;
  if (spawnPtero) {
    spawnPterodactyl();
  } else {
    const count = score >= 400 && Math.random() < 0.4 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      spawnCactus(i * (PX * 5));
    }
  }
}

function chooseTier() {
  if (score < 200) return 'sm';
  if (score < 700) return Math.random() < 0.5 ? 'sm' : 'md';
  return Math.random() < 0.4 ? 'md' : 'lg';
}

function spawnCactus(xOffset) {
  const tier = chooseTier();
  const el   = document.createElement('div');
  el.className = `cactus cactus--${tier}`;

  const divX = GAME_W + 10 + xOffset;

  // 티어별 히트박스: { xOff: div기준 왼쪽 오프셋, w, h } (px)
  const dims = {
    sm: { xOff: -8, w: 20, h: 44 },
    md: { xOff: -12, w: 28, h: 60 },
    lg: { xOff: -12, w: 44, h: 72 },
  };
  const d = dims[tier];

  el.style.left   = divX + 'px';
  el.style.bottom = GROUND_BOTTOM + 'px';
  obstaclesEl.appendChild(el);

  obstacles.push({ type: 'cactus', x: divX + d.xOff, w: d.w, h: d.h, el, bottom: 0, divX });
}

function spawnPterodactyl() {
  const el = document.createElement('div');
  el.className = 'ptero';

  const divX = GAME_W + 10;

  // 비행 높이 3단계 (ground 위 px)
  // 0=낮게(점프 필수), 1=중간(웅크리기 필수), 2=높게(그냥 통과)
  const aboveGround = [4, 40, 70];
  let altIdx;
  if (score >= 500) {
    altIdx = Math.floor(Math.random() * 3);
  } else {
    altIdx = 1 + Math.floor(Math.random() * 2);
  }

  const ag = aboveGround[altIdx]; // ground 위 pixel 거리

  el.style.left   = divX + 'px';
  el.style.bottom = (GROUND_BOTTOM + ag) + 'px';
  obstaclesEl.appendChild(el);

  obstacles.push({ type: 'ptero', x: divX - 4, w: 40, h: 20, el, bottom: ag, divX });
}

// ===== 점수 =====
function updateScore(dt) {
  scoreTick += dt;
  while (scoreTick >= SCORE_INTERVAL) {
    score++;
    scoreTick -= SCORE_INTERVAL;
  }
  scoreEl.textContent = fmt(score);
}

// ===== 애니메이션 =====
function updateAnimations(dt) {
  // 달리기 다리 프레임
  legTimer += dt;
  const legInterval = Math.max(80, 180 - gameSpeed * 200);
  if (legTimer >= legInterval) {
    legTimer = 0;
    legFrame = !legFrame;
    if (legFrame) dinoEl.classList.add('run-b');
    else          dinoEl.classList.remove('run-b');
  }

  // 익룡 날개
  pteroTimer += dt;
  if (pteroTimer >= 250) {
    pteroTimer = 0;
    obstacles.filter(o => o.type === 'ptero').forEach(o => {
      o.el.classList.toggle('flap');
    });
  }
}

// ===== 충돌 감지 =====
function getDinoBox() {
  const h = dino.crouching ? DINO_H_CROUCH : DINO_H_NORM;
  const inset = 8;
  return {
    x:  DINO_X + inset,
    y:  dino.y,            // bottom에서 높이
    w:  DINO_W - inset * 2,
    h:  h - inset,
  };
}

function getObsBox(obs) {
  return { x: obs.x, y: obs.bottom, w: obs.w, h: obs.h };
}

function boxOverlap(a, b) {
  // y는 바닥에서의 거리 (bottom 기준)
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

function checkCollisions() {
  const db = getDinoBox();
  for (const obs of obstacles) {
    if (boxOverlap(db, getObsBox(obs))) {
      gameOver();
      return;
    }
  }
}

// ===== 낮/밤 전환 =====
function checkDayNight() {
  const cycle = Math.floor(score / DAY_CYCLE_PTS);
  if (cycle !== cycleCount) {
    cycleCount = cycle;
    document.body.classList.toggle('night');
  }
}

// ===== 유틸 =====
function fmt(n) {
  return String(n).padStart(5, '0');
}
