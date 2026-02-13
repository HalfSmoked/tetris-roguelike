// ===== 词条系统 =====

const TRAIT_TYPES = {
    ATTACK: 'attack',
    DEFENSE: 'defense',
    MUTATE: 'mutate',
    CURSE: 'curse'
};

const ALL_TRAITS = [
    {
        id: 'blast_expert',
        name: '爆破专家',
        icon: '💥',
        type: TRAIT_TYPES.ATTACK,
        typeName: '攻击',
        desc: '消除2行+时，额外清除底部1行（PK：给对手添加1行垃圾）',
        apply(game) {
            game.blastExpert = true;
        }
    },
    {
        id: 'line_clearer',
        name: '行清除器',
        icon: '🧹',
        type: TRAIT_TYPES.ATTACK,
        typeName: '攻击',
        desc: '每60秒自动清除底部一行（PK：给对手添加一行垃圾）',
        apply(game) {
            game.lineClearerActive = true;
            game.lineClearerTimer = 0;
        }
    },
    {
        id: 'crusher',
        name: '粉碎者',
        icon: '🔨',
        type: TRAIT_TYPES.ATTACK,
        typeName: '攻击',
        desc: '每次落地给对手添加2个随机方块（仅对战生效）',
        apply(game) {
            game.crusher = true;
        }
    },
    {
        id: 'slow_time',
        name: '缓慢时光',
        icon: '🕐',
        type: TRAIT_TYPES.DEFENSE,
        typeName: '防御',
        desc: '方块下落速度降低20%',
        apply(game) {
            game.speedMultiplier *= 0.8;
            game.updateSpeed();
        }
    },
    {
        id: 'extra_space',
        name: '空间膨胀',
        icon: '↔️',
        type: TRAIT_TYPES.ATTACK,
        typeName: '攻击',
        desc: '自己棋盘+2列更易消行（PK：给对手棋盘+2列增加难度）',
        apply(game) {
            if (game.opponent) {
                game.opponent.expandBoard(2);
            } else {
                game.resizeBoard(game.cols + 2);
            }
        }
    },
    {
        id: 'safety_net',
        name: '安全网',
        icon: '🛡️',
        type: TRAIT_TYPES.DEFENSE,
        typeName: '防御',
        desc: '方块堆到顶部时，自动清除最上面3行（每局1次）',
        apply(game) {
            game.safetyNet = true;
            game.safetyNetCount = (game.safetyNetCount || 0) + 1;
        }
    },
    {
        id: 'lucky_dice',
        name: '幸运骰子',
        icon: '🎲',
        type: TRAIT_TYPES.MUTATE,
        typeName: '变异',
        desc: '50%概率下一个方块变为I型长条',
        apply(game) {
            game.luckyDice = true;
        }
    },
    {
        id: 'foresight',
        name: '预知未来',
        icon: '🔮',
        type: TRAIT_TYPES.MUTATE,
        typeName: '变异',
        desc: '可以预览接下来3个方块（默认1个）',
        apply(game) {
            game.nextCount = 3;
        }
    },
    {
        id: 'hold_master',
        name: 'Hold大师',
        icon: '✋',
        type: TRAIT_TYPES.MUTATE,
        typeName: '变异',
        desc: '暂存不再有次数限制，可随时切换',
        apply(game) {
            game.maxHold = 999;
        },
        modifyHold(game) {
            game.holdUsed = false;
        }
    },
    {
        id: 'gambler',
        name: '赌徒',
        icon: '🎰',
        type: TRAIT_TYPES.CURSE,
        typeName: '诅咒',
        desc: '得分x1.5，但速度也x1.5',
        apply(game) {
            game.scoreMultiplier *= 1.5;
            game.speedMultiplier *= 1.5;
            game.updateSpeed();
        }
    },
    {
        id: 'chaos',
        name: '混沌',
        icon: '🌀',
        type: TRAIT_TYPES.CURSE,
        typeName: '诅咒',
        desc: '得分x2，但方块落地后颜色随机化',
        apply(game) {
            game.scoreMultiplier *= 2;
            game.chaos = true;
        }
    },
    {
        id: 'narrow_path',
        name: '窄路',
        icon: '📏',
        type: TRAIT_TYPES.CURSE,
        typeName: '诅咒',
        desc: '棋盘宽度-2列，但得分x3',
        apply(game) {
            game.scoreMultiplier *= 3;
            game.resizeBoard(Math.max(6, game.cols - 2));
        }
    },
];

class TraitSystem {
    constructor() {
        this.activeTraits = [];
    }

    reset() {
        this.activeTraits = [];
    }

    getChoices(count = 3) {
        const activeIds = new Set(this.activeTraits.map(t => t.id));
        const nonStackable = new Set(['extra_space', 'narrow_path', 'foresight', 'hold_master', 'lucky_dice', 'crusher', 'chaos']);
        const available = ALL_TRAITS.filter(t => {
            if (nonStackable.has(t.id) && activeIds.has(t.id)) return false;
            return true;
        });

        const shuffled = [...available];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }

    applyTrait(trait, game) {
        this.activeTraits.push(trait);
        trait.apply(game);
    }
}
