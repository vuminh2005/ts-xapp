const NUM_VOICE_UE = 10;  // Số lượng Voice UE
const NUM_MBB_UE = 10;    // Số lượng MBB UE
const NUM_GNB = 5;
const AREA_SIZE = 600;
const VOICE_RADIUS = 75;    // Bán kính 75px cho Voice UE
const MBB_RADIUS = 150;     // Bán kính 150px cho MBB UE
const MB_PER_STEP = 2;      // Mỗi step truyền 2MB

// Dung lượng gNB (MB)
const CENTER_CAPACITY = 70;    // gNB trung tâm
const CORNER_CAPACITY = 30;    // gNB ở góc

const ues = [];
const gnbs = [];
const connections = {};
const waitingQueue = {};
let simulationInterval;
let stepCount = 0;
let currentPolicy = "0"; // Mặc định là DEFAULT (0)

// Định nghĩa các chính sách
const POLICIES = {
    "0": { // DEFAULT
        id: "0",
        label: "DEFAULT",
        description: "All UEs connect to nearest available gNB"
    },
    "1": { // OFFLOAD
        id: "1",
        label: "OFFLOAD",
        description: "Voice UEs prefer corners, MBB UEs prefer center"
    }
};

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function initEnv() {
    // Clear previous data
    ues.length = 0;
    gnbs.length = 0;
    for (let key in connections) delete connections[key];
    for (let key in waitingQueue) delete waitingQueue[key];
    stepCount = 0;
    updateStatusDisplay();

    // Initialize gNBs (positions remain the same)
    gnbs.push({ id: 0, x: AREA_SIZE / 2, y: AREA_SIZE / 2, load: 0, capacity: CENTER_CAPACITY, isCenter: true });
    gnbs.push({ id: 1, x: 75, y: 75, load: 0, capacity: CORNER_CAPACITY, isCenter: false });
    gnbs.push({ id: 2, x: AREA_SIZE - 75, y: 75, load: 0, capacity: CORNER_CAPACITY, isCenter: false });
    gnbs.push({ id: 3, x: 75, y: AREA_SIZE - 75, load: 0, capacity: CORNER_CAPACITY, isCenter: false });
    gnbs.push({ id: 4, x: AREA_SIZE - 75, y: AREA_SIZE - 75, load: 0, capacity: CORNER_CAPACITY, isCenter: false });

    // Fixed positions for Voice UEs (10 UEs)
    const voicePositions = [
        // Near gNB1 (2 UEs)
        {x: 125, y: 100},           // x +25
        {x: 100, y: 25},             // y +25

        // Near gNB2 (2 UEs)
        {x: AREA_SIZE - 75, y: 100},    // x -25
        {x: AREA_SIZE - 50, y: 75},     // y +25

        // Near gNB3 (2 UEs)
        {x: 125, y: AREA_SIZE - 100},    // x +25
        {x: 50, y: AREA_SIZE - 125},     // y -25

        // Near gNB4 (2 UEs)
        {x: AREA_SIZE - 100, y: AREA_SIZE - 25},  // y -25
        {x: AREA_SIZE - 25, y: AREA_SIZE - 100},  // x -25

        // Just outside corner radii (2 UEs)
        {x: 225, y: 200},             // x +25
        {x: AREA_SIZE - 200, y: AREA_SIZE - 200}  // y -25
    ];

    // Gán dung lượng cố định cho từng Voice UE (đơn vị: MB)
    const voicePackets = [4, 6, 5, 3, 7, 5, 8, 4, 6, 5];

    // Generate Voice UEs with fixed positions
    for (let i = 0; i < NUM_VOICE_UE; i++) {
        ues.push({
            id: `V${i}`,
            x: voicePositions[i].x,
            y: voicePositions[i].y,
            type: "VOICE",
            packet: voicePackets[i],
            transmitted: false
        });
    }

    // Fixed positions for MBB UEs (10 UEs)
    const mbbPositions = [
        // Very close to center (4 UEs)
        {x: AREA_SIZE / 2,     y: AREA_SIZE / 2 - 50},   // y -25
        {x: AREA_SIZE / 2 + 75, y: AREA_SIZE / 2 - 100},       // x +25
        {x: AREA_SIZE / 2,     y: AREA_SIZE / 2 + 125},   // y +25
        {x: AREA_SIZE / 2 - 50, y: AREA_SIZE / 2 + 25},       // x -25

        // Within 150px radius (4 UEs)
        {x: AREA_SIZE / 2 + 75, y: AREA_SIZE / 2 - 25},  // x +75, y -25
        {x: AREA_SIZE / 2 + 25, y: AREA_SIZE / 2 + 75},  // y +75
        {x: AREA_SIZE / 2 - 75, y: AREA_SIZE / 2 + 50},  // x -75
        {x: AREA_SIZE / 2 - 25, y: AREA_SIZE / 2 - 75},  // y -75

        // Just outside 150px radius (2 UEs)
        {x: AREA_SIZE / 2 + 210, y: AREA_SIZE / 2 - 50}, // y -25
        {x: AREA_SIZE / 2 + 25,  y: AREA_SIZE / 2 + 210} // x +25
    ];

    const mbbPackets = [15, 18, 20, 14, 25, 22, 17, 19, 13, 21];

    // Generate MBB UEs with fixed positions
    for (let i = 0; i < NUM_MBB_UE; i++) {
        ues.push({
            id: `M${i}`,
            x: mbbPositions[i].x,
            y: mbbPositions[i].y,
            type: "MBB",
            packet: mbbPackets[i],
            transmitted: false
        });
    }
}

function selectGnbForUE(ue) {
    if (currentPolicy === "0") { // DEFAULT policy
        const availableGnbs = gnbs
            .map(gnb => ({ ...gnb, dist: Math.hypot(ue.x - gnb.x, ue.y - gnb.y) }))
            .filter(gnb => gnb.dist <= 1000)
            .sort((a, b) => {
                const aAvailable = a.capacity - a.load;
                const bAvailable = b.capacity - b.load;
                
                if (aAvailable > 0 && bAvailable > 0) return a.dist - b.dist;
                if (aAvailable > 0) return -1;
                if (bAvailable > 0) return 1;
                return (b.capacity - b.load) - (a.capacity - a.load);
            });

        return availableGnbs.length > 0 ? availableGnbs[0].id : null;
    } 
    else { // OFFLOAD policy
        const centerGnb = gnbs.find(g => g.isCenter);
        const cornerGnbs = gnbs.filter(g => !g.isCenter);
        
        if (ue.type === "VOICE") {
            // Strict behavior: only check nearest corner in radius
            const nearbyCorner = cornerGnbs.find(gnb => 
                Math.hypot(ue.x - gnb.x, ue.y - gnb.y) <= VOICE_RADIUS
            );
            
            if (nearbyCorner) {
                // Only consider this one corner, no fallback
                if ((nearbyCorner.capacity - nearbyCorner.load) >= ue.packet) {
                    return nearbyCorner.id;
                }
                return null; // Will be put in waiting queue for this gNB
            }
            
            // Outside all corner radii - only try center
            if ((centerGnb.capacity - centerGnb.load) >= ue.packet) {
                return centerGnb.id;
            }
            return null; // Will be put in waiting queue for center
        } 
        else { // MBB UE
            // Strict behavior for MBB UEs
            if (Math.hypot(ue.x - centerGnb.x, ue.y - centerGnb.y) <= MBB_RADIUS) {
                // Within center radius - only try center
                if ((centerGnb.capacity - centerGnb.load) >= ue.packet) {
                    return centerGnb.id;
                }
                return null; // Will be put in waiting queue for center
            }
            
            // Outside center radius - find nearest corner with capacity
            const nearestCorner = cornerGnbs
                .map(gnb => ({
                    ...gnb,
                    dist: Math.hypot(ue.x - gnb.x, ue.y - gnb.y)
                }))
                .sort((a, b) => a.dist - b.dist)[0];
            
            if (nearestCorner && (nearestCorner.capacity - nearestCorner.load) >= ue.packet) {
                return nearestCorner.id;
            }
            return null; // Will be put in waiting queue for nearest corner
        }
    }
    return null;
}

function step() {
    stepCount++;
    
    // Reset and calculate current loads
    gnbs.forEach(gnb => gnb.load = 0);
    for (const ueId in connections) {
        const conn = connections[ueId];
        gnbs[conn.gnbId].load += conn.remaining;
    }

    // Process waiting queue
    for (const gnbId in waitingQueue) {
        const queue = waitingQueue[gnbId];
        for (let i = queue.length - 1; i >= 0; i--) {
            const ue = queue[i];
            const gnb = gnbs[gnbId];
            
            if ((gnb.capacity - gnb.load) >= ue.packet) {
                connections[ue.id] = { 
                    gnbId: parseInt(gnbId), 
                    remaining: ue.packet
                };
                gnb.load += ue.packet;
                queue.splice(i, 1);
            }
        }
    }

    // Assign new connections
    ues.forEach(ue => {
        if (!ue.transmitted && !connections[ue.id] && !isInWaitingQueue(ue.id)) {
            const gnbId = selectGnbForUE(ue);
            if (gnbId !== null) {
                const gnb = gnbs[gnbId];
                if ((gnb.capacity - gnb.load) >= ue.packet) {
                    connections[ue.id] = { 
                        gnbId, 
                        remaining: ue.packet
                    };
                    gnb.load += ue.packet;
                } else {
                    if (!waitingQueue[gnbId]) waitingQueue[gnbId] = [];
                    waitingQueue[gnbId].push(ue);
                }
            }
        }
    });

    // Simulate data transmission
    for (const ueId in connections) {
        const conn = connections[ueId];
        const gnb = gnbs[conn.gnbId];
        
        const prevRemaining = conn.remaining;
        conn.remaining = Math.max(0, conn.remaining - MB_PER_STEP);
        gnb.load -= (prevRemaining - conn.remaining);
        
        if (conn.remaining <= 0) {
            const ue = ues.find(u => u.id === ueId);
            if (ue) ue.transmitted = true;
            delete connections[ueId];
        }
    }

    draw();
    updateStatusDisplay();
}

function isInWaitingQueue(ueId) {
    for (const gnbId in waitingQueue) {
        if (waitingQueue[gnbId].some(ue => ue.id === ueId)) return true;
    }
    return false;
}

function updateStatusDisplay() {
    let statusDiv = document.getElementById('simulationStatus');
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'simulationStatus';
        statusDiv.style.marginLeft = '20px';
        statusDiv.style.marginTop = '12px';
        document.querySelector('canvas').after(statusDiv);
    }

    let waitingCount = 0;
    for (const gnbId in waitingQueue) waitingCount += waitingQueue[gnbId].length;
    
    const activeVoice = ues.filter(u => u.type === "VOICE" && connections[u.id]).length;
    const activeMBB = ues.filter(u => u.type === "MBB" && connections[u.id]).length;
    
    statusDiv.innerHTML = `
        Policy: ${POLICIES[currentPolicy].label} | Step: ${stepCount}<br>
        Active Voice UEs: ${activeVoice} | Active MBB UEs: ${activeMBB}<br>
        Waiting UEs: ${waitingCount}
    `;
}

function draw() {
    const canvas = document.getElementById("networkCanvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, AREA_SIZE, AREA_SIZE);

    // Draw gNBs
    gnbs.forEach(gnb => {
        const loadRatio = gnb.load / gnb.capacity;
        ctx.fillStyle = loadRatio < 0.8 ? "green" : 
                        loadRatio < 1.0 ? "orange" : "red";
        
        ctx.beginPath();
        ctx.arc(gnb.x, gnb.y, 10, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.fillStyle = "black";
        ctx.font = "12px Arial";
        ctx.fillText(`gNB${gnb.id} (${Math.min(100, (loadRatio * 100).toFixed(0))}%)`, 
                    gnb.x - 25, gnb.y - 15);
    });

    // Draw UEs
    ues.forEach(ue => {
        const isConnected = connections[ue.id];
        const isWaiting = isInWaitingQueue(ue.id);
        
        // Different colors for UE types
        if (isConnected) {
            ctx.fillStyle = ue.type === "VOICE" ? "blue" : "purple";
        } else if (isWaiting) {
            ctx.fillStyle = "orange";
        } else if (ue.transmitted) {
            ctx.fillStyle = "gray";
        } else {
            ctx.fillStyle = "orange";
        }
        
        ctx.beginPath();
        ctx.arc(ue.x, ue.y, 7, 0, 2 * Math.PI);
        ctx.fill();
        
        const status = isConnected ? `${connections[ue.id].remaining.toFixed(1)}MB` :
                     isWaiting ? "waiting" :
                     ue.transmitted ? "done" : "waiting";
        
        ctx.fillStyle = "black";
        ctx.font = "10px Arial";
        ctx.fillText(`${ue.id} (${status})`, ue.x - 15, ue.y - 15);

        if (isConnected) {
            const gnb = gnbs[connections[ue.id].gnbId];
            ctx.strokeStyle = ue.type === "VOICE" ? "blue" : "purple";
            ctx.beginPath();
            ctx.moveTo(ue.x, ue.y);
            ctx.lineTo(gnb.x, gnb.y);
            ctx.stroke();
        }
    });

    // Draw policy-specific radii (for visualization)
    if (currentPolicy === "1") { // OFFLOAD
        gnbs.forEach(gnb => {
            if (!gnb.isCenter) {
                ctx.strokeStyle = "blue";
                ctx.beginPath();
                ctx.arc(gnb.x, gnb.y, VOICE_RADIUS, 0, 2 * Math.PI);
                ctx.stroke();
            } else {
                ctx.strokeStyle = "purple";
                ctx.beginPath();
                ctx.arc(gnb.x, gnb.y, MBB_RADIUS, 0, 2 * Math.PI);
                ctx.stroke();
            }
        });
    }
}

function runSimulation() {
    currentPolicy = document.getElementById("policySelect").value;
    if (simulationInterval) clearInterval(simulationInterval);
    simulationInterval = setInterval(step, 1000);
}

function resetSimulation() {
    currentPolicy = document.getElementById("policySelect").value;
    if (simulationInterval) clearInterval(simulationInterval);
    initEnv();
    draw();
}

// Initialize simulation
initEnv();
draw();

// Add event listener for policy change
document.getElementById("policySelect").addEventListener("change", function() {
    currentPolicy = this.value;
    resetSimulation();
});