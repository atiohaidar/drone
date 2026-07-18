// ==========================================
// ANTIGRAVITY DJI WEB FLIGHT DASHBOARD LOGIC
// ==========================================

// Global state variables
let socket = null;
let isConnected = false;
let activeTab = 'simulator';
let logs = [];
let activeLogId = null;

// Simulator Drone variables
const homePoint = { lat: -8.3712, lng: 115.1611 }; // Lake Bratan, Bedugul, Bali (Scenic location!)
let dronePos = { ...homePoint };
let droneHeading = 0; // Degrees (0 = North)
let droneAlt = 0; // Meters
let droneSpeed = 0; // m/s
let droneDist = 0; // Meters
let cameraPitch = 0; // Gimbal camera angle (-90 to 0)
let droneX = 0.0; // Flat coordinate East-West (meters)
let droneY = 0.0; // Flat coordinate North-South (meters)
let rthActive = false; // RTH mode state
let prevRthButtonState = 0; // State tracker for RTH button debounce
let flightMode = 'P'; // Modes: 'C' (Cine), 'P' (Positioning), 'S' (Sport)

// Stick inputs (-1.0 to 1.0)
let inputs = {
    throttle: 0.0,
    yaw: 0.0,
    pitch: 0.0,
    roll: 0.0,
    camera: 0.0,
    btn_rtbh: 0
};

// Keyboard state for demo mode
let keys = {};

// Leaflet Map objects
let map = null;
let droneMarker = null;
let flightPathPolyline = null;
let recordedPath = [];

// Recording variables
let isRecording = false;
let recordStartTime = 0;
let recordTimerInterval = null;
let recordedDataPoints = [];

// Chart.js instances
let telemetryChartInstance = null;
let durationChartInstance = null;
let peaksChartInstance = null;
let visRealtimeChart = null; // Real-time sticks channels chart

// Expose simulator telemetry and inputs globally to window space
window.inputs = inputs;
window.droneState = {
    get alt() { return droneAlt; },
    get speed() { return droneSpeed; },
    get dist() { return droneDist; },
    get heading() { return droneHeading; },
    get isRecording() { return isRecording; },
    get rthActive() { return rthActive; },
    get isConnected() { return isConnected; },
    get flightMode() { return flightMode; },
    get x() { return droneX; },
    get y() { return droneY; },
    set x(val) { droneX = val; },
    set y(val) { droneY = val; }
};

// Initialize app when window loads
window.onload = function() {
    initTabs();
    initMap();
    loadLogsFromStorage();
    initDateTimeUpdater();
    initKeyboardListeners();
    initRealtimeChart(); // Initialize new scrolling visualizer chart
    startSimulatorLoop();
    updateAnalytics();
    
    // Check if logs are empty, load demo logs automatically for first-time premium look!
    if (logs.length === 0) {
        generateDemoFlightLogs();
    } else {
        renderLogTable();
    }
};

// ==========================================
// TABS & INTERFACE MANAGEMENT
// ==========================================
function initTabs() {
    switchTab('simulator');
}

function switchTab(tabId) {
    activeTab = tabId;
    
    // Update active nav-item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeBtn = document.getElementById(`btn-tab-${tabId}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    // Update active tab-content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    // Update header page-title
    const pageTitle = document.getElementById('page-title');
    if (tabId === 'simulator') {
        pageTitle.innerText = "Controller Visualizer & HUD";
        if (map) setTimeout(() => map.invalidateSize(), 100); // Fix Leaflet resize bug if active
    } else if (tabId === 'logbook') {
        pageTitle.innerText = "DJI Flight Records Logbook";
        renderLogTable();
    } else if (tabId === 'analytics') {
        pageTitle.innerText = "Flight Telemetry Analytics";
        renderAnalyticsCharts();
    }
}

function initDateTimeUpdater() {
    const timeEl = document.getElementById('current-time');
    function update() {
        const d = new Date();
        const options = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        timeEl.innerText = d.toLocaleDateString('en-US', options);
    }
    update();
    setInterval(update, 1000);
}

// ==========================================
// KEYBOARD & SIMULATOR PHYSICS ENGINE
// ==========================================
function initKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyM' && !keys['KeyM']) {
            if (flightMode === 'C') { flightMode = 'P'; logAction("Flight Mode Switch -> Positioning (P)", "system"); }
            else if (flightMode === 'P') { flightMode = 'S'; logAction("Flight Mode Switch -> Sport (S)", "system"); }
            else { flightMode = 'C'; logAction("Flight Mode Switch -> CineSmooth (C)", "system"); }
            
            const modeEl = document.getElementById('tele-mode');
            if (modeEl) {
                modeEl.innerText = flightMode + ' MODE';
                if (flightMode === 'S') modeEl.style.color = '#ff4d4d';
                else if (flightMode === 'C') modeEl.style.color = '#ffcc00';
                else modeEl.style.color = '#00ffcc';
            }
        }
        keys[e.code] = true;
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.code] = false;
    });
}

function updateInputsFromKeyboard() {
    // If WebSocket is connected, we use WebSocket controller stick inputs, not keyboard.
    if (isConnected) return;

    // Reset inputs
    inputs.throttle = 0.0;
    inputs.yaw = 0.0;
    inputs.pitch = 0.0;
    inputs.roll = 0.0;

    // Left Stick: Throttle (climb/descend) using W/S
    if (keys['KeyW']) inputs.throttle = 0.6;
    if (keys['KeyS']) inputs.throttle = -0.6;

    // Left Stick: Yaw (heading rotation) using A/D
    if (keys['KeyA']) inputs.yaw = -0.5;
    if (keys['KeyD']) inputs.yaw = 0.5;

    // Right Stick: Pitch (forward/back) using ArrowUp/ArrowDown
    if (keys['ArrowUp']) inputs.pitch = 0.7;
    if (keys['ArrowDown']) inputs.pitch = -0.7;

    // Right Stick: Roll (strafe left/right) using ArrowLeft/ArrowRight
    if (keys['ArrowLeft']) inputs.roll = -0.7;
    if (keys['ArrowRight']) inputs.roll = 0.7;

    // Camera Tilt Dial using Q/E
    if (keys['KeyQ']) inputs.camera = Math.max(-1.0, inputs.camera - 0.05);
    if (keys['KeyE']) inputs.camera = Math.min(1.0, inputs.camera + 0.05);
}

function toggleRTH() {
    if (rthActive) {
        cancelRTH();
    } else {
        if (droneDist < 2.0 && droneAlt < 0.5) {
            return; // Already at home
        }
        rthActive = true;
        const banner = document.getElementById('rth-banner');
        if (banner) banner.style.display = "flex";
        console.log("RTH Mode Activated");
    }
}

function cancelRTH() {
    if (rthActive) {
        rthActive = false;
        const banner = document.getElementById('rth-banner');
        if (banner) banner.style.display = "none";
        console.log("RTH Mode Cancelled");
    }
}

function startSimulatorLoop() {
    let lastTime = performance.now();
    
    function loop(now) {
        requestAnimationFrame(loop);
        
        const dt = (now - lastTime) / 1000.0; // Seconds
        lastTime = now;
        
        // 1. Fetch keyboard controls if controller is not connected
        updateInputsFromKeyboard();
        
        // 2. Return To Home Autopilot Logic
        if (rthActive) {
            // Check if user is attempting to override using sticks
            // If they push sticks significantly, cancel RTH and return control
            if (Math.abs(inputs.pitch) > 0.35 || Math.abs(inputs.roll) > 0.35 || 
                Math.abs(inputs.throttle) > 0.35 || Math.abs(inputs.yaw) > 0.35) {
                cancelRTH();
            } else {
                // RTH autopilot overrides pitch, roll, throttle, yaw
                inputs.pitch = 0.0;
                inputs.roll = 0.0;
                inputs.throttle = 0.0;
                inputs.yaw = 0.0;
                
                if (droneAlt < 30.0 && droneDist > 3.0) {
                    // Stage A: Ascend to safe RTH altitude (30m)
                    inputs.throttle = 0.6; // Climb
                } else if (droneDist > 3.0) {
                    // Stage B: Fly back to homePoint (0, 0)
                    const dx = 0.0 - droneX;
                    const dy = 0.0 - droneY;
                    let targetHeading = Math.atan2(dx, dy) * (180.0 / Math.PI);
                    if (targetHeading < 0) targetHeading += 360;
                    
                    let headingDiff = targetHeading - droneHeading;
                    while (headingDiff > 180) headingDiff -= 360;
                    while (headingDiff < -180) headingDiff += 360;
                    
                    // Rotate drone to face home
                    if (Math.abs(headingDiff) > 10.0) {
                        inputs.yaw = headingDiff > 0 ? 0.6 : -0.6;
                    }
                    // Pitch forward if mostly pointing home
                    if (Math.abs(headingDiff) < 45.0) {
                        inputs.pitch = 0.8;
                    }
                } else {
                    // Stage C: Descend and land
                    inputs.pitch = 0.0;
                    inputs.roll = 0.0;
                    inputs.yaw = 0.0;
                    
                    if (droneAlt > 0.1) {
                        inputs.throttle = -0.4; // Descend
                    } else {
                        droneAlt = 0.0;
                        inputs.throttle = 0.0;
                        cancelRTH();
                    }
                }
            }
        }
        
        // 3. Physics & Navigation updates
        // Set specs based on flight mode (DJI Mavic Mini 1)
        let yawSpeed = 130.0; // P Mode
        let climbRate = 3.0; // P Mode
        let maxPitchSpeed = 8.0; // P Mode (28.8 km/h)
        let maxRollSpeed = 8.0; 
        
        if (flightMode === 'S') {
            yawSpeed = 150.0; // Sport Mode
            climbRate = 4.0; 
            maxPitchSpeed = 13.0; // Sport Mode (46.8 km/h)
            maxRollSpeed = 13.0;
        } else if (flightMode === 'C') {
            yawSpeed = 30.0; // Cine Mode
            climbRate = 1.5;
            maxPitchSpeed = 4.0; // Cine Mode (14.4 km/h)
            maxRollSpeed = 4.0;
        }

        // Heading change rate (Yaw)
        droneHeading += inputs.yaw * yawSpeed * dt;
        if (droneHeading < 0) droneHeading += 360;
        if (droneHeading >= 360) droneHeading -= 360;
        
        // Altitude change rate (Throttle)
        droneAlt += inputs.throttle * climbRate * dt;
        if (droneAlt < 0.0) droneAlt = 0.0; // Ground limit
        if (droneAlt > 500.0) droneAlt = 500.0; // Software limit
        
        // Pitch & Roll movements
        
        // Horizontal speed vectors relative to drone heading
        // Pitch moves drone along its heading vector
        const headingRad = (droneHeading * Math.PI) / 180.0;
        const forwardSpeed = inputs.pitch * maxPitchSpeed;
        const strafeSpeed = inputs.roll * maxRollSpeed;
        
        // Calculate velocity vector in North/East frame (Y=North, X=East)
        // Forward stick (pitch > 0) moves forward: North component = cos, East component = sin
        const vy_forward = forwardSpeed * Math.cos(headingRad);
        const vx_forward = forwardSpeed * Math.sin(headingRad);
        
        // Right stick (roll > 0) moves right: North component = cos(heading + 90), East component = sin(heading + 90)
        const rollRad = headingRad + (Math.PI / 2.0);
        const vy_strafe = strafeSpeed * Math.cos(rollRad);
        const vx_strafe = strafeSpeed * Math.sin(rollRad);
        
        const vx = vx_forward + vx_strafe; // East velocity
        const vy = vy_forward + vy_strafe; // North velocity
        
        // Update drone speed
        droneSpeed = Math.sqrt(vx*vx + vy*vy);
        
        // Update local flat coordinates in meters
        droneX += vx * dt;
        droneY += vy * dt;

        // Translate to lat/lng for background database logging
        const earthRadius = 6378137.0; // meters
        dronePos.lat = homePoint.lat + (droneY / earthRadius) * (180.0 / Math.PI);
        dronePos.lng = homePoint.lng + (droneX / (earthRadius * Math.cos((homePoint.lat * Math.PI) / 180.0))) * (180.0 / Math.PI);
        
        // Map inputs.camera (-1.0 to 1.0) to gimbal pitch range (-90 to +20)
        cameraPitch = Math.round(((inputs.camera + 1.0) / 2.0) * 110.0) - 90.0;
        if (cameraPitch > 20) cameraPitch = 20;
        if (cameraPitch < -90) cameraPitch = -90;

        // Calculate flat distance from home
        droneDist = Math.sqrt(droneX * droneX + droneY * droneY);
        
        // 3. Render visuals in HUD (if Simulator tab is open)
        if (activeTab === 'simulator') {
            updateHUDVisuals();
        }
        
        // 4. Handle flight recording
        if (isRecording) {
            recordTelemetryPoint();
        }
    }
    
    requestAnimationFrame(loop);
}

// Distance helper using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const phi1 = lat1 * Math.PI/180;
    const phi2 = lat2 * Math.PI/180;
    const deltaPhi = (lat2-lat1) * Math.PI/180;
    const deltaLambda = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // meters
}

// ==========================================
// WEBSOCKET CONTROLLER CLIENT
// ==========================================
function toggleWebSocket() {
    if (isConnected) {
        disconnectWebSocket();
    } else {
        connectWebSocket();
    }
}

function connectWebSocket() {
    const connDot = document.getElementById('conn-dot');
    const connText = document.getElementById('conn-text');
    const connPort = document.getElementById('conn-port');
    const connBtn = document.getElementById('btn-connect');
    
    connText.innerText = "Connecting...";
    connDot.className = "status-dot disconnected";
    
    socket = new WebSocket("ws://127.0.0.1:8765");
    
    socket.onopen = function() {
        isConnected = true;
        connDot.className = "status-dot connected";
        connText.innerText = "Connected";
        connBtn.innerText = "Disconnect";
        connBtn.className = "btn btn-secondary";
        console.log("WebSocket connection established!");
    };
    
    socket.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            
            // Map inputs from WebSocket packet
            inputs.throttle = data.throttle;
            inputs.yaw = data.yaw;
            inputs.pitch = data.pitch;
            inputs.roll = data.roll;
            inputs.camera = data.camera;
            
            // Check button state transitions for event logging
            if (data.btn_fn === 1 && inputs.btn_fn === 0) {
                logAction("Fn (C1) Button pressed -> Action: Custom Fn triggered", "success");
            }
            if (data.btn_photo === 1 && inputs.btn_photo === 0) {
                logAction("Shutter Button pressed -> Action: Shutter command triggered", "success");
            }
            if (data.btn_pause === 1 && inputs.btn_pause === 0) {
                logAction("Sport/Pause Switch ON -> Action: Pausing / Sport mode toggled", "warning");
            }
            if (data.btn_pause === 0 && inputs.btn_pause === 1) {
                logAction("Sport/Pause Switch OFF -> Action: Return to Normal Flight Mode", "system");
            }
            
            // Log RC Battery alerts on transitions
            if (data.rc_charging === 1 && inputs.rc_charging === 0) {
                logAction("Remote Controller connected to charger -> Charging...", "success");
            }
            if (data.rc_charging === 0 && inputs.rc_charging === 1) {
                logAction("Remote Controller charger disconnected -> Discharging", "system");
            }
            if (data.rc_battery <= 20 && inputs.rc_battery > 20) {
                logAction(`⚠️ LOW RC BATTERY ALERT: Remote Controller at ${data.rc_battery}%! Please charge!`, "warning");
            }

            inputs.btn_fn = data.btn_fn;
            inputs.btn_photo = data.btn_photo;
            inputs.btn_pause = data.btn_pause;
            inputs.btn_rtbh = data.btn_rtbh;
            inputs.rc_battery = data.rc_battery !== undefined ? data.rc_battery : 100;
            inputs.rc_charging = data.rc_charging !== undefined ? data.rc_charging : 0;
            
            // Toggle RTH on button press rising edge
            if (data.btn_rtbh === 1 && prevRthButtonState === 0) {
                toggleRTH();
            }
            prevRthButtonState = data.btn_rtbh;
            
            connPort.innerText = `Port: ${data.port}`;
            
            // Update connection widget status based on controller active status
            if (data.dji_connected) {
                connDot.className = "status-dot connected";
                connText.innerText = "Active";
            } else {
                connDot.className = "status-dot disconnected-warn";
                connText.innerText = data.status || "Waiting...";
            }
            
            // Update diagnostics UI
            updateDiagnosticsUI(data);
        } catch (e) {
            console.error("Error parsing WebSocket data:", e);
        }
    };
    
    socket.onclose = function() {
        cleanupWebSocket();
        console.log("WebSocket connection closed.");
    };
    
    socket.onerror = function(err) {
        cleanupWebSocket();
        connText.innerText = "Bridge Error";
        console.error("WebSocket encountered an error:", err);
    };
}

function disconnectWebSocket() {
    if (socket) {
        socket.close();
    }
}

function cleanupWebSocket() {
    isConnected = false;
    socket = null;
    const connDot = document.getElementById('conn-dot');
    const connText = document.getElementById('conn-text');
    const connPort = document.getElementById('conn-port');
    const connBtn = document.getElementById('btn-connect');
    
    connDot.className = "status-dot disconnected";
    connText.innerText = "Disconnected";
    connPort.innerText = "Port: None";
    connBtn.innerText = "Connect Bridge";
    connBtn.className = "btn btn-primary";
}

// ==========================================
// RENDER & TELEMETRY HUD UPDATING
// ==========================================
function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    
    // Initial Leaflet Map setup
    map = L.map('map', {
        zoomControl: true,
        attributionControl: false
    }).setView([homePoint.lat, homePoint.lng], 17);
    window.map = map; // Expose to window object for fpv.js module access
    
    // Add beautiful dark styled map tile layers
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
    }).addTo(map);
    
    // Custom Home marker
    const homeIcon = L.divIcon({
        className: 'custom-home-icon',
        html: '<div class="home-radar"></div>',
        iconSize: [20, 20]
    });
    L.marker([homePoint.lat, homePoint.lng], { icon: homeIcon }).addTo(map);
    
    // Custom Drone marker (styled via CSS to support rotations)
    const droneIcon = L.divIcon({
        className: 'custom-drone-map-icon',
        html: `<div class="drone-map-pointer" id="drone-pointer-map">
                 <svg viewBox="0 0 24 24" fill="var(--accent-cyan)" width="28" height="28">
                    <polygon points="12,2 22,22 12,17 2,22"></polygon>
                 </svg>
               </div>`,
        iconSize: [30, 30]
    });
    droneMarker = L.marker([dronePos.lat, dronePos.lng], { icon: droneIcon }).addTo(map);
    
    // Polyline path tracking
    flightPathPolyline = L.polyline([], {
        color: 'var(--accent-cyan)',
        weight: 3,
        opacity: 0.9,
        dashArray: '5, 5'
    }).addTo(map);
}

function updateHUDVisuals() {
    // 1. Update leaflet marker position
    if (map && droneMarker) {
        try {
            const latlng = L.latLng(dronePos.lat, dronePos.lng);
            droneMarker.setLatLng(latlng);
            
            // Keep map centered on drone
            map.panTo(latlng);
            
            // Append to live trailing path
            recordedPath.push([dronePos.lat, dronePos.lng]);
            if (recordedPath.length > 500) recordedPath.shift(); // Limit map trail tail length
            flightPathPolyline.setLatLngs(recordedPath);
            
            // 2. Rotate Map Drone marker pointer
            const pointer = document.getElementById('drone-pointer-map');
            if (pointer) {
                pointer.style.transform = `rotate(${droneHeading}deg)`;
            }
        } catch (err) {}
    }
    
    // 3. Update Compass Dial
    // Rotating the compass dial ring negative degrees makes N point top
    const compassRing = document.querySelector('#hud-compass .compass-ring');
    if (compassRing) {
        compassRing.style.transform = `rotate(${-droneHeading}deg)`;
    }
    document.getElementById('val-heading').innerText = `${Math.round(droneHeading)}°`;
    
    // 4. Update Artificial Horizon Pitch & Roll
    const pitchVal = inputs.pitch * 25.0; // Simulate pitch angles up to 25 degrees
    const rollVal = inputs.roll * 25.0;  // Simulate roll angles up to 25 degrees
    
    const horizonSkyGround = document.querySelector('#hud-horizon .horizon-sky-ground');
    if (horizonSkyGround) {
        // Translation shifts the horizon bar (pitch), rotation tilts it (roll)
        // Center shift: 0px. Pitch translation: multiply by pixels per degree
        const translationY = pitchVal * 1.5; 
        horizonSkyGround.style.transform = `translateY(${translationY}px) rotate(${-rollVal}deg)`;
    }
    document.getElementById('val-gyro').innerText = `P: ${Math.round(pitchVal)}° | R: ${Math.round(rollVal)}°`;
    
    // 5. Update CSS 3D Drone orientation
    const drone3D = document.getElementById('drone-3d');
    if (drone3D) {
        // We rotate visual representation based on inputs
        drone3D.style.transform = `rotateX(${80 + pitchVal}deg) rotateY(${rollVal}deg) rotateZ(${droneHeading}deg)`;
    }
    
    const droneCam3D = document.getElementById('drone-camera-3d');
    if (droneCam3D) {
        // Gimbal pitch rotation on camera
        droneCam3D.style.transform = `rotateX(${cameraPitch}deg)`;
    }
    
    // 6. Update numeric HUD parameters
    document.getElementById('tele-alt').innerText = `${droneAlt.toFixed(1)}m`;
    document.getElementById('tele-speed').innerText = `${(droneSpeed * 3.6).toFixed(1)} km/h`; // Show km/h
    document.getElementById('tele-dist').innerText = `${Math.round(droneDist)}m`;
    document.getElementById('tele-gimbal').innerText = `${cameraPitch}°`;
    
    // 7. Update Live Controller visualizer dashboard panels
    updateControllerVisualizerHUD();
}

function updateDiagnosticsUI(data) {
    // Left stick gimbal dot (X=Yaw, Y=Throttle)
    const leftDot = document.getElementById('stick-left-dot');
    // Map -1.0 to 1.0 to 10% to 90% (Left stick)
    const yawPercent = 50 + (data.yaw * 40);
    const throttlePercent = 50 - (data.throttle * 40); // Invert Y
    leftDot.style.left = `${yawPercent}%`;
    leftDot.style.top = `${throttlePercent}%`;
    document.getElementById('coord-left').innerText = `Y: ${data.yaw.toFixed(2)} | T: ${data.throttle.toFixed(2)}`;
    
    // Right stick gimbal dot (X=Roll, Y=Pitch)
    const rightDot = document.getElementById('stick-right-dot');
    const rollPercent = 50 + (data.roll * 40);
    const pitchPercent = 50 - (data.pitch * 40); // Invert Y
    rightDot.style.left = `${rollPercent}%`;
    rightDot.style.top = `${pitchPercent}%`;
    document.getElementById('coord-right').innerText = `R: ${data.roll.toFixed(2)} | P: ${data.pitch.toFixed(2)}`;
    
    // Buttons text indicators
    setDiagButton('diag-b1', data.btn_fn);
    setDiagButton('diag-b2', data.btn_photo);
    setDiagButton('diag-b3', data.btn_rtbh);
    setDiagButton('diag-b4', data.btn_pause);
    document.getElementById('diag-t1').innerText = data.dial_click;
}

function setDiagButton(id, isActive) {
    const el = document.getElementById(id);
    if (isActive) {
        el.innerText = "ON";
        el.className = "active";
    } else {
        el.innerText = "OFF";
        el.className = "";
    }
}

// ==========================================
// FLIGHT RECORDER & LOCAL STORAGE LOGBOOK
// ==========================================
function toggleRecording() {
    if (isRecording) {
        stopFlightRecording();
    } else {
        startFlightRecording();
    }
}

function startFlightRecording() {
    isRecording = true;
    recordStartTime = Date.now();
    recordedDataPoints = [];
    recordedPath = []; // Clear visual trail
    
    // Visual alerts
    const btn = document.getElementById('btn-record');
    const timer = document.getElementById('record-timer');
    btn.classList.add('recording');
    timer.style.display = 'inline';
    timer.innerText = "00:00";
    
    recordTimerInterval = setInterval(() => {
        const elapsedSecs = Math.floor((Date.now() - recordStartTime) / 1000);
        const mins = Math.floor(elapsedSecs / 60).toString().padStart(2, '0');
        const secs = (elapsedSecs % 60).toString().padStart(2, '0');
        timer.innerText = `${mins}:${secs}`;
    }, 1000);
    
    console.log("Flight telemetry recording started...");
}

function recordTelemetryPoint() {
    const timeDelta = Math.floor((Date.now() - recordStartTime) / 1000);
    // Log telemetry point every 1 second
    const lastPoint = recordedDataPoints[recordedDataPoints.length - 1];
    if (!lastPoint || lastPoint.time !== timeDelta) {
        recordedDataPoints.push({
            time: timeDelta,
            lat: dronePos.lat,
            lng: dronePos.lng,
            altitude: droneAlt,
            speed: parseFloat((droneSpeed * 3.6).toFixed(1)), // km/h
            distance: Math.round(droneDist)
        });
    }
}

function stopFlightRecording() {
    isRecording = false;
    clearInterval(recordTimerInterval);
    
    const btn = document.getElementById('btn-record');
    const timer = document.getElementById('record-timer');
    btn.classList.remove('recording');
    timer.style.display = 'none';
    
    if (recordedDataPoints.length < 5) {
        alert("Flight is too short to save! Must record at least 5 seconds.");
        return;
    }
    
    // Calculate final stats
    const duration = Math.floor((Date.now() - recordStartTime) / 1000);
    let maxAlt = 0;
    let maxSpeed = 0;
    let maxDist = 0;
    
    recordedDataPoints.forEach(p => {
        if (p.altitude > maxAlt) maxAlt = p.altitude;
        if (p.speed > maxSpeed) maxSpeed = p.speed;
        if (p.distance > maxDist) maxDist = p.distance;
    });
    
    // Ask user for quick notes or location
    const notes = prompt("Enter a description or flight notes for this record:", "Simulator Flight near Lake Bratan");
    
    const newLog = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        pilot: isConnected ? "DJI Remote Pilot" : "Virtual Keyboard Pilot",
        location: "Lake Bratan, Bali",
        duration: duration,
        maxAltitude: parseFloat(maxAlt.toFixed(1)),
        maxSpeed: parseFloat(maxSpeed.toFixed(1)),
        totalDistance: Math.round(maxDist),
        notes: notes || "No additional logs.",
        telemetry: recordedDataPoints
    };
    
    logs.push(newLog);
    saveLogsToStorage();
    renderLogTable();
    updateAnalytics();
    
    alert("Flight log saved successfully to local logbook!");
}

// ==========================================
// FLIGHT DATABASE & LOCALSTORAGE
// ==========================================
function loadLogsFromStorage() {
    const raw = localStorage.getItem('dji_flight_logs');
    if (raw) {
        try {
            logs = JSON.parse(raw);
        } catch (e) {
            logs = [];
        }
    }
}

function saveLogsToStorage() {
    localStorage.setItem('dji_flight_logs', JSON.stringify(logs));
}

function renderLogTable() {
    const tbody = document.querySelector('#logbook-table tbody');
    tbody.innerHTML = '';
    
    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">No flights logged yet. Add manual entries, import CSV, or record simulator flights!</td></tr>`;
        return;
    }
    
    // Sort log records by date descending
    logs.sort((a,b) => new Date(b.date) - new Date(a.date));
    
    logs.forEach(log => {
        const tr = document.createElement('tr');
        if (log.id === activeLogId) tr.className = 'selected';
        
        tr.onclick = () => selectFlightLog(log.id);
        
        const dateStr = new Date(log.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const durStr = `${Math.floor(log.duration / 60)}m ${log.duration % 60}s`;
        
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><strong>${log.pilot}</strong></td>
            <td>${log.location}</td>
            <td>${durStr}</td>
            <td>${log.maxAltitude}m</td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); selectFlightLog('${log.id}'); switchTab('logbook')">Inspect</button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

function selectFlightLog(logId) {
    activeLogId = logId;
    
    // Re-render table to update selections
    renderLogTable();
    
    const log = logs.find(l => l.id === logId);
    if (!log) return;
    
    // Hide placeholder, show details
    document.getElementById('detail-placeholder').style.display = 'none';
    document.getElementById('log-details').style.display = 'flex';
    
    // Fill stats
    const dateStr = new Date(log.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('detail-date').innerText = `Flight Log: ${dateStr}`;
    document.getElementById('detail-pilot').innerText = log.pilot;
    document.getElementById('detail-location').innerText = log.location;
    document.getElementById('detail-duration').innerText = `${Math.floor(log.duration / 60)}m ${log.duration % 60}s`;
    document.getElementById('detail-max-alt').innerText = `${log.maxAltitude} m`;
    document.getElementById('detail-max-speed').innerText = `${log.maxSpeed} km/h`;
    document.getElementById('detail-total-dist').innerText = `${log.totalDistance} m`;
    document.getElementById('detail-notes-text').innerText = log.notes;
    
    // Render telemetry line chart
    renderTelemetryChart(log);
}

function deleteActiveLog() {
    if (!activeLogId) return;
    if (confirm("Are you sure you want to delete this flight record?")) {
        logs = logs.filter(l => l.id !== activeLogId);
        saveLogsToStorage();
        activeLogId = null;
        
        // UI resets
        document.getElementById('detail-placeholder').style.display = 'flex';
        document.getElementById('log-details').style.display = 'none';
        
        renderLogTable();
        updateAnalytics();
    }
}

// ==========================================
// MANUAL LOGBOOK ENTRY MODAL
// ==========================================
function showManualLogForm() {
    const modal = document.getElementById('manual-log-modal');
    modal.style.display = 'flex';
    
    // Default today's date
    const local = new Date();
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    document.getElementById('m-date').value = local.toISOString().slice(0, 16);
}

function closeManualLogForm() {
    document.getElementById('manual-log-modal').style.display = 'none';
    document.getElementById('manual-log-form').reset();
}

function saveManualLog(e) {
    e.preventDefault();
    
    const dateVal = document.getElementById('m-date').value;
    const pilotVal = document.getElementById('m-pilot').value;
    const locVal = document.getElementById('m-location').value;
    const durVal = parseInt(document.getElementById('m-duration').value);
    const altVal = parseFloat(document.getElementById('m-max-alt').value);
    const speedVal = parseFloat(document.getElementById('m-max-speed').value);
    const distVal = parseInt(document.getElementById('m-distance').value);
    const notesVal = document.getElementById('m-notes').value;
    
    const newLog = {
        id: Date.now().toString(),
        date: new Date(dateVal).toISOString(),
        pilot: pilotVal,
        location: locVal,
        duration: durVal,
        maxAltitude: altVal,
        maxSpeed: speedVal,
        totalDistance: distVal,
        notes: notesVal || "Manual log entry.",
        telemetry: [] // Manual entry has no sub-telemetry point arrays
    };
    
    logs.push(newLog);
    saveLogsToStorage();
    renderLogTable();
    updateAnalytics();
    closeManualLogForm();
}

// ==========================================
// CSV AIRDATA & PHANTOMHELP IMPORTER
// ==========================================
function importCSVFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const text = e.target.result;
        parseAndSaveCSVLog(text, file.name);
    };
    reader.readAsText(file);
}

function parseAndSaveCSVLog(text, filename) {
    const lines = text.split('\n');
    if (lines.length < 2) {
        alert("Invalid CSV: File contains no data lines.");
        return;
    }
    
    // Extract headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    // Locate indexes
    const latIdx = headers.findIndex(h => h.toLowerCase().includes('latitude') || h.toLowerCase() === 'lat');
    const lngIdx = headers.findIndex(h => h.toLowerCase().includes('longitude') || h.toLowerCase() === 'lon' || h.toLowerCase() === 'lng');
    const altIdx = headers.findIndex(h => h.toLowerCase().includes('altitude') || h.toLowerCase().includes('height') || h.toLowerCase() === 'alt');
    const speedIdx = headers.findIndex(h => h.toLowerCase().includes('speed') || h.toLowerCase().includes('velocity'));
    const timeIdx = headers.findIndex(h => h.toLowerCase().includes('time') || h.toLowerCase().includes('date') || h.toLowerCase() === 'timestamp');
    const distIdx = headers.findIndex(h => h.toLowerCase().includes('distance') || h.toLowerCase() === 'dist');
    
    if (latIdx === -1 || lngIdx === -1) {
        alert("Parsing Error: CSV must contain 'latitude' and 'longitude' fields.");
        return;
    }
    
    const telemetry = [];
    let maxAlt = 0;
    let maxSpeed = 0;
    let maxDist = 0;
    let startTime = null;
    let endTime = null;
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Parse CSV line considering possible double quotes
        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/"/g, ''));
        if (cols.length < headers.length) continue;
        
        const lat = parseFloat(cols[latIdx]);
        const lng = parseFloat(cols[lngIdx]);
        if (isNaN(lat) || isNaN(lng)) continue;
        
        const alt = altIdx !== -1 ? parseFloat(cols[altIdx]) || 0 : 0;
        const speed = speedIdx !== -1 ? parseFloat(cols[speedIdx]) || 0 : 0;
        const distance = distIdx !== -1 ? parseFloat(cols[distIdx]) || 0 : 0;
        const timestampStr = timeIdx !== -1 ? cols[timeIdx] : null;
        
        if (alt > maxAlt) maxAlt = alt;
        if (speed > maxSpeed) maxSpeed = speed;
        if (distance > maxDist) maxDist = distance;
        
        if (!startTime && timestampStr) startTime = timestampStr;
        if (timestampStr) endTime = timestampStr;
        
        telemetry.push({
            time: telemetry.length, // Incremental seconds representation
            lat: lat,
            lng: lng,
            altitude: alt,
            speed: speed,
            distance: distance
        });
    }
    
    // Fallback timings
    const duration = telemetry.length; // seconds approximation
    const dateOfFlight = startTime ? new Date(startTime).toISOString() : new Date().toISOString();
    
    const newLog = {
        id: Date.now().toString(),
        date: dateOfFlight,
        pilot: "DJI Mavic Mini Pilot",
        location: "Parsed Log Location",
        duration: duration,
        maxAltitude: parseFloat(maxAlt.toFixed(1)),
        maxSpeed: parseFloat(maxSpeed.toFixed(1)),
        totalDistance: Math.round(maxDist),
        notes: `Imported flight data from: ${filename}. Contains ${telemetry.length} data frames.`,
        telemetry: telemetry
    };
    
    logs.push(newLog);
    saveLogsToStorage();
    renderLogTable();
    updateAnalytics();
    
    alert(`Successfully imported flight log with ${telemetry.length} GPS points!`);
}

// ==========================================
// GRAPHICAL CHARTS ENGINE (CHART.JS)
// ==========================================
function renderTelemetryChart(log) {
    if (telemetryChartInstance) {
        telemetryChartInstance.destroy();
    }
    
    const ctx = document.getElementById('telemetryChart').getContext('2d');
    
    // Prepare telemetry arrays
    let labels = [];
    let altData = [];
    let speedData = [];
    
    if (log.telemetry && log.telemetry.length > 0) {
        // Filter elements if array is too dense to avoid chart lag (max 100 points)
        const filterStep = Math.max(1, Math.floor(log.telemetry.length / 80));
        
        log.telemetry.forEach((pt, idx) => {
            if (idx % filterStep === 0) {
                labels.push(`${pt.time}s`);
                altData.push(pt.altitude);
                speedData.push(pt.speed);
            }
        });
    } else {
        // Mock data charts if no internal points exist (e.g. manual entry)
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
            const timeStep = Math.floor((log.duration / steps) * i);
            labels.push(`${timeStep}s`);
            // Generate a simple curve peaking at center
            const factor = Math.sin((Math.PI / steps) * i);
            altData.push((log.maxAltitude * factor).toFixed(1));
            speedData.push((log.maxSpeed * factor).toFixed(1));
        }
    }
    
    telemetryChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Altitude (m)',
                    data: altData,
                    borderColor: 'rgb(2, 119, 175)',
                    backgroundColor: 'rgba(2, 119, 175, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y'
                },
                {
                    label: 'Speed (km/h)',
                    data: speedData,
                    borderColor: 'rgb(139, 92, 246)',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: 'hsl(215, 20%, 35%)', font: { family: 'Mulish' } }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(15, 23, 42, 0.06)' },
                    ticks: { color: 'hsl(215, 20%, 35%)' }
                },
                y: {
                    position: 'left',
                    title: { display: true, text: 'Altitude (m)', color: 'rgb(2, 119, 175)' },
                    grid: { color: 'rgba(15, 23, 42, 0.06)' },
                    ticks: { color: 'hsl(215, 20%, 35%)' }
                },
                y1: {
                    position: 'right',
                    title: { display: true, text: 'Speed (km/h)', color: 'rgb(139, 92, 246)' },
                    grid: { drawOnChartArea: false }, // Avoid duplicate scales grid lines
                    ticks: { color: 'hsl(215, 20%, 35%)' }
                }
            }
        }
    });
}

// ==========================================
// ANALYTICS & SUMMARY COMPILING
// ==========================================
function updateAnalytics() {
    if (logs.length === 0) return;
    
    let totalSecs = 0;
    let maxAlt = 0;
    let totalDist = 0;
    
    logs.forEach(log => {
        totalSecs += log.duration;
        if (log.maxAltitude > maxAlt) maxAlt = log.maxAltitude;
        totalDist += log.totalDistance;
    });
    
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    
    document.getElementById('stat-total-flights').innerText = logs.length;
    document.getElementById('stat-total-time').innerText = `${hrs}h ${mins}m`;
    document.getElementById('stat-max-alt').innerText = `${maxAlt.toFixed(1)}m`;
    document.getElementById('stat-total-dist').innerText = `${(totalDist / 1000).toFixed(2)} km`;
}

function renderAnalyticsCharts() {
    if (logs.length === 0) return;
    
    // Destroy existing instances if any
    if (durationChartInstance) durationChartInstance.destroy();
    if (peaksChartInstance) peaksChartInstance.destroy();
    
    const durCtx = document.getElementById('chart-analytics-durations').getContext('2d');
    const peakCtx = document.getElementById('chart-analytics-peaks').getContext('2d');
    
    // Shortest date sorting for analytical timelines
    const sortedLogs = [...logs].sort((a,b) => new Date(a.date) - new Date(b.date));
    
    const labels = sortedLogs.map(l => new Date(l.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const durations = sortedLogs.map(l => Math.round(l.duration / 60)); // Minutes
    
    const altitudes = sortedLogs.map(l => l.maxAltitude);
    const speeds = sortedLogs.map(l => l.maxSpeed);
    
    // 1. Flight Durations Chart
    durationChartInstance = new Chart(durCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Airtime (Minutes)',
                data: durations,
                backgroundColor: 'rgba(2, 119, 175, 0.4)',
                borderColor: 'rgb(2, 119, 175)',
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { color: 'rgba(15, 23, 42, 0.06)' }, ticks: { color: 'hsl(215, 20%, 35%)' } },
                y: { grid: { color: 'rgba(15, 23, 42, 0.06)' }, ticks: { color: 'hsl(215, 20%, 35%)' } }
            }
        }
    });
    
    // 2. Peaks Comparison Chart
    peaksChartInstance = new Chart(peakCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Max Altitude (m)',
                    data: altitudes,
                    borderColor: 'rgb(2, 119, 175)',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.1
                },
                {
                    label: 'Max Speed (km/h)',
                    data: speeds,
                    borderColor: 'rgb(139, 92, 246)',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: 'hsl(215, 20%, 35%)' } }
            },
            scales: {
                x: { grid: { color: 'rgba(15, 23, 42, 0.06)' }, ticks: { color: 'hsl(215, 20%, 35%)' } },
                y: { grid: { color: 'rgba(15, 23, 42, 0.06)' }, ticks: { color: 'hsl(215, 20%, 35%)' } }
            }
        }
    });
}

// ==========================================
// PRELOAD MOCK DEMO FLIGHT LOGS
// ==========================================
function loadDemoData() {
    generateDemoFlightLogs();
    alert("Loaded 2 premium flight logs with realistic telemetry paths into your logbook!");
}

function generateDemoFlightLogs() {
    const demoLogs = [
        {
            id: "demo-1",
            date: new Date(Date.now() - 24 * 3600 * 1000).toISOString(), // Yesterday
            pilot: "Antigravity DJI Pilot",
            location: "Lake Bratan, Bedugul, Bali",
            duration: 480, // 8 minutes
            maxAltitude: 120.4,
            maxSpeed: 36.2, // km/h
            totalDistance: 1840,
            notes: "Scenic afternoon flight surveying the temple on Lake Bratan. Perfect weather, light winds, calibration was smooth.",
            telemetry: generateMockTelemetry(480, 120, 36, 1800, homePoint)
        },
        {
            id: "demo-2",
            date: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), // 3 days ago
            pilot: "Antigravity DJI Pilot",
            location: "Mount Batur, Kintamani, Bali",
            duration: 620, // 10 minutes approx
            maxAltitude: 250.0,
            maxSpeed: 46.8, // km/h
            totalDistance: 2900,
            notes: "High-altitude flight near Kintamani caldera. Slightly windy, sport mode engaged to counter headwinds. Signal connection dropped briefly but RTH was functional.",
            telemetry: generateMockTelemetry(620, 250, 46, 2800, { lat: -8.2439, lng: 115.3789 }) // Mount Batur coordinates
        }
    ];
    
    logs = demoLogs;
    saveLogsToStorage();
    renderLogTable();
    updateAnalytics();
    
    // Select first log by default
    selectFlightLog("demo-1");
}

function generateMockTelemetry(duration, maxAlt, maxSp, maxDi, startGPS) {
    const arr = [];
    const earthRadius = 6378137.0;
    
    for (let i = 0; i <= duration; i += 5) {
        // Sinusoidal curves for mock visual correctness
        const progressFactor = i / duration;
        const curveFactor = Math.sin(progressFactor * Math.PI);
        
        const alt = maxAlt * curveFactor * (0.9 + Math.random() * 0.1);
        const speed = maxSp * curveFactor * (0.8 + Math.random() * 0.2);
        const dist = maxDi * curveFactor;
        
        // Let's create an orbital flight path loop around startGPS
        const radiusMeters = 300 * curveFactor; // Orbit range up to 300m
        const angle = progressFactor * Math.PI * 2; // Full orbit circle
        
        const dy = radiusMeters * Math.cos(angle);
        const dx = radiusMeters * Math.sin(angle);
        
        const dLat = dy / earthRadius;
        const dLng = dx / (earthRadius * Math.cos((startGPS.lat * Math.PI) / 180.0));
        
        arr.push({
            time: i,
            lat: startGPS.lat + dLat * (180.0 / Math.PI),
            lng: startGPS.lng + dLng * (180.0 / Math.PI),
            altitude: parseFloat(alt.toFixed(1)),
            speed: parseFloat(speed.toFixed(1)),
            distance: Math.round(dist)
        });
    }
    return arr;
}

// ==========================================
// CONTROLLER INPUTS VISUALIZER & LIVE GRAPH
// ==========================================
let lastActionText = ""; // Avoid spamming same event in console
function logAction(text, type = "action") {
    const logBox = document.getElementById('console-event-log');
    if (!logBox) return;
    
    // Prevent consecutive identical message spamming
    if (text === lastActionText) return;
    lastActionText = text;
    
    const timeStr = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.innerText = `[${timeStr}] ${text}`;
    logBox.appendChild(line);
    
    // Keep max 100 logs
    while (logBox.children.length > 100) {
        logBox.removeChild(logBox.firstChild);
    }
    
    // Scroll to bottom
    logBox.scrollTop = logBox.scrollHeight;
}

function clearConsoleLog() {
    const logBox = document.getElementById('console-event-log');
    if (logBox) {
        logBox.innerHTML = '<div class="console-line system">[SYSTEM] Log cleared.</div>';
    }
    lastActionText = "";
}

function initRealtimeChart() {
    const ctx = document.getElementById('vis-realtime-chart');
    if (!ctx) return;
    
    const labels = Array(40).fill('');
    const zeroData = Array(40).fill(0);
    
    visRealtimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Throttle',
                    borderColor: '#15803d',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    data: [...zeroData],
                    tension: 0.1
                },
                {
                    label: 'Yaw',
                    borderColor: '#ea580c',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    data: [...zeroData],
                    tension: 0.1
                },
                {
                    label: 'Pitch',
                    borderColor: '#0277af',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    data: [...zeroData],
                    tension: 0.1
                },
                {
                    label: 'Roll',
                    borderColor: '#8b5cf6',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    data: [...zeroData],
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: 'rgba(15, 23, 42, 0.6)',
                        boxWidth: 8,
                        boxHeight: 8,
                        font: { size: 9, family: 'Mulish' }
                    }
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    min: -1.1,
                    max: 1.1,
                    grid: {
                        color: 'rgba(15, 23, 42, 0.06)'
                    },
                    ticks: {
                        color: 'rgba(15, 23, 42, 0.4)',
                        font: { size: 8 }
                    }
                }
            }
        }
    });
}

function updateControllerVisualizerHUD() {
    // 1. Stick dots translations
    const leftDot = document.getElementById('vis-left-stick-dot');
    if (leftDot) {
        leftDot.style.left = (50 + inputs.yaw * 40) + '%';
        leftDot.style.top = (50 - inputs.throttle * 40) + '%';
    }
    
    const rightDot = document.getElementById('vis-right-stick-dot');
    if (rightDot) {
        rightDot.style.left = (50 + inputs.roll * 40) + '%';
        rightDot.style.top = (50 - inputs.pitch * 40) + '%';
    }
    
    // 2. Readouts values
    const valThrottle = document.getElementById('vis-val-throttle');
    if (valThrottle) valThrottle.innerText = Math.round(inputs.throttle * 100) + '%';
    
    const valYaw = document.getElementById('vis-val-yaw');
    if (valYaw) valYaw.innerText = Math.round(inputs.yaw * 100) + '%';
    
    const valPitch = document.getElementById('vis-val-pitch');
    if (valPitch) valPitch.innerText = Math.round(inputs.pitch * 100) + '%';
    
    const valRoll = document.getElementById('vis-val-roll');
    if (valRoll) valRoll.innerText = Math.round(inputs.roll * 100) + '%';
    
    // 3. Stick Action Text and mapping highlights
    const cmdLeft = document.getElementById('vis-cmd-left');
    const actThrottle = document.getElementById('act-throttle');
    const rowThrottle = document.getElementById('row-throttle');
    const actYaw = document.getElementById('act-yaw');
    const rowYaw = document.getElementById('row-yaw');
    
    // Throttle commands
    let throttleText = "Altitude Hold";
    let cmdLeftText = "Hovering (Stable Alt)";
    if (inputs.throttle > 0.15) {
        throttleText = `Climbing (${Math.round(inputs.throttle * 100)}% power)`;
        cmdLeftText = "CLIMBING (+altitude)";
        rowThrottle?.classList.add('active');
        logAction(`Throttle up command -> Action: Climb altitude`, "action");
    } else if (inputs.throttle < -0.15) {
        throttleText = `Descending (${Math.round(-inputs.throttle * 100)}% power)`;
        cmdLeftText = "DESCENDING (-altitude)";
        rowThrottle?.classList.add('active');
        logAction(`Throttle down command -> Action: Descend altitude`, "action");
    } else {
        rowThrottle?.classList.remove('active');
    }
    if (actThrottle) actThrottle.innerText = throttleText;
    
    // Yaw commands
    let yawText = "Heading Lock";
    if (inputs.yaw > 0.15) {
        yawText = `Yawing Right (${Math.round(inputs.yaw * 100)}% rate)`;
        cmdLeftText = "ROTATING RIGHT (Clockwise)";
        rowYaw?.classList.add('active');
        logAction(`Yaw right command -> Action: Rotate drone clockwise`, "action");
    } else if (inputs.yaw < -0.15) {
        yawText = `Yawing Left (${Math.round(-inputs.yaw * 100)}% rate)`;
        cmdLeftText = "ROTATING LEFT (Counter-Clockwise)";
        rowYaw?.classList.add('active');
        logAction(`Yaw left command -> Action: Rotate drone counter-clockwise`, "action");
    } else {
        rowYaw?.classList.remove('active');
    }
    if (actYaw) actYaw.innerText = yawText;
    if (cmdLeft) cmdLeft.innerText = cmdLeftText;
    
    // Right stick commands (Pitch / Roll)
    const cmdRight = document.getElementById('vis-cmd-right');
    const actPitch = document.getElementById('act-pitch');
    const rowPitch = document.getElementById('row-pitch');
    const actRoll = document.getElementById('act-roll');
    const rowRoll = document.getElementById('row-roll');
    
    // Pitch commands
    let pitchText = "Pitch Neutral";
    let cmdRightText = "Hovering (Zero Horizontal Speed)";
    if (inputs.pitch > 0.15) {
        pitchText = `Pitch Forward (${Math.round(inputs.pitch * 100)}% tilt)`;
        cmdRightText = "PITCH FORWARD (Moving Forward)";
        rowPitch?.classList.add('active');
        logAction(`Pitch forward command -> Action: Move forward`, "action");
    } else if (inputs.pitch < -0.15) {
        pitchText = `Pitch Backward (${Math.round(-inputs.pitch * 100)}% tilt)`;
        cmdRightText = "PITCH BACKWARD (Moving Backward)";
        rowPitch?.classList.add('active');
        logAction(`Pitch backward command -> Action: Move backward`, "action");
    } else {
        rowPitch?.classList.remove('active');
    }
    if (actPitch) actPitch.innerText = pitchText;
    
    // Roll commands
    let rollText = "Roll Neutral";
    if (inputs.roll > 0.15) {
        rollText = `Roll Right (${Math.round(inputs.roll * 100)}% tilt)`;
        cmdRightText = "ROLL RIGHT (Strafing Right)";
        rowRoll?.classList.add('active');
        logAction(`Roll right command -> Action: Strafe right lateral`, "action");
    } else if (inputs.roll < -0.15) {
        rollText = `Roll Left (${Math.round(-inputs.roll * 100)}% tilt)`;
        cmdRightText = "ROLL LEFT (Strafing Left)";
        rowRoll?.classList.add('active');
        logAction(`Roll left command -> Action: Strafe left lateral`, "action");
    } else {
        rowRoll?.classList.remove('active');
    }
    if (actRoll) actRoll.innerText = rollText;
    if (cmdRight) cmdRight.innerText = cmdRightText;
    
    // Gimbal Camera commands
    const actCamera = document.getElementById('act-camera');
    const rowCamera = document.getElementById('row-camera');
    if (cameraPitch < -2 || cameraPitch > 2) {
        if (cameraPitch < 0) {
            if (actCamera) actCamera.innerText = `Tilting Gimbal Down ${cameraPitch}°`;
        } else {
            if (actCamera) actCamera.innerText = `Tilting Gimbal Up +${cameraPitch}°`;
        }
        rowCamera?.classList.add('active');
        logAction(`Gimbal tilt dial changed -> Action: Pitch camera to ${cameraPitch}°`, "action");
    } else {
        if (actCamera) actCamera.innerText = "Gimbal Level (0°)";
        rowCamera?.classList.remove('active');
    }
    
    // Autopilot RTH state
    const actRth = document.getElementById('act-rth');
    const rowRth = document.getElementById('row-rth');
    if (rthActive) {
        if (actRth) actRth.innerText = "RTH AUTOPILOT ACTIVE";
        rowRth?.classList.add('active-warn');
        logAction(`Return to Home active -> Action: Autonomous drone navigation initiated`, "warning");
    } else {
        if (actRth) actRth.innerText = "Manual Control Mode";
        rowRth?.classList.remove('active-warn');
    }

    // Update new button rows in Mapping grid
    const btnC1 = document.getElementById('vis-btn-c1');
    const rowBtnC1 = document.getElementById('row-btn-c1');
    if (btnC1) {
        if (inputs.btn_fn === 1) {
            btnC1.innerText = "PRESSED";
            rowBtnC1?.classList.add('active');
        } else {
            btnC1.innerText = "RELEASED";
            rowBtnC1?.classList.remove('active');
        }
    }

    const btnShutter = document.getElementById('vis-btn-shutter');
    const rowBtnShutter = document.getElementById('row-btn-shutter');
    if (btnShutter) {
        if (inputs.btn_photo === 1) {
            btnShutter.innerText = "PRESSED";
            rowBtnShutter?.classList.add('active');
        } else {
            btnShutter.innerText = "RELEASED";
            rowBtnShutter?.classList.remove('active');
        }
    }

    const btnSport = document.getElementById('vis-btn-sport');
    const rowBtnSport = document.getElementById('row-btn-sport');
    if (btnSport) {
        if (inputs.btn_pause === 1) {
            btnSport.innerText = "SPORT MODE (ON)";
            rowBtnSport?.classList.add('active-warn');
        } else {
            btnSport.innerText = "Normal Mode (OFF)";
            rowBtnSport?.classList.remove('active-warn');
        }
    }

    // Update RC Battery UI
    const visRcBat = document.getElementById('vis-rc-bat');
    const rowVisRcBat = document.getElementById('row-vis-rc-bat');
    if (visRcBat) {
        const percent = inputs.rc_battery !== undefined ? inputs.rc_battery : 100;
        const charging = inputs.rc_charging === 1;
        
        let batText = `${percent}%`;
        if (charging) {
            batText += " ⚡ (Charging)";
            rowVisRcBat?.classList.add('active');
            rowVisRcBat?.classList.remove('active-warn');
        } else {
            batText += " (Discharging)";
            if (percent <= 20) {
                rowVisRcBat?.classList.add('active-warn');
                rowVisRcBat?.classList.remove('active');
            } else {
                rowVisRcBat?.classList.remove('active');
                rowVisRcBat?.classList.remove('active-warn');
            }
        }
        visRcBat.innerText = batText;
    }
    
    // 4. Update live graph datasets
    if (visRealtimeChart) {
        const data0 = visRealtimeChart.data.datasets[0].data;
        const data1 = visRealtimeChart.data.datasets[1].data;
        const data2 = visRealtimeChart.data.datasets[2].data;
        const data3 = visRealtimeChart.data.datasets[3].data;
        
        data0.push(inputs.throttle);
        data1.push(inputs.yaw);
        data2.push(inputs.pitch);
        data3.push(inputs.roll);
        
        if (data0.length > 40) {
            data0.shift();
            data1.shift();
            data2.shift();
            data3.shift();
        }
        
        visRealtimeChart.update('none'); // Update without transition animation
    }
}
