const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const ROOM_TIMEOUT_WAITING = 5 * 60 * 1000; // 5 min
const ROOM_TIMEOUT_FINISHED = 60 * 1000;     // 1 min

// --- Room Management ---

const rooms = new Map();
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode() {
    let code;
    do {
        code = '';
        for (let i = 0; i < 6; i++) code += CHARS[Math.floor(Math.random() * CHARS.length)];
    } while (rooms.has(code));
    return code;
}

function createRoom(ws) {
    const code = generateCode();
    const room = {
        code,
        players: [ws, null],
        state: 'waiting',
        readyCount: 0,
        createdAt: Date.now()
    };
    rooms.set(code, room);
    ws._room = room;
    ws._playerNumber = 1;
    send(ws, { type: 'room_created', code });
    send(ws, { type: 'player_joined', playerNumber: 1 });
    console.log(`Room ${code} created`);
    return room;
}

function joinRoom(ws, code) {
    code = (code || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
        send(ws, { type: 'error', message: '房间不存在' });
        return;
    }
    if (room.state !== 'waiting') {
        send(ws, { type: 'error', message: '游戏已开始' });
        return;
    }
    if (room.players[1] !== null) {
        send(ws, { type: 'error', message: '房间已满' });
        return;
    }

    room.players[1] = ws;
    ws._room = room;
    ws._playerNumber = 2;

    send(ws, { type: 'player_joined', playerNumber: 2 });
    send(room.players[0], { type: 'opponent_joined' });
    send(ws, { type: 'opponent_joined' });
    console.log(`Room ${code}: player 2 joined`);
}

function handleReady(ws) {
    const room = ws._room;
    if (!room) return;

    room.readyCount++;
    if (room.readyCount >= 2) {
        room.state = 'playing';
        send(room.players[0], { type: 'game_start' });
        send(room.players[1], { type: 'game_start' });
        console.log(`Room ${room.code}: game started`);
    }
}

function handleDisconnect(ws) {
    const room = ws._room;
    if (!room) return;

    const otherIdx = ws._playerNumber === 1 ? 1 : 0;
    const other = room.players[otherIdx];

    if (other && other.readyState === 1) {
        send(other, { type: 'opponent_disconnected' });
    }

    // Clean up room
    rooms.delete(room.code);
    console.log(`Room ${room.code}: cleaned up (player disconnected)`);
}

function relayMessage(ws, data) {
    const room = ws._room;
    if (!room) return;

    const otherIdx = ws._playerNumber === 1 ? 1 : 0;
    const other = room.players[otherIdx];

    if (other && other.readyState === 1) {
        other.send(data);
    }
}

function send(ws, obj) {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(obj));
    }
}

// --- Room cleanup timer ---

setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        const age = now - room.createdAt;
        if (room.state === 'waiting' && age > ROOM_TIMEOUT_WAITING) {
            for (const p of room.players) {
                if (p) send(p, { type: 'error', message: '房间超时已关闭' });
            }
            rooms.delete(code);
            console.log(`Room ${code}: timed out (waiting)`);
        } else if (room.state === 'finished' && age > ROOM_TIMEOUT_FINISHED) {
            rooms.delete(code);
            console.log(`Room ${code}: timed out (finished)`);
        }
    }
}, 30000);

// --- Static file server ---

const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

const STATIC_DIR = __dirname;

const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(STATIC_DIR, filePath);

    // Prevent directory traversal
    if (!filePath.startsWith(STATIC_DIR)) {
        res.writeHead(403);
        res.end();
        return;
    }

    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
        res.end(data);
    });
});

// --- WebSocket server ---

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }

        switch (msg.type) {
            case 'create_room':
                createRoom(ws);
                break;
            case 'join_room':
                joinRoom(ws, msg.code);
                break;
            case 'ready':
                handleReady(ws);
                break;
            default:
                // Relay all other messages to opponent
                relayMessage(ws, raw.toString());
                break;
        }
    });

    ws.on('close', () => handleDisconnect(ws));
    ws.on('error', () => handleDisconnect(ws));
});

// --- Start ---

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Tetris Roguelike server running on http://localhost:${PORT}`);
});
