// Builder V2 core — socket-driven placement engine mirroring the in-game editor.
// Data source: parts_v2.json = the game's own CompartmentsDatabase (cells, sockets,
// groups, limits) extracted verbatim. No name-parsing anywhere.
import partsV2 from './data/parts_v2.json'
import meshIndex from './data/mesh_index_v3.json' // v3 = real UVs + albedo textures

export const GROUP_LIMITS = partsV2.groupLimits // { REACTOR:1, STEERING:1, CAPTAIN:1 }
export const SOCKET_STATES = partsV2.socketStates // slotType -> state -> spawned entity
export const PARTS = partsV2.parts.filter((p) => p.enabled)
// All parts incl. ones the game currently has disabled (not yet enabled). The locker
// shows these too, marked, so the catalogue is complete; validation/essentials use PARTS.
export const ALL_PARTS = partsV2.parts
export const PART_BY_ID = Object.fromEntries(partsV2.parts.map((p) => [p.id, p]))
export const MESH_INDEX = meshIndex

export const CELL_XZ = meshIndex._cell || 4 // metres per grid cell (derived from meshes)
export const CELL_Y = 3.07 // metres per deck level (room height, measured from meshes)
export const MEMBER_LIMIT = 6 // hardcoded in game code (round-3 finding)

// grid bounds (the in-game editor grid; generous — exact size is runtime data)
export const GRID = { x: 13, zMin: -13, zMax: 13, yMax: 9 } // |x| <= 13 etc.

export const DIRS = {
  Left: [-1, 0, 0],
  Right: [1, 0, 0],
  Up: [0, 1, 0],
  Down: [0, -1, 0],
  Forward: [0, 0, 1],
  Back: [0, 0, -1],
}
const ROT_CYCLE = ['Forward', 'Right', 'Back', 'Left'] // 90° steps about Y

export function rotDir(dir, rot) {
  const i = ROT_CYCLE.indexOf(dir)
  if (i === -1) return dir // Up/Down unchanged
  return ROT_CYCLE[(i + rot) % 4]
}
export function rotCell([x, y, z], rot) {
  switch (((rot % 4) + 4) % 4) {
    case 1: return [z, y, -x]
    case 2: return [-x, y, -z]
    case 3: return [-z, y, x]
    default: return [x, y, z]
  }
}

export function cellKey(x, y, z) {
  return `${x},${y},${z}`
}

// world cells of a placement: [{x,y,z, vol, sup, sockets:{WorldDir:[{t,e,sn}]}}]
export function worldCells(part, px, py, pz, rot) {
  return part.cells.map((c) => {
    const [x, y, z] = rotCell(c.p, rot)
    const sockets = {}
    for (const [d, ss] of Object.entries(c.s)) sockets[rotDir(d, rot)] = ss
    return {
      x: x + px, y: y + py, z: z + pz,
      vol: !c.noVol, sup: !!c.sup, sockets,
      local: c.p,
    }
  })
}

export function buildOccupancy(state) {
  const occ = new Map() // key -> {plId, vol, sockets}
  const ch = PART_BY_ID[state.chassisId]
  if (ch) {
    for (const c of worldCells(ch, 0, 0, 0, 0)) {
      occ.set(cellKey(c.x, c.y, c.z), { plId: '_chassis', vol: c.vol, sockets: c.sockets })
    }
  }
  for (const pl of state.placements) {
    const part = PART_BY_ID[pl.partId]
    if (!part) continue
    for (const c of worldCells(part, pl.x, pl.y, pl.z, pl.rot)) {
      occ.set(cellKey(c.x, c.y, c.z), { plId: pl.id, vol: c.vol, sockets: c.sockets })
    }
  }
  return occ
}

const OPP = { Left: 'Right', Right: 'Left', Up: 'Down', Down: 'Up', Forward: 'Back', Back: 'Forward' }

function facesConnect(mySockets, theirSockets) {
  if (!mySockets || !theirSockets) return false
  const mine = new Set(mySockets.map((s) => s.t))
  return theirSockets.some((s) => mine.has(s.t))
}

// Validate placement. Returns { ok, reason }
export function validate(state, occ, partId, px, py, pz, rot, ignoreId = null) {
  const part = PART_BY_ID[partId]
  if (!part) return { ok: false, reason: 'unknown part' }
  const cells = worldCells(part, px, py, pz, rot)

  for (const c of cells) {
    if (Math.abs(c.x) > GRID.x || c.z < GRID.zMin || c.z > GRID.zMax || c.y < 0 || c.y > GRID.yMax) {
      // Non-solid clearance may poke out the top OR hang below the floor — e.g. an
      // entrance's ladder clearance runs down the outside of the hull (y < 0).
      if (!c.vol && (c.y > GRID.yMax || c.y < 0)) continue
      return { ok: false, reason: 'outside build grid' }
    }
    const own = occ.get(cellKey(c.x, c.y, c.z))
    if (own && own.plId !== ignoreId) return { ok: false, reason: 'cell occupied' }
  }

  // group limits (REACTOR/STEERING/CAPTAIN = 1)
  for (const g of part.groups) {
    const lim = GROUP_LIMITS[g]
    if (lim != null) {
      const count = state.placements.filter(
        (pl) => pl.id !== ignoreId && PART_BY_ID[pl.partId]?.groups.includes(g),
      ).length
      if (count + 1 > lim) return { ok: false, reason: `${g} limit (${lim}) reached` }
    }
  }

  // support + connectivity (socket-driven, mirrors EditorGrid neighbour checks)
  let connected = false
  let supportOk = true
  for (const c of cells) {
    const below = occ.get(cellKey(c.x, c.y - 1, c.z))
    const belowMine = below && below.plId !== ignoreId
    const hasVolBelow = belowMine && below.vol
    if (hasVolBelow) connected = true
    let faceConn = false
    for (const [dir, vec] of Object.entries(DIRS)) {
      const n = occ.get(cellKey(c.x + vec[0], c.y + vec[1], c.z + vec[2]))
      if (!n || n.plId === ignoreId) continue
      if (facesConnect(c.sockets[dir], n.sockets?.[OPP[dir]])) {
        connected = true
        faceConn = true
      }
    }
    if (c.sup && !hasVolBelow && !faceConn) supportOk = false
  }
  if (!connected) return { ok: false, reason: 'no connection to the rig' }
  if (!supportOk) return { ok: false, reason: 'needs support underneath' }
  return { ok: true, reason: '' }
}

// Crew walkability (game's pathfinding rule). BFS over pathfinding-active cells;
// crew pass between adjacent cells of the same part, or through a shared face that
// has a walkable socket (door / deck / hatch). Returns which mandatory stations the
// crew can reach from each other. First pass — to be verified against in-game pathing.
const WALKABLE_SOCKET = new Set(['DOOR', 'DECK', 'HATCH'])
const MANDATORY_GROUPS = ['REACTOR', 'STEERING', 'CAPTAIN', 'ENTRANCE']

function facesWalk(a, b) {
  if (!a || !b) return false
  const at = new Set(a.map((s) => s.t))
  for (const s of b) if (WALKABLE_SOCKET.has(s.t) && at.has(s.t)) return true
  return false
}

export function checkPaths(state) {
  const cells = new Map() // key -> {plId, sockets}
  const add = (part, plId, px, py, pz, rot) => {
    if (!part || part.pf === false) return
    for (const c of worldCells(part, px, py, pz, rot)) {
      if (c.vol) cells.set(cellKey(c.x, c.y, c.z), { plId, sockets: c.sockets })
    }
  }
  for (const pl of state.placements) add(PART_BY_ID[pl.partId], pl.id, pl.x, pl.y, pl.z, pl.rot)

  // first placement carrying each mandatory group that's actually present
  const mandPl = {}
  for (const pl of state.placements) {
    for (const g of PART_BY_ID[pl.partId]?.groups ?? []) {
      if (MANDATORY_GROUPS.includes(g) && !mandPl[g]) mandPl[g] = pl.id
    }
  }
  const present = Object.keys(mandPl)
  if (present.length < 2) return { ok: true, reachable: present, unreachable: [] }

  const startKey = [...cells].find(([, v]) => v.plId === mandPl[present[0]])?.[0]
  if (!startKey) return { ok: true, reachable: [], unreachable: present }
  const seen = new Set([startKey]); const q = [startKey]
  while (q.length) {
    const k = q.pop()
    const [x, y, z] = k.split(',').map(Number)
    const cell = cells.get(k)
    for (const [dir, vec] of Object.entries(DIRS)) {
      const nk = cellKey(x + vec[0], y + vec[1], z + vec[2])
      if (seen.has(nk)) continue
      const ncell = cells.get(nk)
      if (!ncell) continue
      if (ncell.plId === cell.plId || facesWalk(cell.sockets[dir], ncell.sockets?.[OPP[dir]])) {
        seen.add(nk); q.push(nk)
      }
    }
  }
  const reachedPl = new Set([...seen].map((k) => cells.get(k).plId))
  const reachable = [], unreachable = []
  for (const g of present) (reachedPl.has(mandPl[g]) ? reachable : unreachable).push(g)
  return { ok: unreachable.length === 0, reachable, unreachable }
}

// Editable sockets of a placement (world-space) for door/hatch toggles.
// -> [{key, x,y,z, dir, type, states:[...] }]
// Returns part-LOCAL cell + local direction per editable socket. The scene positions
// the marker through the placed mesh's own transform (which already bakes in the
// pivot offset, footprint centring, Z-flip and rotation), so markers sit exactly on
// the model instead of on the raw grid cell (which mirrored them to the wrong side).
export function editableSockets(part, pl) {
  const out = []
  part.cells.forEach((c, ci) => {
    for (const [dir, ss] of Object.entries(c.s || {})) {
      for (const s of ss) {
        if (!s.e) continue
        const states = Object.keys(SOCKET_STATES[s.t] ?? { DEFAULT: '' })
          .filter((st) => !(s.bl ?? []).includes(st))
        out.push({ key: `${ci}|${dir}`, cell: c.p, dir, type: s.t, states })
      }
    }
  })
  return out
}

// ---- essentials / manifest ----
export const ESSENTIALS = [
  { group: 'REACTOR', label: 'Reactor' },
  { group: 'STEERING', label: 'Steering' },
  { group: 'CAPTAIN', label: "Captain's cabin" },
  { group: 'ENTRANCE', label: 'Entrance' },
]

export function manifest(state) {
  const counts = new Map()
  for (const pl of state.placements) {
    counts.set(pl.partId, (counts.get(pl.partId) ?? 0) + 1)
  }
  const rows = [...counts.entries()]
    .map(([partId, n]) => ({ part: PART_BY_ID[partId], n }))
    .filter((r) => r.part)
    .sort((a, b) => a.part.category.localeCompare(b.part.category) || a.part.name.localeCompare(b.part.name))
  const groups = new Set(state.placements.flatMap((pl) => PART_BY_ID[pl.partId]?.groups ?? []))
  const crew = state.placements.filter((pl) => PART_BY_ID[pl.partId]?.groups.includes('CREW')).length
  return { rows, groups, crew, total: state.placements.length }
}

// ---- share codes ----
export function encodeShare(state) {
  return 'SANDBP2.' + btoa(unescape(encodeURIComponent(JSON.stringify(state))))
}
export function decodeShare(code) {
  const m = code.trim().match(/^SANDBP2\.(.+)$/s)
  if (!m) throw new Error('not a SANDBP2 code')
  return JSON.parse(decodeURIComponent(escape(atob(m[1]))))
}

export const CAT_COLOR = {
  Cargo: '#ffc971',
  Crew: '#7ae582',
  CaptainCrew: '#3ddc97',
  Corridor: '#e8edf2',
  Crafting: '#ff9770',
  Balcony: '#70d6ff',
  Deck: '#9aa7d8',
  Armor: '#aab6c2',
  Reactor: '#ff70a6',
  Steering: '#ffd670',
  Engine: '#ff8c42',
  Weapon: '#ef476f',
  Special: '#b388eb',
  Structure: '#8da9c4',
  Cruise: '#62b6cb',
  Medical: '#e36868',
  Chassis: '#4a6f96',
  Other: '#7f96ad',
}

export const CATEGORY_ORDER = [
  'Cargo', 'Crew', 'CaptainCrew', 'Corridor', 'Crafting', 'Medical', 'Balcony', 'Deck',
  'Armor', 'Reactor', 'Steering', 'Engine', 'Weapon', 'Special', 'Structure', 'Cruise', 'Other',
]
