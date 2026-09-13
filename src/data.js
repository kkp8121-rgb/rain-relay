const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

export const COLORS = freeze({
  0: { mask: 0, name: '맑은 이슬', hex: 0xc8f7f0, css: '#c8f7f0' },
  1: { mask: 1, name: '붉은 빛', hex: 0xff5f69, css: '#ff5f69' },
  2: { mask: 2, name: '초록 빛', hex: 0x66d68a, css: '#66d68a' },
  3: { mask: 3, name: '노란 빛', hex: 0xffd65a, css: '#ffd65a' },
  4: { mask: 4, name: '푸른 빛', hex: 0x5f9fff, css: '#5f9fff' },
  5: { mask: 5, name: '자홍 빛', hex: 0xec6de5, css: '#ec6de5' },
  6: { mask: 6, name: '청록 빛', hex: 0x5de1dc, css: '#5de1dc' },
  7: { mask: 7, name: '별빛', hex: 0xf4f2dc, css: '#f4f2dc' }
});

export const DIRECTIONS = freeze([[0, -1], [1, 0], [0, 1], [-1, 0]]);

export const RULES = freeze({
  gridSize: 7, cellSize: 1.25, tickSeconds: 0.32, sourceIntervalTicks: 2,
  leakLimit: 3, maxTicks: 100
});

export const PIECES = freeze({
  straight: { id: 'straight', name: '직선', cost: 1 },
  elbow: { id: 'elbow', name: '꺾임', cost: 1 },
  splitter: { id: 'splitter', name: '분기기', cost: 2 },
  bridge: { id: 'bridge', name: '브리지', cost: 3 }
});

export function indexOf(x, z) {
  return Number.isInteger(x) && Number.isInteger(z) && x >= 0 && x < RULES.gridSize && z >= 0 && z < RULES.gridSize ? z * RULES.gridSize + x : -1;
}

export function ports(kind, rot = 0) {
  const r = ((rot % 4) + 4) % 4;
  if (kind === 'straight') return [r, (r + 2) % 4];
  if (kind === 'elbow') return [r, (r + 1) % 4];
  if (kind === 'splitter') return [(r + 2) % 4, (r + 3) % 4, (r + 1) % 4];
  if (kind === 'bridge') return [0, 1, 2, 3];
  if (kind === 'source' || kind === 'sink') return [r];
  if (kind === 'flower') return [(r + 2) % 4, r];
  if (kind === 'rock') return [];
  return [];
}

const fixed = (x, z, kind, rot, extra = {}) => ({ x, z, kind, rot, fixed: true, ...extra });
const piece = (x, z, kind, rot) => ({ x, z, kind, rot });

export const LEVELS = freeze([
  {
    id: 'first-dew', title: '첫 물길', owner: '아이리스', ownerAge: 61, portraitIndex: 1,
    intro: '첫 정원에서는 물이 갈 길만 정확히 이어 보세요.', outro: '첫 이슬이 수집기에 도착했습니다.', budget: 7, par: 5, supply: 6,
    fixed: [fixed(0, 3, 'source', 1), fixed(6, 3, 'sink', 3, { mask: 0, need: 2 }), fixed(2, 1, 'rock', 0), fixed(4, 5, 'rock', 0)],
    solution: [piece(1, 3, 'straight', 1), piece(2, 3, 'straight', 1), piece(3, 3, 'straight', 1), piece(4, 3, 'straight', 1), piece(5, 3, 'straight', 1)],
    unlockedTools: ['straight', 'elbow'], requirements: [{ x: 6, z: 3, mask: 0, need: 2 }]
  },
  {
    id: 'red-memory', title: '붉은 꽃의 기억', owner: '아이리스', ownerAge: 61, portraitIndex: 1,
    intro: '붉은 꽃의 빛을 꺾어 위쪽 수집기로 보내세요.', outro: '붉은 기억이 물길을 따라 다시 피어났습니다.', budget: 11, par: 8, supply: 6,
    fixed: [fixed(0, 5, 'source', 1), fixed(3, 2, 'flower', 0, { mask: 1 }), fixed(5, 0, 'sink', 3, { mask: 1, need: 2 }), fixed(1, 2, 'rock', 0), fixed(2, 2, 'rock', 0), fixed(4, 4, 'rock', 0), fixed(5, 4, 'rock', 0)],
    solution: [piece(1, 5, 'straight', 1), piece(2, 5, 'straight', 1), piece(3, 5, 'elbow', 3), piece(3, 4, 'straight', 0), piece(3, 3, 'straight', 0), piece(3, 1, 'straight', 0), piece(3, 0, 'elbow', 1), piece(4, 0, 'straight', 1)],
    unlockedTools: ['straight', 'elbow'], requirements: [{ x: 5, z: 0, mask: 1, need: 2 }]
  },
  {
    id: 'sunlight-recipe', title: '햇빛의 조합', owner: '율', ownerAge: 26, portraitIndex: 2,
    intro: '붉은 빛과 초록 빛을 섞어 노란빛을 만드세요. 푸른 꽃은 우회해야 합니다.', outro: '두 꽃의 빛이 햇빛의 조합으로 완성되었습니다.', budget: 12, par: 9, supply: 7,
    fixed: [fixed(0, 1, 'source', 1), fixed(2, 1, 'flower', 1, { mask: 1 }), fixed(4, 4, 'flower', 2, { mask: 2 }), fixed(1, 6, 'sink', 1, { mask: 3, need: 3 }), fixed(2, 4, 'flower', 1, { mask: 4 }), fixed(2, 3, 'rock', 0), fixed(3, 3, 'rock', 0), fixed(5, 2, 'rock', 0), fixed(5, 5, 'rock', 0)],
    solution: [piece(1, 1, 'straight', 1), piece(3, 1, 'straight', 1), piece(4, 1, 'elbow', 2), piece(4, 2, 'straight', 2), piece(4, 3, 'straight', 2), piece(4, 5, 'straight', 2), piece(4, 6, 'elbow', 3), piece(3, 6, 'straight', 3), piece(2, 6, 'straight', 3)],
    unlockedTools: ['straight', 'elbow'], requirements: [{ x: 1, z: 6, mask: 3, need: 3 }]
  },
  {
    id: 'two-canals', title: '두 정원으로', owner: '율', ownerAge: 26, portraitIndex: 2,
    intro: '분기기는 물방울을 복제하지 않고 번갈아 좌우로 보냅니다.', outro: '두 수로가 각각의 빛을 지켜 수집기에 닿았습니다.', budget: 14, par: 11, supply: 8,
    fixed: [fixed(3, 6, 'source', 0), fixed(1, 2, 'flower', 0, { mask: 1 }), fixed(5, 2, 'flower', 0, { mask: 4 }), fixed(1, 0, 'sink', 2, { mask: 1, need: 2 }), fixed(5, 0, 'sink', 2, { mask: 4, need: 2 }), fixed(3, 2, 'rock', 0), fixed(3, 1, 'rock', 0)],
    solution: [piece(3, 5, 'straight', 0), piece(3, 4, 'splitter', 0), piece(2, 4, 'straight', 1), piece(1, 4, 'elbow', 0), piece(1, 3, 'straight', 0), piece(1, 1, 'straight', 0), piece(4, 4, 'straight', 1), piece(5, 4, 'elbow', 3), piece(5, 3, 'straight', 0), piece(5, 1, 'straight', 0)],
    unlockedTools: ['straight', 'elbow', 'splitter'], requirements: [{ x: 1, z: 0, mask: 1, need: 2 }, { x: 5, z: 0, mask: 4, need: 2 }]
  },
  {
    id: 'crossing-rain', title: '엇갈린 빗방울', owner: '대', ownerAge: 44, portraitIndex: 3,
    intro: '교차점에서는 브리지로 두 색의 물길을 분리하고, 분기기는 물을 아껴 씁니다.', outro: '교차하던 빗물이 서로의 색을 지킨 채 정원에 도착했습니다.', budget: 23, par: 19, supply: 10,
    fixed: [fixed(0, 5, 'source', 1), fixed(2, 5, 'flower', 1, { mask: 2 }), fixed(3, 1, 'flower', 0, { mask: 1 }), fixed(1, 3, 'flower', 3, { mask: 4 }), fixed(5, 1, 'sink', 0, { mask: 3, need: 3 }), fixed(0, 3, 'sink', 1, { mask: 6, need: 3 }), fixed(1, 1, 'rock', 0), fixed(1, 6, 'rock', 0), fixed(6, 1, 'rock', 0), fixed(6, 5, 'rock', 0)],
    solution: [piece(1, 5, 'straight', 1), piece(3, 5, 'splitter', 1), piece(3, 4, 'straight', 0), piece(3, 3, 'bridge', 0), piece(3, 2, 'straight', 0), piece(3, 0, 'elbow', 1), piece(4, 0, 'straight', 1), piece(5, 0, 'elbow', 2), piece(3, 6, 'elbow', 0), piece(4, 6, 'straight', 1), piece(5, 6, 'elbow', 3), piece(5, 5, 'straight', 0), piece(5, 4, 'straight', 0), piece(5, 3, 'elbow', 2), piece(4, 3, 'straight', 1), piece(2, 3, 'straight', 1)],
    unlockedTools: ['straight', 'elbow', 'splitter', 'bridge'], requirements: [{ x: 5, z: 1, mask: 3, need: 3 }, { x: 0, z: 3, mask: 6, need: 3 }]
  },
  {
    id: 'rain-without-clouds', title: '구름 없이 내리는 비', owner: '대', ownerAge: 44, portraitIndex: 3,
    intro: '세 갈래의 빛을 보존하며 맑은 이슬, 자홍빛, 별빛 수집기를 채우세요.', outro: '구름 없이 내린 비가 세 수로의 정원을 모두 깨웠습니다.', budget: 20, par: 17, supply: 12,
    fixed: [fixed(0, 3, 'source', 1), fixed(2, 4, 'flower', 2, { mask: 1 }), fixed(4, 5, 'flower', 1, { mask: 4 }), fixed(5, 3, 'flower', 0, { mask: 2 }), fixed(0, 1, 'sink', 1, { mask: 0, need: 2 }), fixed(2, 6, 'sink', 1, { mask: 5, need: 2 }), fixed(3, 1, 'sink', 1, { mask: 7, need: 2 }), fixed(0, 6, 'rock', 0), fixed(6, 2, 'rock', 0), fixed(3, 3, 'rock', 0)],
    solution: [piece(1, 3, 'straight', 1), piece(2, 3, 'splitter', 1), piece(2, 2, 'straight', 0), piece(2, 1, 'elbow', 2), piece(1, 1, 'straight', 1), piece(2, 5, 'elbow', 0), piece(3, 5, 'straight', 1), piece(5, 5, 'splitter', 1), piece(5, 6, 'elbow', 3), piece(4, 6, 'straight', 1), piece(3, 6, 'straight', 1), piece(5, 4, 'straight', 0), piece(5, 2, 'straight', 0), piece(5, 1, 'elbow', 2), piece(4, 1, 'straight', 1)],
    unlockedTools: ['straight', 'elbow', 'splitter', 'bridge'], requirements: [{ x: 0, z: 1, mask: 0, need: 2 }, { x: 2, z: 6, mask: 5, need: 2 }, { x: 3, z: 1, mask: 7, need: 2 }]
  }
]);

export function getLevel(id) {
  return LEVELS.find((level) => level.id === id) || null;
}
