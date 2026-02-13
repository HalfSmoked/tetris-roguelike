// ===== UI 渲染系统 =====

class GameRenderer {
    constructor(game, options) {
        this.game = game;
        // Support parameterized or default element IDs
        const opts = options || {};
        this.canvas = document.getElementById(opts.canvasId || 'game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.holdCanvas = document.getElementById(opts.holdCanvasId || 'hold-canvas');
        this.holdCtx = this.holdCanvas.getContext('2d');
        this.nextContainerId = opts.nextContainerId || 'next-pieces';
        this.statIds = opts.statIds || {
            score: 'score', level: 'level', lines: 'lines',
            progress: 'trait-progress', progressText: 'trait-progress-text'
        };

        this.updateCanvasSize();
    }

    updateCanvasSize() {
        this.canvas.width = this.game.cols * this.game.cellSize;
        this.canvas.height = this.game.rows * this.game.cellSize;
    }

    render() {
        this.updateCanvasSize();
        this.drawBoard();
        this.drawGhost();
        this.drawCurrentPiece();
        this.drawGrid();
        this.drawHold();
        this.drawNextPieces();
        this.updateStats();
    }

    drawBoard() {
        const { ctx, game } = this;
        const cs = game.cellSize;

        ctx.fillStyle = '#0d0d14';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        for (let r = 0; r < game.rows; r++) {
            for (let c = 0; c < game.cols; c++) {
                if (game.board[r][c]) {
                    this.drawCell(ctx, c * cs, r * cs, cs, game.board[r][c]);
                }
            }
        }
    }

    drawGrid() {
        const { ctx, game } = this;
        const cs = game.cellSize;
        ctx.strokeStyle = '#1a1a24';
        ctx.lineWidth = 0.5;

        for (let c = 0; c <= game.cols; c++) {
            ctx.beginPath();
            ctx.moveTo(c * cs, 0);
            ctx.lineTo(c * cs, game.rows * cs);
            ctx.stroke();
        }
        for (let r = 0; r <= game.rows; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * cs);
            ctx.lineTo(game.cols * cs, r * cs);
            ctx.stroke();
        }
    }

    drawCurrentPiece() {
        const { ctx, game } = this;
        if (!game.current) return;
        const cs = game.cellSize;
        const { shape, x, y, color } = game.current;

        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const py = y + r;
                if (py < 0) continue;
                this.drawCell(ctx, (x + c) * cs, py * cs, cs, color);
            }
        }
    }

    drawGhost() {
        const { ctx, game } = this;
        if (!game.current) return;
        const cs = game.cellSize;
        const { shape, x, color } = game.current;
        const gy = game.ghostY;

        if (gy === game.current.y) return;

        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const py = gy + r;
                if (py < 0) continue;
                ctx.fillStyle = color + '22';
                ctx.fillRect((x + c) * cs + 1, py * cs + 1, cs - 2, cs - 2);
                ctx.strokeStyle = color + '44';
                ctx.lineWidth = 1;
                ctx.strokeRect((x + c) * cs + 1, py * cs + 1, cs - 2, cs - 2);
            }
        }
    }

    drawCell(ctx, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, size - 2, size - 2);

        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x + 1, y + 1, size - 2, 3);
        ctx.fillRect(x + 1, y + 1, 3, size - 2);

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + size - 3, y + 1, 2, size - 2);
        ctx.fillRect(x + 1, y + size - 3, size - 2, 2);
    }

    drawHold() {
        const { holdCtx } = this;
        const w = this.holdCanvas.width;
        const h = this.holdCanvas.height;
        holdCtx.fillStyle = '#0d0d14';
        holdCtx.fillRect(0, 0, w, h);

        if (!this.game.holdPiece) return;
        this.drawPreviewPiece(holdCtx, this.game.holdPiece, w, h);
    }

    drawNextPieces() {
        const container = document.getElementById(this.nextContainerId);
        if (!container) return;
        const count = this.game.nextCount;

        while (container.children.length < count) {
            const c = document.createElement('canvas');
            c.className = 'next-canvas';
            c.width = 100;
            c.height = 100;
            container.appendChild(c);
        }
        while (container.children.length > count) {
            container.removeChild(container.lastChild);
        }

        for (let i = 0; i < count; i++) {
            const c = container.children[i];
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#0d0d14';
            ctx.fillRect(0, 0, c.width, c.height);

            if (this.game.nextPieces[i]) {
                this.drawPreviewPiece(ctx, this.game.nextPieces[i], c.width, c.height);
            }
        }
    }

    drawPreviewPiece(ctx, piece, w, h) {
        const shape = piece.shape;
        const rows = shape.length;
        const cols = shape[0].length;
        const cs = Math.min(Math.floor(w / (cols + 1)), Math.floor(h / (rows + 1)));
        const ox = Math.floor((w - cols * cs) / 2);
        const oy = Math.floor((h - rows * cs) / 2);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!shape[r][c]) continue;
                this.drawCell(ctx, ox + c * cs, oy + r * cs, cs, piece.color);
            }
        }
    }

    updateStats() {
        const ids = this.statIds;
        const el = (id) => document.getElementById(id);
        if (!el(ids.score)) return;

        el(ids.score).textContent = Math.floor(this.game.score);
        el(ids.level).textContent = this.game.level;
        el(ids.lines).textContent = this.game.lines;

        const progress = this.game.totalLinesForTrait / this.game.linesUntilTrait;
        el(ids.progress).style.width = (progress * 100) + '%';
        el(ids.progressText).textContent =
            `${this.game.totalLinesForTrait} / ${this.game.linesUntilTrait}`;
    }
}

class UIManager {
    constructor() {
        this.screens = {
            start: document.getElementById('start-screen'),
            game: document.getElementById('game-screen'),
            pkGame: document.getElementById('pk-game-screen'),
            onlineGame: document.getElementById('online-game-screen'),
            createRoomModal: document.getElementById('create-room-modal'),
            joinRoomModal: document.getElementById('join-room-modal'),
            trait: document.getElementById('trait-screen'),
            pause: document.getElementById('pause-screen'),
            gameover: document.getElementById('gameover-screen'),
            pkGameover: document.getElementById('pk-gameover-screen'),
            onlineGameover: document.getElementById('online-gameover-screen'),
            onlineDisconnect: document.getElementById('online-disconnect-screen')
        };
    }

    showScreen(name) {
        this.screens.start.classList.add('hidden');
        this.screens.game.classList.add('hidden');
        this.screens.pkGame.classList.add('hidden');
        if (this.screens.onlineGame) this.screens.onlineGame.classList.add('hidden');

        if (name === 'start') this.screens.start.classList.remove('hidden');
        else if (name === 'game') this.screens.game.classList.remove('hidden');
        else if (name === 'pk-game') this.screens.pkGame.classList.remove('hidden');
        else if (name === 'online-game') this.screens.onlineGame.classList.remove('hidden');
    }

    showOverlay(name) {
        this.screens[name].classList.remove('hidden');
    }

    hideOverlay(name) {
        this.screens[name].classList.add('hidden');
    }

    hideAllOverlays() {
        ['trait', 'pause', 'gameover', 'pkGameover', 'onlineGameover', 'onlineDisconnect', 'createRoomModal', 'joinRoomModal'].forEach(name => {
            if (this.screens[name]) this.screens[name].classList.add('hidden');
        });
        // Hide per-player PK trait overlays
        ['pk-trait-overlay-p1', 'pk-trait-overlay-p2', 'ol-trait-overlay-local'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    }

    // --- Single player UI ---

    showTraitChoices(traits, onSelect) {
        const container = document.getElementById('trait-choices');
        container.innerHTML = '';

        traits.forEach(trait => {
            const card = this._createTraitCard(trait, () => onSelect(trait));
            container.appendChild(card);
        });

        this.showOverlay('trait');
    }

    updateActiveTraits(traits, containerId) {
        const container = document.getElementById(containerId || 'active-traits');
        container.innerHTML = '';
        traits.forEach(t => {
            const tag = document.createElement('div');
            tag.className = `active-trait-tag type-${t.type}`;
            tag.textContent = `${t.icon} ${t.name}`;
            container.appendChild(tag);
        });
    }

    showGameOver(score, lines, level, traits, won = false) {
        const titleEl = document.getElementById('gameover-title');
        if (titleEl) titleEl.textContent = won ? '胜利！' : '游戏结束';

        document.getElementById('final-score').textContent = Math.floor(score);
        document.getElementById('final-lines').textContent = lines;
        document.getElementById('final-level').textContent = level;

        const traitsDiv = document.getElementById('final-traits');
        if (traits.length > 0) {
            traitsDiv.innerHTML = '<h3>获得的词条</h3><div class="final-trait-list"></div>';
            const list = traitsDiv.querySelector('.final-trait-list');
            traits.forEach(t => {
                const tag = document.createElement('div');
                tag.className = `active-trait-tag type-${t.type}`;
                tag.textContent = `${t.icon} ${t.name}`;
                list.appendChild(tag);
            });
        } else {
            traitsDiv.innerHTML = '';
        }

        this.showOverlay('gameover');
    }

    // --- PK mode UI ---

    showPKSingleTraitChoice(player, choices, onSelect) {
        const overlayId = `pk-trait-overlay-p${player}`;
        const containerId = `pk-trait-choices-p${player}`;
        const overlay = document.getElementById(overlayId);
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        choices.forEach(trait => {
            const card = this._createTraitCard(trait, () => onSelect(trait));
            container.appendChild(card);
        });

        overlay.classList.remove('hidden');
    }

    hidePKTraitOverlay(player) {
        const overlay = document.getElementById(`pk-trait-overlay-p${player}`);
        if (overlay) overlay.classList.add('hidden');
    }

    // --- Online mode UI ---

    showLobbyStatus(text, type, target) {
        const id = target === 'join' ? 'join-room-status' : 'create-room-status';
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.className = 'lobby-status';
        if (type) el.classList.add(type);
        el.classList.remove('hidden');
    }

    hideLobbyStatus() {
        ['create-room-status', 'join-room-status'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    }

    showRoomCode(code) {
        document.getElementById('room-code').textContent = code;
        document.getElementById('room-code-display').classList.remove('hidden');
    }

    showOnlineTraitChoice(choices, onSelect) {
        const overlay = document.getElementById('ol-trait-overlay-local');
        const container = document.getElementById('ol-trait-choices-local');
        container.innerHTML = '';

        choices.forEach(trait => {
            const card = this._createTraitCard(trait, () => onSelect(trait));
            container.appendChild(card);
        });

        overlay.classList.remove('hidden');
    }

    hideOnlineTraitOverlay() {
        const overlay = document.getElementById('ol-trait-overlay-local');
        if (overlay) overlay.classList.add('hidden');
    }

    showOnlineGameOver(localWin, localStats, remoteStats) {
        const winnerEl = document.getElementById('ol-winner');
        winnerEl.textContent = localWin ? '你赢了!' : '你输了!';
        winnerEl.style.color = localWin ? '#00ff88' : '#ff4444';

        document.getElementById('ol-final-score-local').textContent = Math.floor(localStats.score);
        document.getElementById('ol-final-lines-local').textContent = localStats.lines;
        document.getElementById('ol-final-level-local').textContent = localStats.level;

        document.getElementById('ol-final-score-remote').textContent = Math.floor(remoteStats.score);
        document.getElementById('ol-final-lines-remote').textContent = remoteStats.lines;
        document.getElementById('ol-final-level-remote').textContent = remoteStats.level;

        this.showOverlay('onlineGameover');
    }

    showPKGameOver(winner, p1Stats, p2Stats, p1Traits, p2Traits) {
        const winnerEl = document.getElementById('pk-winner');
        winnerEl.textContent = winner === 1 ? '玩家1 获胜!' : '玩家2 获胜!';
        winnerEl.style.color = winner === 1 ? '#4488ff' : '#ff4444';

        document.getElementById('p1-final-score').textContent = Math.floor(p1Stats.score);
        document.getElementById('p1-final-lines').textContent = p1Stats.lines;
        document.getElementById('p1-final-level').textContent = p1Stats.level;

        document.getElementById('p2-final-score').textContent = Math.floor(p2Stats.score);
        document.getElementById('p2-final-lines').textContent = p2Stats.lines;
        document.getElementById('p2-final-level').textContent = p2Stats.level;

        this.showOverlay('pkGameover');
    }

    // --- Shared helper ---

    _createTraitCard(trait, onClick) {
        const card = document.createElement('div');
        card.className = 'trait-card';
        card.innerHTML = `
            <div class="trait-icon">${trait.icon}</div>
            <div class="trait-name">${trait.name}</div>
            <span class="trait-type type-${trait.type}">${trait.typeName}</span>
            <div class="trait-desc">${trait.desc}</div>
        `;
        card.addEventListener('click', onClick);
        return card;
    }
}
