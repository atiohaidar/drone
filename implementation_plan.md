# Migration: Three.js → Babylon.js + Node.js Serial Bridge

Full migration of the DJI drone flight simulator 3D challenge game from vanilla monolithic HTML + Python serial bridge to a modern Vite + Babylon.js + Node.js TypeScript application. Dashboard is kept as-is (not migrated).

## Scope (Confirmed)

- ✅ **3D Challenge Game** (`challenge.html`) → Babylon.js modular TypeScript
- ✅ **Python Serial Bridge** (`bridge.py`) → Node.js TypeScript
- ✅ **Leverage Babylon.js improvements** (built-in physics, PBR materials, collision detection where beneficial)
- ❌ **Dashboard** (`index.html`, `app.js`, `fpv.js`, `styles.css`) — kept as-is, not migrated
- ❌ **`usatenko_main.py`** — Linux-only reference, preserved in git history

---

## Phase 0: Project Scaffolding

#### [NEW] `package.json`
- Dependencies: `@babylonjs/core`, `@babylonjs/materials`, `@babylonjs/gui`, `serialport`, `ws`
- Dev deps: `vite`, `typescript`, `@types/ws`, `tsx`, `concurrently`
- Scripts: `dev` (Vite + Node bridge via concurrently), `build`, `bridge`

#### [NEW] `tsconfig.json`
- Strict TypeScript, ES2020 target
- Path aliases: `@/` → `src/`, `@server/` → `server/`, `@shared/` → `shared/`

#### [NEW] `vite.config.ts`
- WebSocket proxy: `/ws` → `localhost:8765`
- Single-page setup (challenge game only)

#### [NEW] `.gitignore`
- `node_modules/`, `dist/`

---

## Phase 1: Node.js Serial Bridge (replace `bridge.py`)

#### [NEW] `shared/types.ts`
- `ControllerState` interface (throttle, yaw, pitch, roll, camera, buttons, battery, etc.)

#### [NEW] `server/dji-protocol.ts`
- CRC lookup tables (identical values from Python)
- `calcChecksum()`, `calcHeaderChecksum()` — Buffer-based
- `buildDumlPacket()` — construct DUML binary commands
- `parseInput()` — normalize raw stick to -1.0…1.0

#### [NEW] `server/serial-bridge.ts`
- `findDjiPort()` — scan COM ports for vendor ID `2CA3`
- `DjiBridge` class with auto-reconnect, DUML polling, state events

#### [NEW] `server/index.ts`
- WebSocket server on port 8765
- Broadcast `ControllerState` JSON to all clients
- Heartbeat: mark disconnected after 1.5s silence

---

## Phase 2: Babylon.js 3D Challenge Game (Core Rewrite)

> [!IMPORTANT]
> This is NOT a 1:1 port — we'll leverage Babylon.js built-in features:
> - **PBR materials** instead of basic StandardMaterial hacks for metallic surfaces
> - **Built-in mesh intersection** (`mesh.intersectsMesh()`) where it simplifies code
> - **ShadowGenerator** for proper shadow mapping
> - **FollowCamera / ArcRotateCamera** for camera modes instead of manual lerp

#### [NEW] `src/main.ts`
- Create `Engine`, `Scene`, import/init all modules, start render loop

#### [NEW] `src/core/InputManager.ts`
- WebSocket client → `ControllerState`
- Keyboard fallback (WASD + arrows)
- Priority: DJI controller overrides keyboard when active

#### [NEW] `src/core/AudioManager.ts`
- Web Audio API: drone hum (sawtooth 80Hz), gate chime, crash noise, victory/defeat fanfares

#### [NEW] `src/core/GameStateManager.ts`
- States: `MENU`, `PLAYING`, `GAME_OVER`, `VICTORY`
- Track: shield health, active checkpoint, timer, final time

#### [NEW] `src/world/SceneBuilder.ts`
- Scene, camera, lighting setup
- Babylon.js equivalents: `HemisphericLight`, `DirectionalLight`, `ShadowGenerator`, fog

#### [NEW] `src/world/OutdoorEnvironment.ts`
- Sky dome (shader gradient), ground plane, grid overlay
- 15 procedural trees (trunk cylinders + foliage cones, same seeding)
- Mountain peak (low-poly cone)
- 8 horizontal laser beams (emissive cylinders)

#### [NEW] `src/world/IndoorEnvironment.ts`
- Inverted box room (100×20×100), dark materials
- Neon wall stripes (cyan + pink)
- 4 ceiling spotlights, 16 pillars with hazard wraps
- 22 industrial crates with AABB collision data
- 10 horizontal + 10 vertical laser beams (lime green)

#### [NEW] `src/drone/DroneModel.ts`
- Body, arms, motors, propellers, nav LEDs, camera gimbal
- All under `TransformNode` parent
- PBR materials for metallic surfaces

#### [NEW] `src/drone/DronePhysics.ts`
- Flight physics: gravity, drag, yaw/pitch/roll, wind system
- Same constants: `GRAVITY=9.8`, `DRAG=1.8`, `MASS=0.25`
- Ground clamp with speed-based damage

#### [NEW] `src/drone/CollisionSystem.ts`
- Cylinder collisions (trees, pillars) — manual 2D distance check
- Beam collisions — point-to-segment distance
- AABB collisions (crates) — shallowest-axis push-out
- Boundary collisions (walls, ceiling, map limit)
- Spark particle pool (30 spheres with velocity/gravity/lifetime)
- **Enhancement**: Use `mesh.intersectsMesh()` for checkpoint triggers instead of manual distance checks

#### [NEW] `src/drone/CameraController.ts`
- TPV: `FollowCamera` or manual lerp behind drone
- FPV: `FreeCamera` parented to drone
- Orbit: `ArcRotateCamera` targeting checkpoint
- Indoor camera clamping, gate fade-out

#### [NEW] `src/world/Checkpoints.ts`
- Torus gates with emissive materials + support poles
- Active/cleared/future highlighting (cyan/green/red)
- Trigger detection

#### [NEW] `src/ui/HUD.ts`
- DOM overlay: connection status, gate tracker, timer, speed/altitude/wind, shield bar, input bars, controls legend
- Collision flash overlay

#### [NEW] `src/ui/Screens.ts`
- Start screen (environment selector, control detection)
- Game Over screen (gates cleared, time)
- Victory screen (time, shield integrity)

#### [NEW] `src/styles/challenge.css`
- All CSS extracted from `challenge.html` `<style>` block

#### [NEW] `index.html`
- Minimal Vite entry: canvas + HUD layer + modal screens + script module

---

## Phase 3: Cleanup

#### [DELETE] `bridge.py` (replaced by `server/`)
#### [DELETE] `challenge.html` (replaced by Vite modules)
#### Preserved as-is: `index.html` (dashboard), `app.js`, `fpv.js`, `styles.css`, `usatenko_main.py`

> [!WARNING]
> The current `index.html` will be renamed to `dashboard.html` before creating the new Vite `index.html` entry point. This avoids overwriting the dashboard.

---

## Final Project Structure

```
drone/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
├── index.html                    # Vite entry (challenge game)
│
├── dashboard.html                # Original dashboard (renamed from index.html)
├── app.js                        # Dashboard logic (kept as-is)
├── fpv.js                        # FPV renderer (kept as-is)
├── styles.css                    # Dashboard styles (kept as-is)
├── usatenko_main.py              # Linux reference (kept as-is)
│
├── shared/
│   └── types.ts                  # ControllerState interface
│
├── server/
│   ├── index.ts                  # WebSocket server entry
│   ├── serial-bridge.ts          # DJI serial reader
│   └── dji-protocol.ts           # DUML binary protocol
│
└── src/
    ├── main.ts                   # Game entry point
    ├── core/
    │   ├── InputManager.ts
    │   ├── AudioManager.ts
    │   └── GameStateManager.ts
    ├── drone/
    │   ├── DroneModel.ts
    │   ├── DronePhysics.ts
    │   ├── CollisionSystem.ts
    │   └── CameraController.ts
    ├── world/
    │   ├── SceneBuilder.ts
    │   ├── OutdoorEnvironment.ts
    │   ├── IndoorEnvironment.ts
    │   └── Checkpoints.ts
    ├── ui/
    │   ├── HUD.ts
    │   └── Screens.ts
    └── styles/
        └── challenge.css
```

---

## Verification Plan

### Automated
```bash
npm run build    # TypeScript compiles without errors
```

### Manual
1. **Bridge**: Plug in DJI controller, verify WebSocket data flows
2. **Outdoor scene**: Trees, sky, ground, checkpoints render correctly
3. **Indoor scene**: Pillars, crates, lasers, neon lights
4. **Flight physics**: Same throttle response, drag, gravity, wind
5. **Collisions**: Trees, beams, crates, walls — damage + push-out + sparks
6. **Checkpoints**: Fly through all gates → victory
7. **Camera modes**: TPV → FPV → Orbit
8. **Audio**: Drone hum, gate chime, crash, fanfares
9. **Keyboard**: WASD + arrows when controller disconnected
10. **HUD**: All telemetry indicators update correctly

---

## Execution Order

1. Phase 0 → scaffold project, install deps
2. Phase 1 → build & test Node.js bridge independently
3. Phase 2 → build in order: SceneBuilder → Environments → DroneModel → DronePhysics → CollisionSystem → CameraController → Checkpoints → InputManager → AudioManager → GameStateManager → HUD → Screens → main.ts
4. Phase 3 → rename old index.html, delete bridge.py and challenge.html
