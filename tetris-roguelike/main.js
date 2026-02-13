// ===== 游戏主控制器 =====

let gameMode = 'single'; // 'single', 'pk', or 'online'
let game, renderer, ui, traitSystem;
// PK mode
let game1, game2, renderer1, renderer2, traitSystem1, traitSystem2;
// Online mode
let networkManager = null;
let localGame = null;
let localRenderer = null;
let remoteProxy = null;
let remoteRenderer = null;
let localTraitSystem = null;
let remoteTraits = []; // trait names received from opponent

let lastTime = 0;
let animationId = null;

// Mobile detection
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (window.innerWidth <= 768 && 'ontouchstart' in window);
let touchControls = null;

function getMobileCellSize(cols, rows) {
    if (!isMobile) return 28;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const availWidth = vw - 16;
    const availHeight = vh * 0.55; // reserve space for top info + bottom touch controls
    return Math.max(14, Math.min(Math.floor(availWidth / cols), Math.floor(availHeight / rows)));
}

function cleanupTouchControls() {
    if (touchControls) { touchControls.destroy(); touchControls = null; }
}

function initTouchControls(g, ts, pauseFn) {
    cleanupTouchControls();
    touchControls = new TouchControls({
        moveLeft:  () => { if (!g.paused && !g.traitPending) g.move(-1); },
        moveRight: () => { if (!g.paused && !g.traitPending) g.move(1); },
        rotate:    () => { if (!g.paused && !g.traitPending) g.rotate(1); },
        softDrop:  () => { if (!g.paused && !g.traitPending) g.softDrop(); },
        hardDrop:  () => { if (!g.paused && !g.traitPending) g.hardDrop(); },
        hold:      () => {
            if (!g.paused && !g.traitPending) {
                g.hold();
                const ht = ts.activeTraits.find(t => t.id === 'hold_master');
                if (ht && ht.modifyHold) ht.modifyHold(g);
            }
        },
        pause: pauseFn
    });
}

// Key state tracking
const keyRepeatDelay = 170;
const keyRepeatRate = 50;
const softDropRate = 20;
const keys = {};
const keyTimers = {};

function init() {
    ui = new UIManager();
    ui.showScreen('start');

    // Bind buttons
    document.getElementById('btn-start-single').addEventListener('click', () => {
        gameMode = 'single';
        startSingleGame();
    });
    document.getElementById('btn-start-pk').addEventListener('click', () => {
        gameMode = 'pk';
        startPKGame();
    });
    document.getElementById('btn-start-online').addEventListener('click', () => {
        gameMode = 'online';
        showOnlineLobby();
    });
    document.getElementById('btn-resume').addEventListener('click', resumeGame);
    document.getElementById('btn-restart').addEventListener('click', () => {
        if (gameMode === 'single') startSingleGame();
        else startPKGame();
    });
    document.getElementById('btn-pk-restart').addEventListener('click', () => startPKGame());
    document.getElementById('btn-back-menu').addEventListener('click', () => {
        if (animationId) cancelAnimationFrame(animationId);
        cleanupTouchControls();
        ui.hideAllOverlays();
        ui.showScreen('start');
    });

    // Online lobby buttons
    document.getElementById('btn-create-room').addEventListener('click', createOnlineRoom);
    document.getElementById('btn-join-room').addEventListener('click', () => {
        const code = document.getElementById('join-code-input').value;
        joinOnlineRoom(code);
    });
    document.getElementById('btn-lobby-back').addEventListener('click', () => {
        if (networkManager) networkManager.disconnect();
        if (isMobile) {
            document.getElementById('online-lobby-screen').classList.add('hidden');
        } else {
            ui.showScreen('start');
        }
    });
    document.getElementById('btn-ol-back-menu').addEventListener('click', () => {
        if (networkManager) networkManager.disconnect();
        if (animationId) cancelAnimationFrame(animationId);
        cleanupTouchControls();
        ui.hideAllOverlays();
        ui.showScreen('start');
    });
    document.getElementById('btn-ol-disconnect-back').addEventListener('click', () => {
        if (networkManager) networkManager.disconnect();
        if (animationId) cancelAnimationFrame(animationId);
        cleanupTouchControls();
        ui.hideAllOverlays();
        ui.showScreen('start');
    });
    // Enter key for join code input
    document.getElementById('join-code-input').addEventListener('keydown', (e) => {
        if (e.code === 'Enter') {
            e.preventDefault();
            const code = document.getElementById('join-code-input').value;
            joinOnlineRoom(code);
        }
    });

    // Keyboard
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
}

// ===================== SINGLE PLAYER =====================

function startSingleGame() {
    const cs = getMobileCellSize(10, 20);
    game = new TetrisGame(cs);
    traitSystem = new TraitSystem();

    game.onTraitReady = showTraitSelection;
    game.onGameOver = showSingleGameOver;
    game.onGameWin = () => showSingleGameOver(true);
    game.onScoreChange = () => renderer && renderer.updateStats();

    ui.showScreen('game');
    ui.hideAllOverlays();
    ui.updateActiveTraits([]);

    renderer = new GameRenderer(game);
    renderer.render();

    if (isMobile) initTouchControls(game, traitSystem, togglePause);

    lastTime = performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    singleGameLoop(lastTime);
}

function singleGameLoop(time) {
    const dt = time - lastTime;
    lastTime = time;

    processSingleHeldKeys(time);
    game.update(dt);
    game.updateLineClearer(dt);

    if (renderer) renderer.render();

    if (!game.gameOver) {
        animationId = requestAnimationFrame(singleGameLoop);
    }
}

function showTraitSelection() {
    const choices = traitSystem.getChoices(3);
    ui.showTraitChoices(choices, (trait) => {
        traitSystem.applyTrait(trait, game);
        ui.updateActiveTraits(traitSystem.activeTraits);
        ui.hideOverlay('trait');
        game.traitPending = false;
        lastTime = performance.now();
    });
}

function showSingleGameOver(won = false) {
    if (animationId) cancelAnimationFrame(animationId);
    renderer.render();
    ui.showGameOver(game.score, game.lines, game.level, traitSystem.activeTraits, won);
}

// ===================== PK MODE =====================

function startPKGame() {
    game1 = new TetrisGame();
    game2 = new TetrisGame();
    game1.opponent = game2;
    game2.opponent = game1;
    traitSystem1 = new TraitSystem();
    traitSystem2 = new TraitSystem();
    // Trait triggers — only the triggering player pauses
    game1.onTraitReady = () => {
        game1.traitPending = true;
        showPKTraitSelectionFor(1);
    };
    game2.onTraitReady = () => {
        game2.traitPending = true;
        showPKTraitSelectionFor(2);
    };

    game1.onGameOver = () => handlePKGameOver(2);
    game2.onGameOver = () => handlePKGameOver(1);
    game1.onGameWin = () => handlePKGameOver(1);
    game2.onGameWin = () => handlePKGameOver(2);

    game1.onScoreChange = () => renderer1 && renderer1.updateStats();
    game2.onScoreChange = () => renderer2 && renderer2.updateStats();

    ui.showScreen('pk-game');
    ui.hideAllOverlays();
    ui.updateActiveTraits([], 'pk-active-traits-p1');
    ui.updateActiveTraits([], 'pk-active-traits-p2');

    renderer1 = new GameRenderer(game1, {
        canvasId: 'pk-canvas-p1',
        holdCanvasId: 'pk-hold-canvas-p1',
        nextContainerId: 'pk-next-pieces-p1',
        statIds: {
            score: 'pk-score-p1', level: 'pk-level-p1', lines: 'pk-lines-p1',
            progress: 'pk-trait-progress-p1', progressText: 'pk-trait-progress-text-p1'
        }
    });
    renderer2 = new GameRenderer(game2, {
        canvasId: 'pk-canvas-p2',
        holdCanvasId: 'pk-hold-canvas-p2',
        nextContainerId: 'pk-next-pieces-p2',
        statIds: {
            score: 'pk-score-p2', level: 'pk-level-p2', lines: 'pk-lines-p2',
            progress: 'pk-trait-progress-p2', progressText: 'pk-trait-progress-text-p2'
        }
    });

    renderer1.render();
    renderer2.render();

    lastTime = performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    pkGameLoop(lastTime);
}

function pkGameLoop(time) {
    const dt = time - lastTime;
    lastTime = time;

    processPKHeldKeys(time);

    game1.update(dt);
    game1.updateLineClearer(dt);
    game2.update(dt);
    game2.updateLineClearer(dt);

    if (renderer1) renderer1.render();
    if (renderer2) renderer2.render();

    if (!game1.gameOver && !game2.gameOver) {
        animationId = requestAnimationFrame(pkGameLoop);
    }
}

function showPKTraitSelectionFor(player) {
    const ts = player === 1 ? traitSystem1 : traitSystem2;
    const g = player === 1 ? game1 : game2;
    const traitContainerId = player === 1 ? 'pk-active-traits-p1' : 'pk-active-traits-p2';
    const choices = ts.getChoices(3);

    ui.showPKSingleTraitChoice(player, choices, (trait) => {
        ts.applyTrait(trait, g);
        ui.updateActiveTraits(ts.activeTraits, traitContainerId);
        ui.hidePKTraitOverlay(player);
        g.traitPending = false;
        lastTime = performance.now();
    });
}

function handlePKGameOver(winner) {
    if (animationId) cancelAnimationFrame(animationId);
    if (renderer1) renderer1.render();
    if (renderer2) renderer2.render();

    ui.showPKGameOver(
        winner,
        { score: game1.score, lines: game1.lines, level: game1.level },
        { score: game2.score, lines: game2.lines, level: game2.level },
        traitSystem1.activeTraits,
        traitSystem2.activeTraits
    );
}

// ===================== INPUT =====================

function handleKeyDown(e) {
    if (e.repeat) return;

    if (gameMode === 'single') {
        handleSingleKeyDown(e);
    } else if (gameMode === 'pk') {
        handlePKKeyDown(e);
    } else if (gameMode === 'online') {
        handleOnlineKeyDown(e);
    }
}

function handleKeyUp(e) {
    keys[e.code] = false;
    delete keyTimers[e.code];
}

// --- Single player input ---

function handleSingleKeyDown(e) {
    if (game && game.gameOver && !document.getElementById('gameover-screen').classList.contains('hidden')) return;

    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyC','KeyP'].includes(e.code)) {
        e.preventDefault();
    }

    keys[e.code] = true;

    switch (e.code) {
        case 'ArrowUp':
            if (!game.paused && !game.traitPending) game.rotate(1);
            break;
        case 'Space':
            if (!game.paused && !game.traitPending) game.hardDrop();
            break;
        case 'KeyC':
            if (!game.paused && !game.traitPending) {
                game.hold();
                const holdTrait = traitSystem.activeTraits.find(t => t.id === 'hold_master');
                if (holdTrait && holdTrait.modifyHold) holdTrait.modifyHold(game);
            }
            break;
        case 'KeyP':
            togglePause();
            break;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.code)) {
        executeSingleKeyAction(e.code);
        keyTimers[e.code] = { start: performance.now(), repeating: false };
    }
}

function executeSingleKeyAction(code) {
    if (game.paused || game.traitPending) return;
    switch (code) {
        case 'ArrowLeft': game.move(-1); break;
        case 'ArrowRight': game.move(1); break;
        case 'ArrowDown': game.softDrop(); break;
    }
}

function processSingleHeldKeys(time) {
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowDown']) {
        if (!keys[code] || !keyTimers[code]) continue;
        const timer = keyTimers[code];
        const elapsed = time - timer.start;
        const isDown = code === 'ArrowDown';
        const delay = isDown ? 0 : keyRepeatDelay;
        const rate = isDown ? softDropRate : keyRepeatRate;

        if (!timer.repeating && elapsed >= delay) {
            timer.repeating = true;
            timer.lastRepeat = time;
            executeSingleKeyAction(code);
        } else if (timer.repeating && time - timer.lastRepeat >= rate) {
            timer.lastRepeat = time;
            executeSingleKeyAction(code);
        }
    }
}

// --- PK input ---

// P1: WASD + Space + ShiftLeft
// P2: Arrows + Numpad0 + NumpadDecimal
const P1_MAP = {
    'KeyA': 'left', 'KeyD': 'right', 'KeyW': 'rotate',
    'KeyS': 'softDrop', 'Space': 'hardDrop', 'ShiftLeft': 'hold'
};
const P2_MAP = {
    'ArrowLeft': 'left', 'ArrowRight': 'right', 'ArrowUp': 'rotate',
    'ArrowDown': 'softDrop', 'Numpad0': 'hold', 'NumpadDecimal': 'hold'
};

const P1_REPEAT_KEYS = ['KeyA', 'KeyD', 'KeyS'];
const P2_REPEAT_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowDown'];

function handlePKKeyDown(e) {
    const allPKKeys = [...Object.keys(P1_MAP), ...Object.keys(P2_MAP), 'KeyP'];
    if (allPKKeys.includes(e.code)) e.preventDefault();

    keys[e.code] = true;

    if (e.code === 'KeyP') {
        togglePKPause();
        return;
    }

    // P1
    if (P1_MAP[e.code]) {
        const action = P1_MAP[e.code];
        if (P1_REPEAT_KEYS.includes(e.code)) {
            executePKAction(game1, traitSystem1, action);
            keyTimers[e.code] = { start: performance.now(), repeating: false };
        } else {
            executePKAction(game1, traitSystem1, action);
        }
    }

    // P2
    if (P2_MAP[e.code]) {
        const action = P2_MAP[e.code];
        if (P2_REPEAT_KEYS.includes(e.code)) {
            executePKAction(game2, traitSystem2, action);
            keyTimers[e.code] = { start: performance.now(), repeating: false };
        } else {
            executePKAction(game2, traitSystem2, action);
        }
    }
}

function executePKAction(g, ts, action) {
    if (g.paused || g.traitPending || g.gameOver) return;
    switch (action) {
        case 'left': g.move(-1); break;
        case 'right': g.move(1); break;
        case 'rotate': g.rotate(1); break;
        case 'softDrop': g.softDrop(); break;
        case 'hardDrop': g.hardDrop(); break;
        case 'hold':
            g.hold();
            const holdTrait = ts.activeTraits.find(t => t.id === 'hold_master');
            if (holdTrait && holdTrait.modifyHold) holdTrait.modifyHold(g);
            break;
    }
}

function processPKHeldKeys(time) {
    // P1
    for (const code of P1_REPEAT_KEYS) {
        if (!keys[code] || !keyTimers[code]) continue;
        const timer = keyTimers[code];
        const elapsed = time - timer.start;
        const action = P1_MAP[code];
        const isSoftDrop = action === 'softDrop';
        const delay = isSoftDrop ? 0 : keyRepeatDelay;
        const rate = isSoftDrop ? softDropRate : keyRepeatRate;

        if (!timer.repeating && elapsed >= delay) {
            timer.repeating = true;
            timer.lastRepeat = time;
            executePKAction(game1, traitSystem1, action);
        } else if (timer.repeating && time - timer.lastRepeat >= rate) {
            timer.lastRepeat = time;
            executePKAction(game1, traitSystem1, action);
        }
    }

    // P2
    for (const code of P2_REPEAT_KEYS) {
        if (!keys[code] || !keyTimers[code]) continue;
        const timer = keyTimers[code];
        const elapsed = time - timer.start;
        const action = P2_MAP[code];
        const isSoftDrop = action === 'softDrop';
        const delay = isSoftDrop ? 0 : keyRepeatDelay;
        const rate = isSoftDrop ? softDropRate : keyRepeatRate;

        if (!timer.repeating && elapsed >= delay) {
            timer.repeating = true;
            timer.lastRepeat = time;
            executePKAction(game2, traitSystem2, action);
        } else if (timer.repeating && time - timer.lastRepeat >= rate) {
            timer.lastRepeat = time;
            executePKAction(game2, traitSystem2, action);
        }
    }
}

// --- Pause ---

function togglePause() {
    if (!game || game.traitPending) return;
    if (game.paused) {
        resumeGame();
    } else {
        game.paused = true;
        ui.showOverlay('pause');
    }
}

function togglePKPause() {
    if (!game1 || !game2) return;
    if (game1.traitPending || game2.traitPending) return;
    if (game1.paused) {
        game1.paused = false;
        game2.paused = false;
        ui.hideOverlay('pause');
        lastTime = performance.now();
    } else {
        game1.paused = true;
        game2.paused = true;
        ui.showOverlay('pause');
    }
}

function resumeGame() {
    if (gameMode === 'single') {
        game.paused = false;
    } else if (gameMode === 'pk') {
        game1.paused = false;
        game2.paused = false;
    } else if (gameMode === 'online') {
        if (localGame) localGame.paused = false;
    }
    ui.hideOverlay('pause');
    lastTime = performance.now();
}

// ===================== ONLINE MODE =====================

function getServerUrl() {
    const loc = window.location;
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return wsProto + '//' + loc.host;
}

function showOnlineLobby() {
    if (isMobile) {
        // Show as modal overlay on top of start screen
        document.getElementById('online-lobby-screen').classList.remove('hidden');
    } else {
        ui.showScreen('online-lobby');
    }
    ui.hideLobbyStatus();
    document.getElementById('room-code-display').classList.add('hidden');
    document.getElementById('join-code-input').value = '';
}

async function createOnlineRoom() {
    ui.showLobbyStatus('正在连接服务器...', '');
    try {
        networkManager = new NetworkManager();
        await networkManager.connect(getServerUrl());
        setupNetworkCallbacks();
        networkManager.createRoom();
    } catch (err) {
        ui.showLobbyStatus('连接失败: ' + err.message, 'error');
    }
}

async function joinOnlineRoom(code) {
    if (!code || code.trim().length === 0) {
        ui.showLobbyStatus('请输入房间代码', 'error');
        return;
    }
    ui.showLobbyStatus('正在连接服务器...', '');
    try {
        networkManager = new NetworkManager();
        await networkManager.connect(getServerUrl());
        setupNetworkCallbacks();
        networkManager.joinRoom(code.trim().toUpperCase());
    } catch (err) {
        ui.showLobbyStatus('连接失败: ' + err.message, 'error');
    }
}

function setupNetworkCallbacks() {
    networkManager.onRoomCreated = (code) => {
        ui.showRoomCode(code);
        ui.showLobbyStatus('等待对手加入...', '');
    };

    networkManager.onOpponentJoined = () => {
        ui.showLobbyStatus('对手已加入! 准备开始...', 'success');
        // Auto-ready after short delay
        setTimeout(() => {
            if (networkManager) networkManager.sendReady();
        }, 500);
    };

    networkManager.onGameStart = () => {
        startOnlineGame();
    };

    networkManager.onStateUpdate = (data) => {
        if (remoteProxy) remoteProxy.updateFromNetwork(data);
    };

    networkManager.onAttack = (action, args) => {
        if (!localGame) return;
        if (action === 'addGarbageRow') localGame.addGarbageRow();
        if (action === 'addRandomBlocks') localGame.addRandomBlocks(args[0]);
        if (action === 'expandBoard') localGame.expandBoard(args[0]);
    };

    networkManager.onOpponentGameOver = () => {
        handleOnlineGameOver(true);
    };

    networkManager.onOpponentDisconnected = () => {
        if (animationId) cancelAnimationFrame(animationId);
        if (networkManager) networkManager.stopStateSync();
        ui.showOverlay('onlineDisconnect');
    };

    networkManager.onOpponentTraitSelected = (traitId) => {
        const trait = ALL_TRAITS.find(t => t.id === traitId);
        if (trait) {
            remoteTraits.push(trait);
            ui.updateActiveTraits(remoteTraits, 'ol-active-traits-remote');
        }
    };

    networkManager.onError = (message) => {
        ui.showLobbyStatus(message, 'error');
    };
}

function startOnlineGame() {
    const cs = getMobileCellSize(10, 20);
    localGame = new TetrisGame(cs);
    localTraitSystem = new TraitSystem();
    remoteProxy = new RemoteGameProxy();
    remoteTraits = [];

    // Set opponent to a network proxy that sends attacks over the wire
    localGame.opponent = {
        addGarbageRow() {
            if (networkManager) networkManager.sendAttack('addGarbageRow');
        },
        addRandomBlocks(count) {
            if (networkManager) networkManager.sendAttack('addRandomBlocks', [count]);
        },
        expandBoard(extra) {
            if (networkManager) networkManager.sendAttack('expandBoard', [extra]);
        }
    };

    localGame.onTraitReady = () => {
        localGame.traitPending = true;
        showOnlineTraitSelection();
    };

    localGame.onGameOver = () => {
        if (localGame.gameWon) return; // win handled by onGameWin
        if (networkManager) {
            networkManager.sendGameOver();
            networkManager.stopStateSync();
        }
        handleOnlineGameOver(false);
    };

    localGame.onGameWin = () => {
        if (networkManager) {
            networkManager.sendGameOver(); // tell opponent we finished (they lose)
            networkManager.stopStateSync();
        }
        handleOnlineGameOver(true);
    };

    localGame.onScoreChange = () => localRenderer && localRenderer.updateStats();

    ui.showScreen('online-game');
    ui.hideAllOverlays();
    ui.updateActiveTraits([], 'ol-active-traits-local');
    ui.updateActiveTraits([], 'ol-active-traits-remote');

    localRenderer = new GameRenderer(localGame, {
        canvasId: 'ol-canvas-local',
        holdCanvasId: 'ol-hold-canvas-local',
        nextContainerId: 'ol-next-pieces-local',
        statIds: {
            score: 'ol-score-local', level: 'ol-level-local', lines: 'ol-lines-local',
            progress: 'ol-trait-progress-local', progressText: 'ol-trait-progress-text-local'
        }
    });

    remoteRenderer = new GameRenderer(remoteProxy, {
        canvasId: 'ol-canvas-remote',
        holdCanvasId: 'ol-hold-canvas-remote',
        nextContainerId: 'ol-next-pieces-remote',
        statIds: {
            score: 'ol-score-remote', level: 'ol-level-remote', lines: 'ol-lines-remote',
            progress: 'ol-trait-progress-remote', progressText: 'ol-trait-progress-text-remote'
        }
    });

    localRenderer.render();
    remoteRenderer.render();

    if (isMobile) initTouchControls(localGame, localTraitSystem, toggleOnlinePause);

    // Start syncing local state to opponent
    networkManager.startStateSync(localGame);

    lastTime = performance.now();
    if (animationId) cancelAnimationFrame(animationId);
    onlineGameLoop(lastTime);
}

function onlineGameLoop(time) {
    const dt = time - lastTime;
    lastTime = time;

    processOnlineHeldKeys(time);

    localGame.update(dt);
    localGame.updateLineClearer(dt);

    if (localRenderer) localRenderer.render();
    if (remoteRenderer) remoteRenderer.render();

    if (!localGame.gameOver) {
        animationId = requestAnimationFrame(onlineGameLoop);
    }
}

function showOnlineTraitSelection() {
    const choices = localTraitSystem.getChoices(3);
    ui.showOnlineTraitChoice(choices, (trait) => {
        localTraitSystem.applyTrait(trait, localGame);
        ui.updateActiveTraits(localTraitSystem.activeTraits, 'ol-active-traits-local');
        ui.hideOnlineTraitOverlay();
        localGame.traitPending = false;
        lastTime = performance.now();
        if (networkManager) networkManager.sendTraitSelected(trait.id);
    });
}

function handleOnlineGameOver(localWin) {
    if (animationId) cancelAnimationFrame(animationId);
    if (localRenderer) localRenderer.render();
    if (remoteRenderer) remoteRenderer.render();
    if (networkManager) networkManager.stopStateSync();

    const localStats = { score: localGame.score, lines: localGame.lines, level: localGame.level };
    const remoteStats = { score: remoteProxy.score, lines: remoteProxy.lines, level: remoteProxy.level };

    ui.showOnlineGameOver(localWin, localStats, remoteStats);
}

// --- Online input (same keys as single player) ---

function handleOnlineKeyDown(e) {
    if (!localGame || localGame.gameOver) return;

    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyC','KeyP'].includes(e.code)) {
        e.preventDefault();
    }

    keys[e.code] = true;

    switch (e.code) {
        case 'ArrowUp':
            if (!localGame.paused && !localGame.traitPending) localGame.rotate(1);
            break;
        case 'Space':
            if (!localGame.paused && !localGame.traitPending) localGame.hardDrop();
            break;
        case 'KeyC':
            if (!localGame.paused && !localGame.traitPending) {
                localGame.hold();
                const holdTrait = localTraitSystem.activeTraits.find(t => t.id === 'hold_master');
                if (holdTrait && holdTrait.modifyHold) holdTrait.modifyHold(localGame);
            }
            break;
        case 'KeyP':
            toggleOnlinePause();
            break;
    }

    if (['ArrowLeft', 'ArrowRight', 'ArrowDown'].includes(e.code)) {
        executeOnlineKeyAction(e.code);
        keyTimers[e.code] = { start: performance.now(), repeating: false };
    }
}

function executeOnlineKeyAction(code) {
    if (!localGame || localGame.paused || localGame.traitPending) return;
    switch (code) {
        case 'ArrowLeft': localGame.move(-1); break;
        case 'ArrowRight': localGame.move(1); break;
        case 'ArrowDown': localGame.softDrop(); break;
    }
}

function processOnlineHeldKeys(time) {
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowDown']) {
        if (!keys[code] || !keyTimers[code]) continue;
        const timer = keyTimers[code];
        const elapsed = time - timer.start;
        const isDown = code === 'ArrowDown';
        const delay = isDown ? 0 : keyRepeatDelay;
        const rate = isDown ? softDropRate : keyRepeatRate;

        if (!timer.repeating && elapsed >= delay) {
            timer.repeating = true;
            timer.lastRepeat = time;
            executeOnlineKeyAction(code);
        } else if (timer.repeating && time - timer.lastRepeat >= rate) {
            timer.lastRepeat = time;
            executeOnlineKeyAction(code);
        }
    }
}

function toggleOnlinePause() {
    if (!localGame || localGame.traitPending) return;
    if (localGame.paused) {
        localGame.paused = false;
        ui.hideOverlay('pause');
        lastTime = performance.now();
    } else {
        localGame.paused = true;
        ui.showOverlay('pause');
    }
}

// Start
document.addEventListener('DOMContentLoaded', init);
