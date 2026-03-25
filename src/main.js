import * as THREE from "three";
import "./style.css";

const app = document.getElementById("app");
const playerHpEl = document.getElementById("playerHp");
const opponentHpEl = document.getElementById("opponentHp");
const statusEl = document.getElementById("status");
const debugEl = document.getElementById("debug");
const gameOverEl = document.getElementById("gameOver");
const gameOverTextEl = document.getElementById("gameOverText");
const restartBtn = document.getElementById("restartBtn");

let debugEnabled = true;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
app.appendChild(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = "none";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 25, 90);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);

// Pointer-lock look
let yaw = 0; // radians
let pitch = 0;
let pointerLocked = false;
const pitchLimit = Math.PI / 2.5;

// Keyboard input (player)
const keys = {
  up: false,
  down: false,
  left: false,
  right: false,
  space: false,
  spaceJustPressed: false,
};

function setKey(code, isDown) {
  switch (code) {
    case "ArrowUp":
      keys.up = isDown;
      break;
    case "ArrowDown":
      keys.down = isDown;
      break;
    case "ArrowLeft":
      keys.left = isDown;
      break;
    case "ArrowRight":
      keys.right = isDown;
      break;
    case "Space":
      if (isDown && !keys.space) keys.spaceJustPressed = true;
      keys.space = isDown;
      break;
  }
}

function normalizeKeyEvent(e) {
  if (e.code) return e.code;
  if (e.key === " ") return "Space";
  return e.key;
}

function isGameKey(code) {
  return code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight" || code === "Space";
}

function syncDebugVisibility() {
  if (!debugEl) return;
  debugEl.style.display = debugEnabled ? "block" : "none";
}

document.addEventListener(
  "keydown",
  (e) => {
    const code = normalizeKeyEvent(e);
    if (code === "KeyH") {
      debugEnabled = !debugEnabled;
      syncDebugVisibility();
      return;
    }
    if (!isGameKey(code)) return;
    e.preventDefault();
    setKey(code, true);
  },
  { capture: true },
);

document.addEventListener(
  "keyup",
  (e) => {
    const code = normalizeKeyEvent(e);
    if (!isGameKey(code)) return;
    e.preventDefault();
    setKey(code, false);
  },
  { capture: true },
);

window.addEventListener("blur", () => {
  keys.up = false;
  keys.down = false;
  keys.left = false;
  keys.right = false;
  keys.space = false;
  keys.spaceJustPressed = false;
});

syncDebugVisibility();

renderer.domElement.addEventListener("click", () => {
  renderer.domElement.focus();
  if (!gameState.gameOver) renderer.domElement.requestPointerLock();
});

document.addEventListener("pointerlockchange", () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  statusEl.style.display = pointerLocked ? "none" : "block";
  if (pointerLocked && !gameState.combatEnabled) {
    gameState.combatEnabled = true;
    gameState.combatEnabledAt = elapsedSeconds;
  }
});

document.addEventListener("mousemove", (e) => {
  if (!pointerLocked || gameState.gameOver) return;
  const movementX = e.movementX ?? 0;
  const movementY = e.movementY ?? 0;

  const sensitivity = 0.0022;
  yaw -= movementX * sensitivity;
  pitch -= movementY * sensitivity;
  pitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch));
});

// Arena + colliders (AABB boxes)
const colliders = [];
const colliderBoxes = []; // keep array of Box3 for ray tests
const tempVec = new THREE.Vector3();
const tempClosest = new THREE.Vector3();
const tempCenter = new THREE.Vector3();

function addColliderBox(center, size) {
  const half = tempVec.set(size.x / 2, size.y / 2, size.z / 2);
  const min = center.clone().sub(half);
  const max = center.clone().add(half);
  const box = new THREE.Box3(min, max);
  colliders.push({ box });
  colliderBoxes.push(box);
}

function closestPointOnBox(center, box, out) {
  out.set(
    THREE.MathUtils.clamp(center.x, box.min.x, box.max.x),
    THREE.MathUtils.clamp(center.y, box.min.y, box.max.y),
    THREE.MathUtils.clamp(center.z, box.min.z, box.max.z),
  );
  return out;
}

function sphereIntersectsBox(center, radius, box) {
  const closest = closestPointOnBox(center, box, tempClosest);
  return closest.distanceToSquared(center) < radius * radius;
}

function collidesSphere(center, radius) {
  for (const c of colliders) {
    if (sphereIntersectsBox(center, radius, c.box)) return true;
  }
  return false;
}

function tryMoveSphere(entity, dx, dz) {
  // Move on X then Z to get simple sliding.
  const proposedX = entity.pos.x + dx;
  const centerX = tempCenter.set(proposedX, entity.pos.y, entity.pos.z);
  if (!collidesSphere(centerX, entity.radius)) entity.pos.x = proposedX;

  const proposedZ = entity.pos.z + dz;
  const centerZ = tempCenter.set(entity.pos.x, entity.pos.y, proposedZ);
  if (!collidesSphere(centerZ, entity.radius)) entity.pos.z = proposedZ;
}

function forwardVectorFromYaw(y) {
  // Match Three.js camera forward (-Z) convention on XZ plane
  return tempVec.set(-Math.sin(y), 0, -Math.cos(y)).clone();
}
function rightVectorFromYaw(y) {
  // right = up x forward
  return tempVec.set(-Math.cos(y), 0, Math.sin(y)).clone();
}

function getAimRayOrigin(entity) {
  return tempVec.set(entity.pos.x, entity.eyeY, entity.pos.z).clone();
}

function raySphereDistance(rayOrigin, rayDir, sphereCenter, sphereRadius) {
  // Returns distance along ray to the first intersection point, or Infinity if no hit.
  const toCenter = tempVec.subVectors(sphereCenter, rayOrigin);
  const tca = toCenter.dot(rayDir);
  if (tca < 0) return Infinity;
  const d2 = toCenter.lengthSq() - tca * tca;
  const r2 = sphereRadius * sphereRadius;
  if (d2 > r2) return Infinity;
  const thc = Math.sqrt(Math.max(0, r2 - d2));
  const t0 = tca - thc;
  return t0 >= 0 ? t0 : tca + thc;
}

function rayClosestWallDistance(rayOrigin, rayDir, maxDist) {
  const ray = new THREE.Ray(rayOrigin, rayDir);
  let closest = Infinity;
  const hitPoint = new THREE.Vector3();
  for (const box of colliderBoxes) {
    const hit = ray.intersectBox(box, hitPoint);
    if (!hit) continue;
    const d = hitPoint.distanceTo(rayOrigin);
    if (d <= maxDist && d < closest) closest = d;
  }
  return closest;
}

function isLineOfSight(from, to, maxDist) {
  const dir = tempVec.subVectors(to, from);
  const dist = dir.length();
  if (dist > maxDist) return false;
  dir.normalize();
  const wallDist = rayClosestWallDistance(from, dir, dist - 0.05);
  return wallDist === Infinity;
}

let lastNowMs = performance.now();
let elapsedSeconds = 0;

// Lighting
scene.add(new THREE.HemisphereLight(0x88aaff, 0x223322, 0.9));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// Ground
const arenaHalf = 18;
const arenaSize = arenaHalf * 2;

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(arenaSize, arenaSize),
  new THREE.MeshStandardMaterial({ color: 0x0b0b0f, roughness: 1.0, metalness: 0.0 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

const grid = new THREE.GridHelper(arenaSize, arenaSize / 2, 0x1f2b3a, 0x0b0b0f);
grid.position.y = 0.01;
scene.add(grid);

function addWall(center, size) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial({ color: 0x2b2b35, roughness: 0.9, metalness: 0.0 }),
  );
  mesh.position.copy(center);
  scene.add(mesh);
  addColliderBox(center, size);
}

const wallThickness = 0.8;
const wallHeight = 4.5;

// Boundary walls
addWall(new THREE.Vector3(-arenaHalf - wallThickness / 2, wallHeight / 2, 0), new THREE.Vector3(wallThickness, wallHeight, arenaSize));
addWall(new THREE.Vector3(arenaHalf + wallThickness / 2, wallHeight / 2, 0), new THREE.Vector3(wallThickness, wallHeight, arenaSize));
addWall(new THREE.Vector3(0, wallHeight / 2, -arenaHalf - wallThickness / 2), new THREE.Vector3(arenaSize, wallHeight, wallThickness));
addWall(new THREE.Vector3(0, wallHeight / 2, arenaHalf + wallThickness / 2), new THREE.Vector3(arenaSize, wallHeight, wallThickness));

// Some interior crates
const crates = [
  { c: [-6, wallHeight * 0.5, -7], s: [3, 2.2, 3] },
  { c: [5, wallHeight * 0.5, -3], s: [3, 2.2, 2.5] },
  { c: [-2, wallHeight * 0.5, 6], s: [2.5, 2.0, 3.5] },
  { c: [8, wallHeight * 0.5, 8], s: [2.2, 2.0, 2.2] },
];
for (const crate of crates) {
  const center = new THREE.Vector3(crate.c[0], crate.c[1], crate.c[2]);
  const size = new THREE.Vector3(crate.s[0], crate.s[1], crate.s[2]);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial({ color: 0x34344a, roughness: 0.9, metalness: 0.0 }),
  );
  mesh.position.copy(center);
  scene.add(mesh);
  addColliderBox(center, size);
}

// Entities
const eyeHeight = 1.6;

const player = {
  pos: new THREE.Vector3(-12, eyeHeight, 0),
  eyeY: eyeHeight,
  radius: 0.38,
  hp: 100,
  shootCooldown: 0,
  turnCooldown: 0,
};

const opponent = {
  pos: new THREE.Vector3(12, eyeHeight, 0),
  eyeY: eyeHeight,
  radius: 0.38,
  hp: 100,
  shootCooldown: 0,
  yaw: 0,
  aiStrafeDir: Math.random() < 0.5 ? -1 : 1,
  nextAiDecisionTime: 0,
};

// Visible meshes for entities
const opponentMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.45, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xff4455, roughness: 0.6, metalness: 0.0, emissive: 0x220006, emissiveIntensity: 0.6 }),
);
opponentMesh.position.set(opponent.pos.x, 0.45, opponent.pos.z);
scene.add(opponentMesh);

const opponentArrow = new THREE.Mesh(
  new THREE.ConeGeometry(0.18, 0.5, 10),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.0 }),
);
opponentArrow.position.set(0, 0.8, 0);
opponentArrow.rotation.x = Math.PI;
opponentMesh.add(opponentArrow);

const gun = new THREE.Mesh(
  new THREE.BoxGeometry(0.22, 0.14, 0.5),
  new THREE.MeshStandardMaterial({ color: 0x7aa2ff, roughness: 0.35, metalness: 0.1, emissive: 0x081022, emissiveIntensity: 0.4 }),
);
gun.position.set(0.22, -0.22, -0.55);
camera.add(gun);
scene.add(camera);

function resetGame() {
  gameState.gameOver = false;
  gameState.combatEnabled = false;
  gameState.combatEnabledAt = elapsedSeconds;
  player.hp = 100;
  opponent.hp = 100;
  player.shootCooldown = 0;
  opponent.shootCooldown = 0;
  player.pos.set(-12, eyeHeight, 0);
  opponent.pos.set(12, eyeHeight, 0);
  const toOpponent = new THREE.Vector3(opponent.pos.x - player.pos.x, 0, opponent.pos.z - player.pos.z);
  yaw = Math.atan2(-toOpponent.x, -toOpponent.z);
  pitch = 0;
  const toPlayer = new THREE.Vector3(player.pos.x - opponent.pos.x, 0, player.pos.z - opponent.pos.z);
  opponent.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
  opponent.aiStrafeDir = Math.random() < 0.5 ? -1 : 1;
  opponent.nextAiDecisionTime = 0;
  updateHud();
  gameOverEl.style.display = "none";
  statusEl.style.display = pointerLocked ? "none" : "block";
}

const gameState = {
  gameOver: false,
  combatEnabled: false,
  combatEnabledAt: 0,
};

function updateHud() {
  playerHpEl.textContent = String(Math.max(0, Math.round(player.hp)));
  opponentHpEl.textContent = String(Math.max(0, Math.round(opponent.hp)));
}

restartBtn.addEventListener("click", () => resetGame());

// Shooting + VFX
const impactMeshes = [];
function addImpact(position, color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.0, emissive: color, emissiveIntensity: 0.5 }),
  );
  mesh.position.copy(position);
  scene.add(mesh);
  impactMeshes.push({ mesh, expiresAt: elapsedSeconds + 0.18 });
}

function addTracer(from, to, color) {
  const points = [from, to];
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geom, mat);
  scene.add(line);
  impactMeshes.push({ mesh: line, expiresAt: elapsedSeconds + 0.08 });
}

const shootingRange = 55;
const damage = 25;
const fireCooldownSeconds = 0.35;

function shootFromCamera(origin, dir, target) {
  const wallDist = rayClosestWallDistance(origin, dir, shootingRange);
  const targetCenter = new THREE.Vector3(target.pos.x, target.eyeY, target.pos.z);
  const targetDist = raySphereDistance(origin, dir, targetCenter, target.radius);

  if (targetDist !== Infinity && targetDist <= shootingRange && targetDist < wallDist) {
    // Hit
    const hitPoint = new THREE.Vector3().copy(origin).add(new THREE.Vector3().copy(dir).multiplyScalar(targetDist));
    addImpact(hitPoint, 0xffdd66);
    addTracer(origin, hitPoint, 0xffa000);
    target.hp -= damage;
    return true;
  }
  return false;
}

function checkGameOver() {
  if (gameState.gameOver) return;
  if (player.hp <= 0) {
    gameState.gameOver = true;
    gameOverTextEl.textContent = "You lost. Opponent wins.";
    gameOverEl.style.display = "block";
    statusEl.style.display = "none";
  } else if (opponent.hp <= 0) {
    gameState.gameOver = true;
    gameOverTextEl.textContent = "You win! Opponent down.";
    gameOverEl.style.display = "block";
    statusEl.style.display = "none";
  }
}

// Movement
const moveSpeed = 6.0;
const aiMoveSpeed = 5.6;

function applyMovement(entity, input, entityYaw, dt, speed) {
  // input values: up/down/left/right booleans
  const forward = forwardVectorFromYaw(entityYaw);
  const right = rightVectorFromYaw(entityYaw);
  const moveForward = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const moveRight = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  const move = new THREE.Vector3();
  move.addScaledVector(forward, moveForward);
  move.addScaledVector(right, moveRight);

  if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);
  tryMoveSphere(entity, move.x, move.z);
}

// Main loop
function animate() {
  requestAnimationFrame(animate);
  const nowMs = performance.now();
  const dt = Math.min((nowMs - lastNowMs) / 1000, 0.033);
  lastNowMs = nowMs;
  elapsedSeconds += dt;

  // expire VFX
  const now = elapsedSeconds;
  for (let i = impactMeshes.length - 1; i >= 0; i--) {
    if (now > impactMeshes[i].expiresAt) {
      scene.remove(impactMeshes[i].mesh);
      impactMeshes.splice(i, 1);
    }
  }

  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  opponent.shootCooldown = Math.max(0, opponent.shootCooldown - dt);

  if (!gameState.gameOver) {
    // Player movement
    const playerInput = {
      up: keys.up,
      down: keys.down,
      left: keys.left,
      right: keys.right,
    };
    applyMovement(player, playerInput, yaw, dt, moveSpeed);

    // Camera follows player eye
    camera.position.set(player.pos.x, player.eyeY, player.pos.z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = 0;

    // Player shooting
    if (keys.spaceJustPressed && pointerLocked && player.shootCooldown <= 0) {
      keys.spaceJustPressed = false;
      const origin = new THREE.Vector3(player.pos.x, player.eyeY, player.pos.z);
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir).normalize();
      const hit = shootFromCamera(origin, dir, opponent);
      if (hit) player.shootCooldown = fireCooldownSeconds;
      else player.shootCooldown = fireCooldownSeconds; // keep consistent cadence
    } else {
      keys.spaceJustPressed = false; // if not fired, clear the edge trigger anyway
    }

    // Opponent AI + shooting only after you pointer-lock (plus a short grace period)
    if (gameState.combatEnabled && now - gameState.combatEnabledAt > 1.25) {
      const playerEye = new THREE.Vector3(player.pos.x, player.eyeY, player.pos.z);
      const oppEye = new THREE.Vector3(opponent.pos.x, opponent.eyeY, opponent.pos.z);
      const toPlayer = new THREE.Vector3().subVectors(playerEye, oppEye);
      const dist = Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.z * toPlayer.z);

      // Aim opponent yaw toward the player on the XZ plane
      opponent.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);

      const canShoot = dist <= shootingRange && isLineOfSight(oppEye, playerEye, shootingRange);

      // Decide strafe + advance behavior
      const decisionInterval = 0.08;
      if (opponent.nextAiDecisionTime <= now) {
        opponent.nextAiDecisionTime = now + decisionInterval;
        if (Math.random() < 0.25) opponent.aiStrafeDir *= -1;
      }

      const aiInput = {
        up: false,
        down: false,
        left: false,
        right: false,
        shoot: false,
      };

      const far = dist > 10.5;
      const tooClose = dist < 4.5;

      aiInput.up = far;
      aiInput.down = tooClose;

      if (!far && !tooClose) {
        if (opponent.aiStrafeDir > 0) aiInput.right = true;
        else aiInput.left = true;
        aiInput.up = true;
      } else if (tooClose) {
        if (opponent.aiStrafeDir > 0) aiInput.left = true;
        else aiInput.right = true;
      }

      applyMovement(opponent, aiInput, opponent.yaw, dt, aiMoveSpeed);

      // Opponent shooting
      if (canShoot && opponent.shootCooldown <= 0) {
        const dir = toPlayer.clone().normalize();
        const hit = shootFromCamera(oppEye, dir, player);
        opponent.shootCooldown = fireCooldownSeconds;
      }
    }

    // Keep opponent mesh in sync (even if combat isn't enabled yet)
    opponentMesh.position.set(opponent.pos.x, 0.45, opponent.pos.z);
    opponentMesh.rotation.y = opponent.yaw;

    updateHud();
    checkGameOver();
  }

  if (debugEnabled && debugEl) {
    debugEl.textContent =
      `pos=(${player.pos.x.toFixed(2)}, ${player.pos.z.toFixed(2)}) ` +
      `keys=[${keys.up ? "U" : "-"}${keys.down ? "D" : "-"}${keys.left ? "L" : "-"}${keys.right ? "R" : "-"}] ` +
      `locked=${pointerLocked ? "yes" : "no"}`;
  }

  renderer.render(scene, camera);
}

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

updateHud();
resetGame();
animate();

