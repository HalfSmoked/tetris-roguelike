// ===== 远程玩家游戏代理 =====
// 模拟 TetrisGame 的只读接口，供 GameRenderer 渲染远程玩家的棋盘

class RemoteGameProxy {
    constructor() {
        this.cols = 10;
        this.rows = 20;
        this.cellSize = 28;
        this.board = this._emptyBoard();
        this.current = null;
        this.ghostY = 0;
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.totalLinesForTrait = 0;
        this.linesUntilTrait = 10;
        this.holdPiece = null;
        this.nextPieces = [];
        this.nextCount = 1;
        this.gameOver = false;
    }

    _emptyBoard() {
        return Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    }

    updateFromNetwork(data) {
        if (!data) return;
        this.board = data.board || this.board;
        this.current = data.current || null;
        this.ghostY = data.ghostY || 0;
        this.score = data.score || 0;
        this.lines = data.lines || 0;
        this.level = data.level || 1;
        this.totalLinesForTrait = data.totalLinesForTrait || 0;
        this.linesUntilTrait = data.linesUntilTrait || 10;
        this.holdPiece = data.holdPiece || null;
        this.nextPieces = data.nextPieces || [];
        this.nextCount = data.nextCount || 1;
        this.gameOver = data.gameOver || false;
        if (data.cols) this.cols = data.cols;
        if (data.rows) this.rows = data.rows;
    }
}
