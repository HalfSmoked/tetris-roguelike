// ===== 手机触控按钮 =====

class TouchControls {
    constructor(actions) {
        this.actions = actions; // { moveLeft, moveRight, rotate, softDrop, hardDrop, hold, pause }
        this.repeatTimers = {};
        this.container = document.createElement('div');
        this.container.id = 'touch-controls';
        this.container.innerHTML = `
            <div class="touch-row">
                <button class="touch-btn" data-action="rotate">旋转</button>
                <button class="touch-btn" data-action="hold">暂存</button>
                <button class="touch-btn touch-btn-small" data-action="pause">⏸</button>
            </div>
            <div class="touch-row">
                <button class="touch-btn" data-action="moveLeft">◀</button>
                <button class="touch-btn" data-action="softDrop">▼</button>
                <button class="touch-btn" data-action="moveRight">▶</button>
                <button class="touch-btn touch-btn-accent" data-action="hardDrop">⏬</button>
            </div>
        `;
        document.body.appendChild(this.container);
        this._bindEvents();
    }

    _bindEvents() {
        this.container.querySelectorAll('.touch-btn').forEach(btn => {
            const action = btn.dataset.action;

            btn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this._exec(action);
                if (action === 'moveLeft' || action === 'moveRight' || action === 'softDrop') {
                    this._startRepeat(action);
                }
            }, { passive: false });

            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this._stopRepeat(action);
            }, { passive: false });

            btn.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                this._stopRepeat(action);
            }, { passive: false });
        });
    }

    _startRepeat(action) {
        this._stopRepeat(action);
        const delay = action === 'softDrop' ? 0 : 170;
        const rate = action === 'softDrop' ? 20 : 50;

        this.repeatTimers[action] = setTimeout(() => {
            this.repeatTimers[action] = setInterval(() => {
                this._exec(action);
            }, rate);
        }, delay);
    }

    _stopRepeat(action) {
        if (this.repeatTimers[action] != null) {
            clearTimeout(this.repeatTimers[action]);
            clearInterval(this.repeatTimers[action]);
            delete this.repeatTimers[action];
        }
    }

    _exec(action) {
        if (this.actions[action]) this.actions[action]();
    }

    show() { this.container.classList.remove('hidden'); }
    hide() { this.container.classList.add('hidden'); }

    destroy() {
        for (const k of Object.keys(this.repeatTimers)) this._stopRepeat(k);
        if (this.container.parentNode) this.container.parentNode.removeChild(this.container);
    }
}
