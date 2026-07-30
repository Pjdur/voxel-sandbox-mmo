const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const wss = new WebSocket.Server({ port: 8080 });
const clients = new Map();

// The path where the world data will be saved
const WORLD_FILE = path.join(__dirname, 'world.json');

let worldModifications = {}; 
let worldHasChanged = false; // Tracks if we need to save

// 1. Load the existing world on server start
if (fs.existsSync(WORLD_FILE)) {
    try {
        const data = fs.readFileSync(WORLD_FILE, 'utf8');
        worldModifications = JSON.parse(data);
        console.log(`Loaded ${Object.keys(worldModifications).length} block modifications from world.json`);
    } catch (err) {
        console.error("Error reading world.json:", err);
    }
} else {
    console.log("No existing world.json found. Starting a fresh world.");
}

// 2. Setup an Auto-Save Loop (Runs every 5 seconds)
setInterval(() => {
    if (worldHasChanged) {
        fs.writeFile(WORLD_FILE, JSON.stringify(worldModifications), (err) => {
            if (err) {
                console.error("Failed to save world:", err);
            }
        });
        worldHasChanged = false;
    }
}, 5000); 

wss.on('connection', (ws) => {
    const playerId = Date.now();
    clients.set(ws, { id: playerId });

    // Send existing world to the new player
    ws.send(JSON.stringify({ type: 'init', blocks: worldModifications }));

    // Broadcast updated player count to EVERYONE (including the new player)
    broadcastPlayerCount();

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'move') {
            broadcast(ws, {
                type: 'move',
                id: playerId,
                x: data.x,
                y: data.y,
                z: data.z,
                quaternion: data.quaternion
            });
        } else if (data.type === 'blockUpdate') {
            // Save modification and broadcast to everyone
            worldModifications[`${data.x},${data.y},${data.z}`] = data.blockType;
            worldHasChanged = true;

            broadcast(ws, {
                type: 'blockUpdate',
                x: data.x,
                y: data.y,
                z: data.z,
                blockType: data.blockType
            });
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        broadcast(null, { type: 'disconnect', id: playerId });
        
        // Broadcast updated player count when someone leaves
        broadcastPlayerCount(); 
    });
});

// Sends the total client count to everyone
function broadcastPlayerCount() {
    const count = wss.clients.size;
    broadcast(null, { type: 'playerCount', count: count });
}

function broadcast(sender, data) {
    wss.clients.forEach((client) => {
        // If sender is null, it sends to EVERYONE. If sender is defined, it skips the sender.
        if (client.readyState === WebSocket.OPEN && client !== sender) {
            client.send(JSON.stringify(data));
        }
    });
}

function broadcast(sender, data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client !== sender) {
            client.send(JSON.stringify(data));
        }
    });
}

// Save immediately if the server is shut down via console (Ctrl+C)
process.on('SIGINT', () => {
    if (worldHasChanged) {
        console.log("\nSaving world before shutdown...");
        fs.writeFileSync(WORLD_FILE, JSON.stringify(worldModifications));
    }
    process.exit();
});

console.log("Multiplayer WebSocket server running on ws://localhost:8080");