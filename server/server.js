const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const clients = new Map();
const worldModifications = {}; // Stores block changes so new players sync up

wss.on('connection', (ws) => {
    const playerId = Date.now();
    clients.set(ws, { id: playerId });

    // Send existing world changes to the newly connected player
    ws.send(JSON.stringify({ type: 'init', blocks: worldModifications }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'move') {
            // Broadcast player position/rotation to everyone else
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
    });
});

function broadcast(sender, data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client !== sender) {
            client.send(JSON.stringify(data));
        }
    });
}

console.log("Multiplayer WebSocket server running on ws://localhost:8080");