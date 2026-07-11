// ==========================================
// DJI FPV CAMERA & 3D WORLD SIMULATOR MODULE
// ==========================================

// Canvas Rendering roundRect Polyfill for Older Browser Compatibility
if (typeof CanvasRenderingContext2D.prototype.roundRect !== 'function') {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        if (typeof r === 'undefined') {
            r = 0;
        }
        if (typeof r === 'number') {
            r = {tl: r, tr: r, br: r, bl: r};
        } else {
            const defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
            for (let side in defaultRadius) {
                r[side] = r[side] || defaultRadius[side];
            }
        }
        this.beginPath();
        this.moveTo(x + r.tl, y);
        this.lineTo(x + w - r.tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r.tr);
        this.lineTo(x + w, y + h - r.br);
        this.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
        this.lineTo(x + r.bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r.bl);
        this.lineTo(x, y + r.tl);
        this.quadraticCurveTo(x, y, x + r.tl, y);
        this.closePath();
        return this;
    };
}

let fpvCanvas = null;
let fpvCtx = null;
let fpvAnimationId = null;

let radarCanvas = null;
let radarCtx = null;

// Collision state tracker
let isCrashed = false;
let crashTime = 0;

// OSD blinking state
let osdBlinkToggle = true;

// Gates clearance state
let gatesClearedCount = 0;

// Fictional 3D world elements
const WORLD_SIZE = 500; // 500 meters operational area
const worldBuildings = [];
const worldGates = [];
const worldTrees = [];

// Distant mountain silhouette peaks (angle: [0-360], height, width)
const mountainPeaks = [
    { angle: 30,  height: 80, width: 180 },
    { angle: 95,  height: 110, width: 240 },
    { angle: 170, height: 70, width: 150 },
    { angle: 220, height: 100, width: 210 },
    { angle: 290, height: 75, width: 170 },
    { angle: 340, height: 95, width: 190 }
];

/**
 * Initializes the FPV 3D simulator canvas, generated terrain assets, and flight radar.
 */
function initFPV() {
    fpvCanvas = document.getElementById('fpv-canvas');
    radarCanvas = document.getElementById('radar-canvas');
    if (!fpvCanvas) return;
    
    fpvCtx = fpvCanvas.getContext('2d');
    if (radarCanvas) {
        radarCtx = radarCanvas.getContext('2d');
    }

    // Set canvas resolutions
    resizeFPVCanvas();
    window.addEventListener('resize', resizeFPVCanvas);
    
    // Generate the fictional city, gates, and forest elements
    generateWorldAssets();
    
    // OSD Blink timer
    setInterval(() => {
        osdBlinkToggle = !osdBlinkToggle;
    }, 500);

    // Start drawing loop
    startFPVLoop();
}

/**
 * Generates the fictional skyscrapers, trees, and flying hoops to clear.
 */
function generateWorldAssets() {
    worldBuildings.length = 0;
    worldGates.length = 0;
    worldTrees.length = 0;
    gatesClearedCount = 0;
    
    // Generate Neon Skyscrapers (Buildings)
    const buildingGridSpacing = 130;
    const colors = [
        "rgba(147, 51, 234, 0.4)",  // Neon Purple
        "rgba(168, 85, 247, 0.4)",  // Light Purple
        "rgba(59, 130, 246, 0.4)",   // Neon Blue
        "rgba(236, 72, 153, 0.4)"    // Neon Pink
    ];
    
    for (let x = -WORLD_SIZE; x <= WORLD_SIZE; x += buildingGridSpacing) {
        for (let y = -WORLD_SIZE; y <= WORLD_SIZE; y += buildingGridSpacing) {
            // Avoid spawning building directly on Home Point
            if (Math.abs(x) < 40 && Math.abs(y) < 40) continue;
            
            // Jitter the positions slightly for organic layout
            const bx = x + (Math.random() - 0.5) * 50;
            const by = y + (Math.random() - 0.5) * 50;
            const bw = 25 + Math.random() * 25;
            const bd = 25 + Math.random() * 25;
            const bh = 50 + Math.random() * 110; // Tall buildings
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            worldBuildings.push({ x: bx, y: by, w: bw, d: bd, h: bh, color });
        }
    }
    
    // Generate Flying Neon Gates to Fly Through
    const gateCoords = [
        {x: 0, y: 60, z: 12},
        {x: 65, y: 120, z: 18},
        {x: 120, y: 65, z: 22},
        {x: 180, y: -45, z: 28},
        {x: 90, y: -130, z: 20},
        {x: -60, y: -90, z: 15},
        {x: -130, y: 10, z: 25},
        {x: -90, y: 110, z: 20}
    ];
    
    gateCoords.forEach((gc, idx) => {
        worldGates.push({
            id: idx + 1,
            x: gc.x,
            y: gc.y,
            z: gc.z,
            radius: 12,
            cleared: false
        });
    });
    
    // Generate Obstacle Forest (Trees)
    // Trees will be placed in small clusters
    for (let i = 0; i < 45; i++) {
        const tx = (Math.random() - 0.5) * (WORLD_SIZE * 1.8);
        const ty = (Math.random() - 0.5) * (WORLD_SIZE * 1.8);
        
        // Avoid spawning directly on Home or on top of buildings
        if (Math.abs(tx) < 25 && Math.abs(ty) < 25) continue;
        
        let onBuilding = false;
        for (let b of worldBuildings) {
            if (Math.abs(tx - b.x) < (b.w/2 + 8) && Math.abs(ty - b.y) < (b.d/2 + 8)) {
                onBuilding = true;
                break;
            }
        }
        if (onBuilding) continue;
        
        const trunkH = 4 + Math.random() * 4;
        const foliageH = 8 + Math.random() * 8;
        const radius = 5.0; // Collision threshold
        
        worldTrees.push({ x: tx, y: ty, trunkH, foliageH, radius });
    }
}

/**
 * Resizes both canvas elements.
 */
function resizeFPVCanvas() {
    if (fpvCanvas) {
        const rect = fpvCanvas.getBoundingClientRect();
        fpvCanvas.width = rect.width;
        fpvCanvas.height = rect.height;
    }
    if (radarCanvas) {
        const rect = radarCanvas.getBoundingClientRect();
        radarCanvas.width = rect.width;
        radarCanvas.height = rect.height;
    }
}

/**
 * Start the animation frame loops.
 */
function startFPVLoop() {
    function loop(now) {
        fpvAnimationId = requestAnimationFrame(loop);
        drawFPVFeed();
        drawRadarFeed();
    }
    fpvAnimationId = requestAnimationFrame(loop);
}

/**
 * Perspective projection helper. Maps 3D space to 2D screen context.
 */
function project3DPoint(wx, wy, wz, w, h, droneX, droneY, droneAlt, heading, cameraPitchDeg) {
    // Translate relative to camera (drone position)
    let dx = wx - droneX;
    let dy = wy - droneAlt;
    let dz = wz - droneY;
    
    // Rotate relative to drone heading (Y-axis)
    const headingRad = (-heading * Math.PI) / 180.0;
    const rx = dx * Math.cos(headingRad) - dz * Math.sin(headingRad);
    const rz = dx * Math.sin(headingRad) + dz * Math.cos(headingRad);
    const ry = dy;
    
    // Rotate relative to camera pitch (gimbal tilt + body pitch)
    const pitchRad = (cameraPitchDeg * Math.PI) / 180.0;
    const finalY = ry * Math.cos(pitchRad) - rz * Math.sin(pitchRad);
    const finalZ = ry * Math.sin(pitchRad) + rz * Math.cos(pitchRad);
    const finalX = rx;
    
    // Clip points behind camera
    if (finalZ <= 0.2) return null;
    
    // Perspective math scale
    const fov = 350; // Field of view stretch
    const cx = w / 2;
    const cy = h / 2;
    
    return {
        x: cx + (finalX / finalZ) * fov,
        y: cy - (finalY / finalZ) * fov,
        z: finalZ
    };
}

/**
 * Renders the full 3D environment: ground, sky, mountains, buildings, gates, and trees.
 */
function drawFPVFeed() {
    if (!fpvCanvas || !fpvCtx) return;
    
    const w = fpvCanvas.width;
    const h = fpvCanvas.height;
    const ctx = fpvCtx;
    
    // Clear screen
    ctx.fillStyle = "#030712"; // Deep space black
    ctx.fillRect(0, 0, w, h);
    
    // Get live states from global scope (app.js inputs via droneState)
    const state = window.droneState || {};
    const isConnected = state.isConnected || false;
    const alt = state.alt || 0;
    const speed = state.speed || 0;
    const dist = state.dist || 0;
    const heading = state.heading || 0;
    const isRecording = state.isRecording || false;
    const rthActive = state.rthActive || false;
    const droneX = state.x || 0;
    const droneY = state.y || 0;
    
    const pitchIn = window.inputs?.pitch || 0;
    const rollIn = window.inputs?.roll || 0;
    const camIn = window.inputs?.camera || 0;
    
    // Combined Camera Pitch = Drone body pitch + Gimbal dial tilt
    const gimbalPitch = Math.round(camIn * 90.0);
    const cameraPitchDeg = (pitchIn * 15.0) + gimbalPitch;
    const rollDeg = rollIn * 15.0;
    
    // --------------------------------------------------
    // COLLISION DETECTING AND RECOVERY LOGIC
    // --------------------------------------------------
    if (isCrashed) {
        const elapsed = Date.now() - crashTime;
        if (elapsed > 2000) {
            isCrashed = false; // Reset crash state
        }
        
        // Render red crashed screen overlay
        ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
        ctx.fillRect(0, 0, w, h);
        
        ctx.fillStyle = "#fff";
        ctx.font = "bold 28px Outfit";
        ctx.textAlign = "center";
        ctx.fillText("⚠️ COLLISION CRASH ⚠️", w/2, h/2 - 20);
        ctx.font = "14px Inter";
        ctx.fillText("You crashed into a tree! Resetting drone position...", w/2, h/2 + 15);
        return;
    }
    
    // Evaluate collision with trees
    for (let tree of worldTrees) {
        const dx = tree.x - droneX;
        const dy = tree.y - droneY;
        const dist2d = Math.sqrt(dx*dx + dy*dy);
        
        // Calculate dynamic collision radius based on altitude
        let currentRadius = tree.radius;
        const totalHeight = tree.trunkH + tree.foliageH;
        if (alt < tree.trunkH) {
            currentRadius = 1.0; // Trunk is much thinner
        } else if (alt < totalHeight) {
            // Linearly interpolate radius from foliage base (tree.radius) to 0 at the peak
            const t = (alt - tree.trunkH) / tree.foliageH;
            currentRadius = tree.radius * (1 - t);
        } else {
            currentRadius = 0; // Drone is flying above the tree
        }
        
        // If drone is too close horizontally and within the tree's vertical bounds
        if (currentRadius > 0 && dist2d < currentRadius) {
            isCrashed = true;
            crashTime = Date.now();
            
            // Reset state positions in app.js
            if (window.droneState) {
                window.droneState.x = 0;
                window.droneState.y = 0;
                // Force alt to ground
                if (window.inputs) {
                    window.inputs.throttle = 0;
                    window.inputs.pitch = 0;
                    window.inputs.roll = 0;
                }
            }
            return;
        }
    }
    
    // Evaluate collision/clearance of Gates
    worldGates.forEach(gate => {
        if (!gate.cleared) {
            const dx = gate.x - droneX;
            const dy = gate.z - alt; // Gate Z is altitude
            const dz = gate.y - droneY;
            const dist3d = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            if (dist3d < 14.0) {
                gate.cleared = true;
                gatesClearedCount++;
                console.log(`Gate ${gate.id} cleared!`);
            }
        }
    });

    const centerX = w / 2;
    const centerY = h / 2;
    const pitchOffset = (cameraPitchDeg / 90.0) * (h / 1.5);
    const horizonY = centerY - pitchOffset;
    
    // --------------------------------------------------
    // DRAW SILHOUETTE MOUNTAIN RANGE (AT HORIZON INFINITY)
    // --------------------------------------------------
    ctx.save();
    // Rotate canvas around center to simulate roll tilt
    ctx.translate(centerX, centerY);
    ctx.rotate((-rollDeg * Math.PI) / 180.0);
    ctx.translate(-centerX, -centerY);
    
    // Sky
    ctx.fillStyle = "rgba(6, 182, 212, 0.04)";
    ctx.fillRect(-w, -h * 2, w * 3, h * 2 + horizonY);
    
    // Mountains
    ctx.fillStyle = "#0c1524"; // Dark mountain silhouette
    ctx.strokeStyle = "rgba(6, 182, 212, 0.25)";
    ctx.lineWidth = 1.5;
    
    mountainPeaks.forEach(peak => {
        let angleDiff = peak.angle - heading;
        while (angleDiff > 180) angleDiff -= 360;
        while (angleDiff < -180) angleDiff += 360;
        
        const px = centerX + (angleDiff * (w / 80.0)); // 80 deg width factor
        const py = horizonY - peak.height;
        const halfW = peak.width / 2;
        
        ctx.beginPath();
        ctx.moveTo(px - halfW, horizonY);
        ctx.lineTo(px, py);
        ctx.lineTo(px + halfW, horizonY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    });
    
    // Ground base plane
    ctx.fillStyle = "#080c14";
    ctx.fillRect(-w, horizonY, w * 3, h * 3);
    
    // Draw horizon line
    ctx.strokeStyle = "rgba(6, 182, 212, 0.5)";
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-w, horizonY);
    ctx.lineTo(w * 2, horizonY);
    ctx.stroke();
    ctx.restore();
    
    // --------------------------------------------------
    // DRAW PERSPECTIVE GROUND TERRAIN GRID
    // --------------------------------------------------
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((-rollDeg * Math.PI) / 180.0);
    ctx.translate(-centerX, -centerY);
    
    if (horizonY < h) {
        ctx.save();
        // Clip to ground plane
        ctx.beginPath();
        ctx.moveTo(-w, horizonY);
        ctx.lineTo(w * 2, horizonY);
        ctx.lineTo(w * 2, h * 2);
        ctx.lineTo(-w, h * 2);
        ctx.closePath();
        ctx.clip();
        
        // Ground lines
        ctx.strokeStyle = "rgba(147, 51, 234, 0.15)";
        ctx.lineWidth = 1.0;
        
        const radialSpacing = w / 4;
        const gridXShift = (droneX % radialSpacing);
        for (let i = -16; i <= 16; i++) {
            const startX = centerX + (i * radialSpacing) - gridXShift;
            ctx.beginPath();
            ctx.moveTo(centerX, horizonY);
            ctx.lineTo(startX, h + 100);
            ctx.stroke();
        }
        
        const gridYShift = (droneY % 50) / 50.0;
        for (let i = 0; i < 15; i++) {
            const t = (i + gridYShift) / 15.0;
            const y = horizonY + Math.pow(t, 2.0) * (h - horizonY + 200);
            ctx.beginPath();
            ctx.moveTo(-w, y);
            ctx.lineTo(w * 2, y);
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
    
    // --------------------------------------------------
    // DRAW 3D BUILDINGS & NEON OBSTACLES
    // --------------------------------------------------
    // Sort buildings by distance (furthest first) for painter's depth algorithm
    const sortedBuildings = worldBuildings.map(b => {
        const dx = b.x - droneX;
        const dy = b.y - droneY;
        const distance = dx*dx + dy*dy;
        return { ...b, distance };
    }).sort((a, b) => b.distance - a.distance);
    
    sortedBuildings.forEach(b => {
        // Only render buildings closer than 350 meters for performance
        if (b.distance < 350 * 350) {
            draw3DBuilding(ctx, b, w, h, droneX, droneY, alt, heading, cameraPitchDeg);
        }
    });
    
    // --------------------------------------------------
    // DRAW 3D FOREST TREES
    // --------------------------------------------------
    const sortedTrees = worldTrees.map(t => {
        const dx = t.x - droneX;
        const dy = t.y - droneY;
        const distance = dx*dx + dy*dy;
        return { ...t, distance };
    }).sort((a, b) => b.distance - a.distance);
    
    sortedTrees.forEach(t => {
        if (t.distance < 280 * 280) {
            draw3DTree(ctx, t, w, h, droneX, droneY, alt, heading, cameraPitchDeg);
        }
    });

    // --------------------------------------------------
    // DRAW 3D GATES (RINGS)
    // --------------------------------------------------
    worldGates.forEach(gate => {
        draw3DGate(ctx, gate, w, h, droneX, droneY, alt, heading, cameraPitchDeg);
    });

    // --------------------------------------------------
    // DRAW HUD OSD OVERLAYS
    // --------------------------------------------------
    const padding = 20;
    
    // Flight OSD Central Crosshair & Pitch Ladder
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((-rollDeg * Math.PI) / 180.0);
    
    ctx.strokeStyle = "rgba(6, 182, 212, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "rgba(6, 182, 212, 0.7)";
    ctx.font = "10px Inter";
    
    // Crosshair Center ring
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-25, 0); ctx.lineTo(-10, 0);
    ctx.moveTo(10, 0); ctx.lineTo(25, 0);
    ctx.stroke();
    
    // Pitch Ladder
    const pxPerDeg = h / 90.0;
    const pitchMarkings = [-20, -10, 10, 20];
    pitchMarkings.forEach(angle => {
        const yPos = -(angle - (cameraPitchDeg - gimbalPitch)) * pxPerDeg;
        ctx.beginPath();
        ctx.moveTo(-25, yPos);
        ctx.lineTo(25, yPos);
        ctx.moveTo(-25, yPos);
        ctx.lineTo(-25, yPos + (angle > 0 ? 5 : -5));
        ctx.moveTo(25, yPos);
        ctx.lineTo(25, yPos + (angle > 0 ? 5 : -5));
        ctx.stroke();
        ctx.fillText(Math.abs(angle).toString(), -40, yPos + 4);
        ctx.fillText(Math.abs(angle).toString(), 33, yPos + 4);
    });
    ctx.restore();
    
    // Speed Tape Panel (Left)
    const tapeW = 45;
    const tapeH = 120;
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.strokeStyle = "rgba(6, 182, 212, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(padding, h/2 - tapeH/2, tapeW, tapeH, 8);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px Outfit";
    ctx.textAlign = "center";
    ctx.fillText((speed * 3.6).toFixed(1), padding + tapeW/2, h/2 - 10);
    ctx.fillStyle = "rgba(6, 182, 212, 0.8)";
    ctx.font = "9px Inter";
    ctx.fillText("km/h", padding + tapeW/2, h/2 + 5);
    ctx.fillText("SPEED", padding + tapeW/2, h/2 + 25);
    
    // Altitude Tape Panel (Right)
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.beginPath();
    ctx.roundRect(w - padding - tapeW, h/2 - tapeH/2, tapeW, tapeH, 8);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px Outfit";
    ctx.fillText(alt.toFixed(1) + "m", w - padding - tapeW/2, h/2 - 10);
    ctx.fillStyle = "rgba(6, 182, 212, 0.8)";
    ctx.font = "9px Inter";
    ctx.fillText("ALT", w - padding - tapeW/2, h/2 + 5);
    ctx.fillText(`D: ${Math.round(dist)}m`, w - padding - tapeW/2, h/2 + 25);
    
    // Top Heading Ribbon
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.beginPath();
    ctx.roundRect(w/2 - 70, padding, 140, 24, 6);
    ctx.fill();
    ctx.stroke();
    
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Outfit";
    ctx.fillText(`HDG: ${Math.round(heading)}°`, w/2, padding + 16);
    
    // FPV status indicators
    ctx.textAlign = "left";
    if (isRecording) {
        if (osdBlinkToggle) {
            ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
            ctx.beginPath();
            ctx.arc(padding + 10, padding + 10, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = "#fff";
        ctx.font = "9px Inter";
        ctx.fillText("REC OSD", padding + 22, padding + 13);
    } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "9px Inter";
        ctx.fillText("STANDBY", padding + 10, padding + 13);
    }
    
    // Score Dashboard OSD (Top Left)
    ctx.fillStyle = "rgba(6, 182, 212, 0.8)";
    ctx.font = "bold 10px Outfit";
    ctx.fillText(`GATES: ${gatesClearedCount} / ${worldGates.length}`, padding + 10, padding + 32);
    
    // Top Right Status Indicators
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(6, 182, 212, 0.9)";
    ctx.fillText(`GIMBAL: ${gimbalPitch}°`, w - padding, padding + 13);
    
    // RTH Warning Active Overlay
    if (rthActive) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
        ctx.beginPath();
        ctx.roundRect(w/2 - 80, h - padding - 35, 160, 28, 6);
        ctx.fill();
        
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px Outfit";
        ctx.textAlign = "center";
        ctx.fillText("⚠️ RTH ENGAGED 🔄", w/2, h - padding - 17);
    }
}

/**
 * Renders a wireframe 3D building skyscraper.
 */
function draw3DBuilding(ctx, b, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg) {
    const hw = b.w / 2;
    const hd = b.d / 2;
    
    // 8 vertices of cube
    const vertices = [
        {x: b.x - hw, y: 0,   z: b.y - hd}, // 0
        {x: b.x + hw, y: 0,   z: b.y - hd}, // 1
        {x: b.x + hw, y: 0,   z: b.y + hd}, // 2
        {x: b.x - hw, y: 0,   z: b.y + hd}, // 3
        {x: b.x - hw, y: b.h, z: b.y - hd}, // 4
        {x: b.x + hw, y: b.h, z: b.y - hd}, // 5
        {x: b.x + hw, y: b.h, z: b.y + hd}, // 6
        {x: b.x - hw, y: b.h, z: b.y + hd}  // 7
    ];
    
    const projected = vertices.map(v => project3DPoint(v.x, v.y, v.z, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg));
    
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1.0;
    
    function drawEdge(i, j) {
        if (projected[i] && projected[j]) {
            ctx.beginPath();
            ctx.moveTo(projected[i].x, projected[i].y);
            ctx.lineTo(projected[j].x, projected[j].y);
            ctx.stroke();
        }
    }
    
    // Draw base ring
    drawEdge(0, 1); drawEdge(1, 2); drawEdge(2, 3); drawEdge(3, 0);
    // Draw roof ring
    drawEdge(4, 5); drawEdge(5, 6); drawEdge(6, 7); drawEdge(7, 4);
    // Draw pillars
    drawEdge(0, 4); drawEdge(1, 5); drawEdge(2, 6); drawEdge(3, 7);
}

/**
 * Renders a wireframe 3D pine tree (trunk + foliage cone).
 */
function draw3DTree(ctx, t, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg) {
    const base = project3DPoint(t.x, 0, t.y, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg);
    const mid = project3DPoint(t.x, t.trunkH, t.y, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg);
    const peak = project3DPoint(t.x, t.trunkH + t.foliageH, t.y, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg);
    
    if (base && mid) {
        // Draw trunk (brown)
        ctx.strokeStyle = "rgba(180, 83, 9, 0.5)"; // Brown
        ctx.lineWidth = 3.0;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(mid.x, mid.y);
        ctx.stroke();
    }
    
    if (mid && peak) {
        // Draw foliage (cone)
        ctx.strokeStyle = "rgba(34, 197, 94, 0.4)"; // Neon Green
        ctx.lineWidth = 1.0;
        
        // Draw foliage base points
        const leftF = project3DPoint(t.x - 3.5, t.trunkH, t.y, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg);
        const rightF = project3DPoint(t.x + 3.5, t.trunkH, t.y, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg);
        
        if (leftF && rightF) {
            ctx.beginPath();
            ctx.moveTo(leftF.x, leftF.y);
            ctx.lineTo(rightF.x, rightF.y);
            ctx.lineTo(peak.x, peak.y);
            ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = "rgba(34, 197, 94, 0.08)";
            ctx.fill();
        }
    }
}

/**
 * Renders a glowing neon flight hoop/gate in 3D.
 */
function draw3DGate(ctx, gate, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg) {
    const numPoints = 16;
    const projectedPoints = [];
    
    // Generate circular ring vertices perpendicular to travel path (along Z/X plane)
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const wx = gate.x + Math.cos(angle) * gate.radius;
        const wy = gate.z + Math.sin(angle) * gate.radius; // gate.z is altitude
        const wz = gate.y;
        
        const proj = project3DPoint(wx, wy, wz, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg);
        if (proj) {
            projectedPoints.push(proj);
        }
    }
    
    if (projectedPoints.length > 2) {
        ctx.save();
        ctx.strokeStyle = gate.cleared ? "rgba(34, 197, 94, 0.8)" : "rgba(6, 182, 212, 0.8)";
        ctx.lineWidth = gate.cleared ? 2 : 3;
        
        // Draw circular path
        ctx.beginPath();
        ctx.moveTo(projectedPoints[0].x, projectedPoints[0].y);
        for (let i = 1; i < projectedPoints.length; i++) {
            ctx.lineTo(projectedPoints[i].x, projectedPoints[i].y);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Glowing neon core fill
        ctx.fillStyle = gate.cleared ? "rgba(34, 197, 94, 0.08)" : "rgba(6, 182, 212, 0.08)";
        ctx.fill();
        
        // Label above gate
        const centerProj = project3DPoint(gate.x, gate.z + gate.radius + 3, gate.y, canvasW, canvasH, droneX, droneY, droneAlt, heading, cameraPitchDeg);
        if (centerProj) {
            ctx.fillStyle = gate.cleared ? "#22c55e" : "#06b6d4";
            ctx.font = "bold 9px Outfit";
            ctx.textAlign = "center";
            ctx.fillText(gate.cleared ? `GATE ${gate.id} PASS` : `GATE ${gate.id}`, centerProj.x, centerProj.y);
        }
        ctx.restore();
    }
}

/**
 * Draws the 2D Top-Down circular flight radar screen.
 */
function drawRadarFeed() {
    if (!radarCanvas || !radarCtx) return;
    
    const w = radarCanvas.width;
    const h = radarCanvas.height;
    const ctx = radarCtx;
    
    const cx = w / 2;
    const cy = h / 2;
    const maxRadarRange = 220; // 220 meters radar radius range
    const scale = cx / maxRadarRange;
    
    // Fetch live states
    const state = window.droneState || {};
    const droneX = state.x || 0;
    const droneY = state.y || 0;
    const heading = state.heading || 0;
    
    // Clear radar background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(7, 11, 19, 0.85)";
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(6, 182, 212, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // Draw concentric range rings (50m, 100m, 200m)
    const ranges = [50, 100, 200];
    ctx.strokeStyle = "rgba(6, 182, 212, 0.15)";
    ctx.lineWidth = 1;
    ctx.font = "7px Inter";
    ctx.fillStyle = "rgba(6, 182, 212, 0.4)";
    ctx.textAlign = "center";
    
    ranges.forEach(r => {
        const radius = r * scale;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText(`${r}m`, cx, cy - radius + 8);
    });
    
    // Helper to translate and rotate world coordinate relative to drone position and heading
    function getRadarPos(wx, wy) {
        const dx = wx - droneX;
        const dy = wy - droneY;
        
        // Rotate by heading so top of radar is ALWAYS the direction drone is facing!
        const headingRad = (-heading * Math.PI) / 180.0;
        const rx = dx * Math.cos(headingRad) - dy * Math.sin(headingRad);
        const ry = dx * Math.sin(headingRad) + dy * Math.cos(headingRad);
        
        return {
            x: cx + rx * scale,
            y: cy - ry * scale // Invert Y for screen coordinates
        };
    }
    
    // Draw world buildings on radar (colored boxes)
    worldBuildings.forEach(b => {
        const pos = getRadarPos(b.x, b.y);
        // Clip to radar circle limits
        const dx = pos.x - cx;
        const dy = pos.y - cy;
        if (Math.sqrt(dx*dx + dy*dy) < (cx - 5)) {
            ctx.fillStyle = "rgba(147, 51, 234, 0.5)"; // Purple
            ctx.fillRect(pos.x - 3, pos.y - 3, 6, 6);
        }
    });
    
    // Draw forest trees on radar (green dots)
    worldTrees.forEach(t => {
        const pos = getRadarPos(t.x, t.y);
        const dx = pos.x - cx;
        const dy = pos.y - cy;
        if (Math.sqrt(dx*dx + dy*dy) < (cx - 5)) {
            ctx.fillStyle = "rgba(34, 197, 94, 0.6)"; // Green
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    
    // Draw flying gates on radar (cyan rings)
    worldGates.forEach(gate => {
        const pos = getRadarPos(gate.x, gate.y);
        const dx = pos.x - cx;
        const dy = pos.y - cy;
        if (Math.sqrt(dx*dx + dy*dy) < (cx - 5)) {
            ctx.strokeStyle = gate.cleared ? "#22c55e" : "#06b6d4";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
            ctx.stroke();
        }
    });
    
    // Draw Home Point (0, 0)
    const homePos = getRadarPos(0, 0);
    const hdx = homePos.x - cx;
    const hdy = homePos.y - cy;
    if (Math.sqrt(hdx*hdx + hdy*hdy) < (cx - 5)) {
        ctx.fillStyle = "#22c55e"; // Green Home H
        ctx.font = "bold 9px Outfit";
        ctx.fillText("H", homePos.x, homePos.y + 3);
    }
    
    // Draw current drone pointer at center (pointing UP, since radar rotates with heading!)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "var(--accent-cyan)";
    ctx.lineWidth = 1.5;
    
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-4, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

// Generate objects immediately
generateWorldAssets();

// Initialize FPV module when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initFPV();
});
