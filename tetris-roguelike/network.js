// ===== 客户端网络模块 =====

class NetworkManager {
    constructor() {
        this.ws = null;
        this.roomCode = null;
        this.playerNumber = null;
        this.connected = false;

        // Callbacks
        this.onRoomCreated = null;
        this.onPlayerJoined = null;
        this.onOpponentJoined = null;
        this.onGameStart = null;
        this.onStateUpdate = null;
        this.onAttack = null;
        this.onOpponentGameOver = null;
        this.onOpponentDisconnected = null;
        this.onOpponentTraitSelected = null;
        this.onError = null;

        // State sync
        this.syncInterval = null;
        this.SYNC_RATE = 100;
    }

    connect(serverUrl) {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(serverUrl);

            this.ws.onopen = () => {
                this.connected = true;
                resolve();
            };

            this.ws.onerror = () => {
                this.connected = false;
                reject(new Error('连接服务器失败'));
            };

            this.ws.onclose = () => {
                this.connected = false;
                this.stopStateSync();
            };

            this.ws.onmessage = (event) => this._handleMessage(event);
        });
    }

    disconnect() {
        this.stopStateSync();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.roomCode = null;
        this.playerNumber = null;
    }

    createRoom() {
        this._send({ type: 'create_room' });
    }

    joinRoom(code) {
        this._send({ type: 'join_room', code });
    }

    sendReady() {
        this._send({ type: 'ready' });
    }

    sendStateUpdate(game) {
        const data = this._extractGameState(game);
        this._send({ type: 'state_update', data });
    }

    sendAttack(action, args) {
        this._send({ type: 'attack', action, args: args || [] });
    }

    sendGameOver() {
        this._send({ type: 'game_over' });
    }

    sendTraitSelected(traitId) {
        this._send({ type: 'trait_selected', traitId });
    }

    startStateSync(game) {
        this.stopStateSync();
        this.syncInterval = setInterval(() => {
            if (this.connected && game) {
                this.sendStateUpdate(game);
            }
        }, this.SYNC_RATE);
    }

    stopStateSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    _send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    _handleMessage(event) {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            return;
        }

        switch (msg.type) {
            case 'room_created':
                this.roomCode = msg.code;
                if (this.onRoomCreated) this.onRoomCreated(msg.code);
                break;

            case 'player_joined':
                this.playerNumber = msg.playerNumber;
                if (this.onPlayerJoined) this.onPlayerJoined(msg.playerNumber);
                break;

            case 'opponent_joined':
                if (this.onOpponentJoined) this.onOpponentJoined();
                break;

            case 'game_start':
                if (this.onGameStart) this.onGameStart();
                break;

            case 'state_update':
                if (this.onStateUpdate) this.onStateUpdate(msg.data);
                break;

            case 'attack':
                if (this.onAttack) this.onAttack(msg.action, msg.args);
                break;

            case 'game_over':
                if (this.onOpponentGameOver) this.onOpponentGameOver();
                break;

            case 'opponent_disconnected':
                if (this.onOpponentDisconnected) this.onOpponentDisconnected();
                break;

            case 'trait_selected':
                if (this.onOpponentTraitSelected) this.onOpponentTraitSelected(msg.traitId);
                break;

            case 'error':
                if (this.onError) this.onError(msg.message);
                break;
        }
    }

    _extractGameState(game) {
        return {
            board: game.board,
            current: game.current ? {
                shape: game.current.shape,
                x: game.current.x,
                y: game.current.y,
                color: game.current.color,
                name: game.current.name
            } : null,
            ghostY: game.ghostY,
            score: game.score,
            lines: game.lines,
            level: game.level,
            totalLinesForTrait: game.totalLinesForTrait,
            linesUntilTrait: game.linesUntilTrait,
            holdPiece: game.holdPiece ? {
                name: game.holdPiece.name,
                shape: game.holdPiece.shape,
                color: game.holdPiece.color
            } : null,
            nextPieces: game.nextPieces.slice(0, game.nextCount).map(p => ({
                name: p.name, shape: p.shape, color: p.color
            })),
            nextCount: game.nextCount,
            gameOver: game.gameOver,
            cols: game.cols,
            rows: game.rows
        };
    }
}
