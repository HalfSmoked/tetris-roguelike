// ===== 俄罗斯方块核心游戏逻辑 =====

const PIECE_TYPES = {
    I: { shape: [[1,1,1,1]], color: '#00f0f0' },
    O: { shape: [[1,1],[1,1]], color: '#f0f000' },
    T: { shape: [[0,1,0],[1,1,1]], color: '#a000f0' },
    S: { shape: [[0,1,1],[1,1,0]], color: '#00f000' },
    Z: { shape: [[1,1,0],[0,1,1]], color: '#f00000' },
    J: { shape: [[1,0,0],[1,1,1]], color: '#0000f0' },
    L: { shape: [[0,0,1],[1,1,1]], color: '#f0a000' }
};

const PIECE_NAMES = Object.keys(PIECE_TYPES);
class TetrisGame {
    constructor(cellSize) {
        this.baseCols = 10;
        this.baseRows = 20;
        this.cellSize = cellSize || 28;
        this.reset();
    }

    reset() {
        this.cols = this.baseCols;
        this.rows = this.baseRows;
        this.board = this.createBoard();
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.totalLinesForTrait = 0;
        this.linesUntilTrait = 10;
        this.gameOver = false;
        this.gameWon = false;
        this.winScore = 100000;
        this.paused = false;
        this.traitPending = false;

        this.dropInterval = 1000;
        this.dropTimer = 0;
        this.lockDelay = 500;
        this.lockTimer = 0;
        this.isLocking = false;

        this.speedMultiplier = 1;
        this.scoreMultiplier = 1;

        this.bag = [];
        this.nextPieces = [];
        this.nextCount = 1;
        this.holdPiece = null;
        this.holdUsed = false;
        this.maxHold = 1;

        this.current = null;
        this.ghostY = 0;

        // PK opponent reference (set externally)
        this.opponent = null;

        // Trait flags
        this.luckyDice = false;
        this.safetyNet = false;
        this.safetyNetCount = 0;
        this.blastExpert = false;
        this.crusher = false;
        this.chaos = false;
        this.lineClearerActive = false;
        this.lineClearerTimer = 0;
        this.lineClearerInterval = 60000;

        // Fill next queue
        for (let i = 0; i < 5; i++) {
            this.nextPieces.push(this.generatePiece());
        }
        this.spawnPiece();

        // Callbacks
        this.onLinesClear = null;
        this.onTraitReady = null;
        this.onGameOver = null;
        this.onScoreChange = null;
    }

    createBoard() {
        return Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    }

    // Resize board (for traits that change width)
    resizeBoard(newCols) {
        const diff = newCols - this.cols;
        if (diff === 0) return;

        const newBoard = Array.from({ length: this.rows }, () => Array(newCols).fill(null));
        const offset = Math.floor(Math.abs(diff) / 2);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const nc = diff > 0 ? c + offset : c - offset;
                if (nc >= 0 && nc < newCols) {
                    newBoard[r][nc] = this.board[r][c];
                }
            }
        }

        this.cols = newCols;
        this.board = newBoard;

        if (this.current) {
            this.current.x += diff > 0 ? Math.floor(diff / 2) : -Math.floor(Math.abs(diff) / 2);
            if (!this.isValidPosition(this.current.shape, this.current.x, this.current.y)) {
                this.current.x = Math.floor((this.cols - this.current.shape[0].length) / 2);
            }
        }
        this.updateGhost();
    }

    expandBoard(extra) {
        this.resizeBoard(this.cols + extra);
    }

    // 7-bag randomizer
    generatePiece() {
        if (this.bag.length === 0) {
            this.bag = [...PIECE_NAMES];
            for (let i = this.bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
            }
        }
        const name = this.bag.pop();
        const type = PIECE_TYPES[name];
        return {
            name,
            shape: type.shape.map(row => [...row]),
            color: type.color
        };
    }

    spawnPiece() {
        // Apply lucky dice trait
        let piece = this.nextPieces.shift();
        if (this.luckyDice && Math.random() < 0.5) {
            piece = {
                name: 'I',
                shape: PIECE_TYPES.I.shape.map(r => [...r]),
                color: PIECE_TYPES.I.color
            };
        }
        this.nextPieces.push(this.generatePiece());

        this.current = {
            ...piece,
            x: Math.floor((this.cols - piece.shape[0].length) / 2),
            y: 0
        };
        this.holdUsed = false;
        this.isLocking = false;
        this.lockTimer = 0;

        if (!this.isValidPosition(this.current.shape, this.current.x, this.current.y)) {
            this.gameOver = true;
            // Safety net trait
            if (this.safetyNet && this.safetyNetCount > 0) {
                this.safetyNetCount--;
                this.clearTopRows(3);
                this.gameOver = false;
                if (!this.isValidPosition(this.current.shape, this.current.x, this.current.y)) {
                    this.gameOver = true;
                }
            }
            if (this.gameOver && this.onGameOver) {
                this.onGameOver();
            }
        }
        this.updateGhost();
    }

    clearTopRows(count) {
        let topRow = this.rows;
        for (let r = 0; r < this.rows; r++) {
            if (this.board[r].some(c => c !== null)) {
                topRow = r;
                break;
            }
        }
        for (let i = 0; i < count && topRow + i < this.rows; i++) {
            this.board[topRow + i] = Array(this.cols).fill(null);
        }
    }

    hold() {
        if (this.holdUsed) return;
        if (!this.current) return;

        const currentPiece = {
            name: this.current.name,
            shape: PIECE_TYPES[this.current.name].shape.map(r => [...r]),
            color: this.current.color
        };

        if (this.holdPiece === null) {
            this.holdPiece = currentPiece;
            this.spawnPiece();
        } else {
            const temp = this.holdPiece;
            this.holdPiece = currentPiece;
            this.current = {
                ...temp,
                x: Math.floor((this.cols - temp.shape[0].length) / 2),
                y: 0
            };
            this.updateGhost();
        }
        this.holdUsed = true;
    }

    isValidPosition(shape, x, y) {
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const nx = x + c;
                const ny = y + r;
                if (nx < 0 || nx >= this.cols || ny >= this.rows) return false;
                if (ny >= 0 && this.board[ny][nx] !== null) return false;
            }
        }
        return true;
    }

    rotate(dir = 1) {
        if (!this.current || this.current.name === 'O') return;
        const shape = this.current.shape;
        const rows = shape.length;
        const cols = shape[0].length;
        const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (dir === 1) {
                    rotated[c][rows - 1 - r] = shape[r][c];
                } else {
                    rotated[cols - 1 - c][r] = shape[r][c];
                }
            }
        }

        const kicks = [0, -1, 1, -2, 2];
        for (const kick of kicks) {
            if (this.isValidPosition(rotated, this.current.x + kick, this.current.y)) {
                this.current.shape = rotated;
                this.current.x += kick;
                this.updateGhost();
                if (this.isLocking) this.lockTimer = 0;
                return;
            }
        }
    }

    move(dx) {
        if (!this.current) return;
        if (this.isValidPosition(this.current.shape, this.current.x + dx, this.current.y)) {
            this.current.x += dx;
            this.updateGhost();
            if (this.isLocking) this.lockTimer = 0;
        }
    }

    softDrop() {
        if (!this.current) return;
        if (this.isValidPosition(this.current.shape, this.current.x, this.current.y + 1)) {
            this.current.y++;
            this.score += 1;
            this.isLocking = false;
            this.lockTimer = 0;
        }
    }

    hardDrop() {
        if (!this.current) return;
        let dist = 0;
        while (this.isValidPosition(this.current.shape, this.current.x, this.current.y + 1)) {
            this.current.y++;
            dist++;
        }
        this.score += dist * 2;
        this.lockPiece();
    }

    updateGhost() {
        if (!this.current) return;
        this.ghostY = this.current.y;
        while (this.isValidPosition(this.current.shape, this.current.x, this.ghostY + 1)) {
            this.ghostY++;
        }
    }

    lockPiece() {
        if (!this.current) return;
        const shape = this.current.shape;

        // Crusher trait: 单人填满落点正下方整列方块，PK给对手加2个随机方块
        if (this.crusher) {
            if (this.opponent) {
                this.opponent.addRandomBlocks(2);
            } else {
                // 找到方块最中心的列，填满该列从落点往下的所有空格
                const centerC = Math.floor(shape[0].length / 2);
                let bottomR = -1;
                for (let r = shape.length - 1; r >= 0; r--) {
                    if (shape[r][centerC]) { bottomR = r; break; }
                }
                if (bottomR !== -1) {
                    const boardX = this.current.x + centerC;
                    const fillColor = this.current.color;
                    for (let r = this.current.y + bottomR + 1; r < this.rows; r++) {
                        if (boardX >= 0 && boardX < this.cols && !this.board[r][boardX]) {
                            this.board[r][boardX] = fillColor;
                        }
                    }
                }
            }
        }

        // Place piece on board
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (!shape[r][c]) continue;
                const ny = this.current.y + r;
                const nx = this.current.x + c;
                if (ny >= 0 && ny < this.rows && nx >= 0 && nx < this.cols) {
                    this.board[ny][nx] = this.chaos ? this.randomColor() : this.current.color;
                }
            }
        }

        const cleared = this.clearLines();
        this.handleLineClears(cleared);
        this.spawnPiece();
    }

    randomColor() {
        const colors = ['#00f0f0','#f0f000','#a000f0','#00f000','#f00000','#0000f0','#f0a000'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    clearLines() {
        const remaining = this.board.filter(row => !row.every(c => c !== null));
        const cleared = this.rows - remaining.length;
        if (cleared === 0) return 0;

        while (remaining.length < this.rows) {
            remaining.unshift(Array(this.cols).fill(null));
        }
        this.board = remaining;

        return cleared;
    }

    handleLineClears(count) {
        if (count === 0) return;

        const points = [0, 100, 300, 500, 800];
        this.score += (points[count] || 800) * this.level * this.scoreMultiplier;
        this.lines += count;
        this.totalLinesForTrait += count;

        // Blast expert trait: 消2行+时，单人额外清底部1行，PK给对手加垃圾行
        if (this.blastExpert && count >= 2) {
            if (this.opponent) {
                this.opponent.addGarbageRow();
            } else {
                this.clearBottomRow();
            }
        }

        // Level up
        this.level = Math.floor(this.lines / 10) + 1;
        this.updateSpeed();

        // Check trait trigger
        if (this.totalLinesForTrait >= this.linesUntilTrait) {
            this.totalLinesForTrait -= this.linesUntilTrait;
            this.traitPending = true;
            if (this.onTraitReady) this.onTraitReady();
        }

        if (this.onScoreChange) this.onScoreChange();
        if (this.onLinesClear) this.onLinesClear(count);
        this.checkWin();
    }

    checkWin() {
        if (!this.gameWon && this.score >= this.winScore) {
            this.gameWon = true;
            this.gameOver = true;
            if (this.onGameWin) this.onGameWin();
        }
    }

    // 清除最底部有方块的一行
    clearBottomRow() {
        for (let r = this.rows - 1; r >= 0; r--) {
            if (this.board[r].some(c => c !== null)) {
                this.board.splice(r, 1);
                this.board.unshift(Array(this.cols).fill(null));
                return;
            }
        }
    }

    // 向棋盘添加随机方块（用于PK攻击对手）
    addRandomBlocks(count) {
        const empty = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.board[r][c] === null) empty.push([r, c]);
            }
        }
        const colors = ['#00f0f0','#f0f000','#a000f0','#00f000','#f00000','#0000f0','#f0a000'];
        for (let i = 0; i < count && empty.length > 0; i++) {
            const idx = Math.floor(Math.random() * empty.length);
            const [r, c] = empty.splice(idx, 1)[0];
            this.board[r][c] = colors[Math.floor(Math.random() * colors.length)];
        }
    }

    // 从底部添加一行垃圾行（用于PK攻击对手）
    addGarbageRow() {
        // 移除最顶行
        this.board.shift();
        // 底部添加一行，留一个随机空缺
        const row = Array(this.cols).fill('#666666');
        const gap = Math.floor(Math.random() * this.cols);
        row[gap] = null;
        this.board.push(row);
        // 当前方块可能需要上移
        if (this.current) {
            if (!this.isValidPosition(this.current.shape, this.current.x, this.current.y)) {
                this.current.y--;
            }
            this.updateGhost();
        }
    }

    updateSpeed() {
        const baseSpeed = Math.max(100, 1000 - (this.level - 1) * 80);
        this.dropInterval = baseSpeed / this.speedMultiplier;
    }

    update(dt) {
        if (this.gameOver || this.paused || this.traitPending) return;
        if (!this.current) return;

        if (!this.isValidPosition(this.current.shape, this.current.x, this.current.y + 1)) {
            this.isLocking = true;
            this.lockTimer += dt;
            if (this.lockTimer >= this.lockDelay) {
                this.lockPiece();
                return;
            }
        } else {
            this.isLocking = false;
            this.lockTimer = 0;
        }

        this.dropTimer += dt;
        if (this.dropTimer >= this.dropInterval) {
            this.dropTimer = 0;
            if (this.isValidPosition(this.current.shape, this.current.x, this.current.y + 1)) {
                this.current.y++;
            }
        }
    }

    updateLineClearer(dt) {
        if (!this.lineClearerActive) return;
        this.lineClearerTimer += dt;
        if (this.lineClearerTimer >= this.lineClearerInterval) {
            this.lineClearerTimer = 0;
            if (this.opponent) {
                // PK模式：给对手添加垃圾行
                this.opponent.addGarbageRow();
            } else {
                // 单人模式：清除自己最底部一行
                const bottomRow = this.rows - 1;
                if (this.board[bottomRow].some(c => c !== null)) {
                    this.board.splice(bottomRow, 1);
                    this.board.unshift(Array(this.cols).fill(null));
                }
            }
        }
    }
}
