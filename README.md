# 3D Arena FPS (1v1 vs AI)

Simple 3D first-person shooter built with Three.js.
Almost every video game — 2D or 3D, browser or desktop — follows the same fundamental architecture. Understanding this pattern is the single most important concept for a new game developer.

### 2.1 The Game Loop

```
┌──────────────────────────────────────────────┐
│                  GAME LOOP                   │
│                                              │
│   ┌──────────┐                               │
│   │  INPUT   │ ← keyboard, mouse, gamepad    │
│   └────┬─────┘                               │
│        ▼                                     │
│   ┌──────────┐                               │
│   │  UPDATE  │ ← physics, AI, cooldowns      │
│   └────┬─────┘                               │
│        ▼                                     │
│   ┌──────────┐                               │
│   │  RENDER  │ ← draw the scene to screen    │
│   └────┬─────┘                               │
│        │                                     │
│        └──────── loop (every ~16ms @ 60fps)  │
└──────────────────────────────────────────────┘
```

**Input** → Capture what the player is doing (key presses, mouse movement).
**Update** → Move entities, run AI decisions, apply damage, check collisions.
**Render** → Draw the current state of the world to the screen.

```
How Neo-Shoot-Out Uses These Concepts

Here's how the reference project maps to the concepts above:

| Concept | Where in the code |
|---|---|
| **Game Loop** | `animate()` function using `requestAnimationFrame` |
| **Delta Time** | `const dt = (nowMs - lastNowMs) / 1000` capped at 33ms |
| **Input System** | `setKey()` function tracks arrow keys + space; `mousemove` for look |
| **Scene Setup** | `new THREE.Scene()` with background color and fog |
| **Camera** | `PerspectiveCamera(75, aspect, 0.1, 200)` — 75° FOV |
| **Lighting** | `HemisphereLight` (ambient) + `DirectionalLight` (sun) |
| **Arena Floor** | `PlaneGeometry` rotated -90° on X axis + `GridHelper` |
| **Walls & Crates** | `BoxGeometry` meshes with matching `Box3` colliders |
| **Collision** | Sphere-vs-AABB using `closestPointOnBox` + distance check |
| **Movement** | `tryMoveSphere()` — tries X then Z independently (slide along walls) |
| **Shooting** | Ray-sphere intersection for hit detection, ray-box for wall blocking |
| **Tracers & Impacts** | Temporary `Line` and `Sphere` meshes that expire after ~100ms |
| **AI Opponent** | Aims at player, strafes, advances/retreats based on distance |
| **HUD** | HTML overlay updating `textContent` for HP values |
| **Game Over** | Checks HP ≤ 0, shows win/lose message with restart button |
| **Pointer Lock** | `requestPointerLock()` on click, `mousemove` for yaw/pitch |

---


## Controls

- Click: lock pointer (enables mouse look)
- Arrow Keys: move (forward/back + strafe)
- Space: shoot
- H: toggle debug HUD

The opponent is AI-controlled (it still uses the same internal “arrow keys + space” style inputs).

## Run locally

1. Install deps (once):
   - `npm install`
2. Start dev server:
   - `npm run dev`
3. Open the URL Vite prints in your terminal (usually `http://localhost:5173/`)

## Build

- `npm run build`
- `npm run preview`

