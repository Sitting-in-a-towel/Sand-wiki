// Builder V2 core — socket-driven placement engine mirroring the in-game editor.
// Data source: parts_v2.json = the game's own CompartmentsDatabase (cells, sockets,
// groups, limits) extracted verbatim. No name-parsing anywhere.
import partsV2 from './data/parts_v2.json'
import meshIndex from './data/mesh_index_v3.json' // v3 = real UVs + albedo textures
import partCosts from './data/part_costs.json' // wiki build cost per part id (crowns + resources)

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

// Leg anchors for a chassis. Legs are encoded as the ring of `noVol` cells around the
// deck (`vol`) cells. Cluster them into connected groups (one per leg) → {x,z,dir,yaw}:
//   dir = outward face the leg projects from; yaw aims the leg mesh's natural outward
//   (+X) along dir (same handed convention as placeMesh: +X -> (cos a, -sin a)).
export function chassisLegs(chassis) {
  if (!chassis) return []
  const noVol = chassis.cells.filter((c) => c.noVol).map((c) => [c.p[0], c.p[2]])
  const vol = chassis.cells.filter((c) => !c.noVol).map((c) => [c.p[0], c.p[2]])
  if (!noVol.length || !vol.length) return []
  const dminX = Math.min(...vol.map((c) => c[0])), dmaxX = Math.max(...vol.map((c) => c[0]))
  const dminZ = Math.min(...vol.map((c) => c[1])), dmaxZ = Math.max(...vol.map((c) => c[1]))
  const k = (x, z) => `${x},${z}`
  const set = new Map(noVol.map((c) => [k(c[0], c[1]), c]))
  const seen = new Set()
  const comps = []
  for (const c of noVol) {
    if (seen.has(k(c[0], c[1]))) continue
    const stack = [c]; seen.add(k(c[0], c[1])); const group = []
    while (stack.length) {
      const [x, z] = stack.pop(); group.push([x, z])
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = k(x + dx, z + dz)
        if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(set.get(nk)) }
      }
    }
    comps.push(group)
  }
  // Use the chassis' declared leg count (data `legs` field, e.g. 5x3 = 6). Most chassis
  // space their leg cells so each flood-fill component IS one leg — but some (5x3, 4x6)
  // encode an UNBROKEN side-strip per side, which would collapse to one "leg" each. So
  // split the declared count across components by size, spacing legs evenly along a strip.
  const legsTotal = Number.isFinite(chassis.legs) && chassis.legs > 0 ? chassis.legs : comps.length
  const totalCells = comps.reduce((s, g) => s + g.length, 0)
  const quota = comps.map((g) => (legsTotal * g.length) / totalCells)
  const base = quota.map((q) => Math.max(1, Math.floor(q)))
  let assigned = base.reduce((s, n) => s + n, 0)
  while (assigned < legsTotal) { // largest-remainder: add a leg to the most-deserving strip
    let best = 0
    for (let i = 1; i < comps.length; i++) if (quota[i] - base[i] > quota[best] - base[best]) best = i
    base[best]++; assigned++
  }
  while (assigned > legsTotal) { // trim from a strip that has >1 and the smallest remainder
    let best = -1
    for (let i = 0; i < comps.length; i++) if (base[i] > 1 && (best < 0 || quota[i] - base[i] < quota[best] - base[best])) best = i
    if (best < 0) break
    base[best]--; assigned--
  }
  const pts = []
  comps.forEach((g, i) => {
    if (base[i] <= 1) {
      // single leg → component centroid (identical to the old behaviour for spaced chassis)
      pts.push([g.reduce((s, c) => s + c[0], 0) / g.length, g.reduce((s, c) => s + c[1], 0) / g.length])
    } else {
      // multiple legs on one strip → space them evenly along the strip's long axis
      const xs = g.map((c) => c[0]), zs = g.map((c) => c[1])
      const alongX = (Math.max(...xs) - Math.min(...xs)) >= (Math.max(...zs) - Math.min(...zs))
      const sorted = [...g].sort((a, b) => (alongX ? a[0] - b[0] : a[1] - b[1]))
      for (let j = 0; j < base[i]; j++) pts.push(sorted[Math.round((j * (sorted.length - 1)) / (base[i] - 1))])
    }
  })
  const used = new Set(), uniq = [] // dedupe (rounding safety)
  for (const p of pts) { const key = k(p[0], p[1]); if (!used.has(key)) { used.add(key); uniq.push(p) } }
  return uniq.map(([cx, cz]) => {
    const outX = cx < dminX ? dminX - cx : cx > dmaxX ? cx - dmaxX : 0
    const outZ = cz < dminZ ? dminZ - cz : cz > dmaxZ ? cz - dmaxZ : 0
    let fx = 0, fz = 0
    if (outX >= outZ) fx = cx < dminX ? -1 : 1
    else fz = cz < dminZ ? -1 : 1
    return {
      x: cx, z: cz,
      dir: fx ? (fx < 0 ? 'Left' : 'Right') : (fz < 0 ? 'Back' : 'Forward'),
      yaw: Math.atan2(-fz, fx),
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

export const isEntrance = (part) => !!part?.groups?.includes('ENTRANCE')

// Cells where the given entrance part would be a fully-valid placement at `level`.
// Scans empty cells orthogonally adjacent to the rig (so it can connect) — cheap. The
// existing validate() already enforces the rest (ladder column clear via occupancy of
// the chassis footprint, connection to a compartment). Used to highlight where an
// entrance/ladder can attach.
export function entranceLegalCells(state, partId, level) {
  const part = PART_BY_ID[partId]
  if (!isEntrance(part)) return []
  const occ = buildOccupancy(state)
  const cand = new Set()
  for (const key of occ.keys()) {
    const [x, y, z] = key.split(',').map(Number)
    if (y !== level) continue
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = cellKey(x + dx, level, z + dz)
      if (!occ.has(nk)) cand.add(`${x + dx},${z + dz}`)
    }
  }
  const out = []
  for (const c of cand) {
    const [x, z] = c.split(',').map(Number)
    if (validate(state, occ, partId, x, level, z, 0).ok) out.push({ x, z })
  }
  return out
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

// ---- gallery summary (shared by the builder UI and the publish/server path) ----
// Single source of truth for the numbers shown on gallery cards. Derived purely
// from the build state so the server can recompute (and reject spoofed) stats.
export function buildSummary(state) {
  const man = manifest(state)

  // crowns: chassis + every placed part's wiki cost (mirrors Builder.jsx cost memo)
  let crowns = 0
  const add = (partId, n) => {
    const c = partCosts[partId]
    if (c && typeof c.crowns === 'number') crowns += c.crowns * n
  }
  add(state.chassisId, 1)
  for (const row of man.rows) add(row.part.id, row.n)

  // hull: distinct vertical floors occupied (the chassis floor counts as 1).
  // y is the grid level axis in this builder (see DEFAULT_STATE: "y = grid level").
  const floors = new Set((state.placements ?? []).map((p) => p.y ?? 0))
  const hull = Math.max(1, floors.size)

  const chassis = PART_BY_ID[state.chassisId]
  const chassisLabel = chassis ? chassis.name : state.chassisId

  // crew: total beds, not compartment count. Crew cabins state their capacity in the
  // name ("… , 4 People" / "… , Single"); the captain's cabin seats 1 (the captain).
  let crew = 0
  for (const pl of state.placements ?? []) {
    crew += crewSeats(PART_BY_ID[pl.partId])
  }

  // cannons: turret-slot mounts (the gun sockets). Keyed off the id, not the category,
  // because one turret deck (compDeck_TurretSlot_FrameCMetal_1x1) lives under "Deck"
  // rather than "Weapon". This also naturally excludes the battering ram.
  const cannons = (state.placements ?? []).filter((pl) =>
    PART_BY_ID[pl.partId]?.id.includes('TurretSlot'),
  ).length

  return { chassisLabel, partCount: man.total, crowns, hull, crew, cannons }
}

// Crew capacity a single placed part contributes. Crew cabins encode it in their name
// ("4 People" / "Single"); the captain's cabin seats the captain (1). Everything else 0.
export function crewSeats(part) {
  if (!part) return 0
  const groups = part.groups || []
  if (groups.includes('CAPTAIN')) return 1
  if (!groups.includes('CREW')) return 0
  if (/\bsingle\b/i.test(part.name)) return 1
  const m = part.name.match(/(\d+)\s*People/i)
  return m ? parseInt(m[1], 10) : 0
}

// ---- full build cost (shared by the builder cost panel and gallery cards) ----
// Chassis + every placed part's wiki cost, summed per resource. Pure: derived
// only from the build state so it can run on the server or in the gallery client.
export function costBreakdown(state) {
  const man = manifest(state)
  const t = { crowns: 0, mechanical: 0, pneumatic: 0, computing: 0 }
  const add = (partId, n) => {
    const c = partCosts[partId]
    if (c) for (const k in t) if (typeof c[k] === 'number') t[k] += c[k] * n
  }
  add(state.chassisId, 1)
  for (const row of man.rows) add(row.part.id, row.n)
  return t
}

// Build-cost rows in wiki order: [key, label, iconPath]. Icons are served
// same-origin from /icons. Shared so the builder panel and gallery cards
// can never drift in which resources they show or which icon represents each.
export const COST_ROWS = [
  ['crowns', 'Crowns', '/icons/icon_item_coinCrown.png'],
  ['mechanical', 'Mechanical Parts', '/icons/icon_item_resourceMetal_t1.png'],
  ['pneumatic', 'Pneumatic Parts', '/icons/icon_item_resourceMetal_t2.png'],
  ['computing', 'Computing Module', '/icons/icon_item_resourceMetal_t3.png'],
]

// ---- random trampler generator ----
// Builds a VALID trampler by construction: place the required parts first (so it's a legal
// rig), then weighted extras per the knobs, vetting every candidate spot through validate()
// so nothing invalid is ever committed. No random-and-pray.
//   opts = { chassisId?, crew:0-6, speed:slow|balanced|fast, attack:low|medium|high,
//            defense:low|medium|high, cost:cheap|balanced|expensive, allow?:Set<partId> }
//   allow = optional set of usable part ids (tech-tree filter); omit for all.
const _placeable = (p) => p.category !== 'Chassis' && !p.id.endsWith('_mirror')
const _byGroup = (g) => PARTS.filter((p) => _placeable(p) && (p.groups ?? []).includes(g))
const _byCategory = (cats) => PARTS.filter((p) => _placeable(p) && cats.includes(p.category))

function _partCost(id) {
  const c = partCosts[id] || {}
  return (c.crowns || 0) + (c.mechanical || 0) + (c.pneumatic || 0) + (c.computing || 0)
}
function _shuffle(arr, rng) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a
}
// Pick a part from a pool, honouring the tech-tree allow-set and the cost knob.
function _pick(pool, opts, rng) {
  let cands = pool
  if (opts.allow) { const f = pool.filter((p) => opts.allow.has(p.id)); if (f.length) cands = f }
  if (!cands.length) return null
  if (opts.cost === 'cheap' || opts.cost === 'expensive') {
    const sorted = [...cands].sort((a, b) => _partCost(a.id) - _partCost(b.id))
    const half = Math.max(1, Math.ceil(sorted.length / 2))
    cands = opts.cost === 'cheap' ? sorted.slice(0, half) : sorted.slice(-half)
  }
  return cands[Math.floor(rng() * cands.length)]
}
// Candidate anchor cells = the chassis deck footprint, levels 1..3 (stacking), shuffled.
function _candidateCells(state, rng) {
  const ch = PART_BY_ID[state.chassisId]
  if (!ch) return []
  const deck = worldCells(ch, 0, 0, 0, 0).filter((c) => c.vol)
  const cells = []
  for (const c of deck) for (let y = 1; y <= 3; y++) cells.push({ x: c.x, y, z: c.z })
  return _shuffle(cells, rng)
}
function _findSpot(state, partId, rng) {
  const occ = buildOccupancy(state)
  for (const { x, y, z } of _candidateCells(state, rng)) {
    for (const rot of _shuffle([0, 1, 2, 3], rng)) {
      if (validate(state, occ, partId, x, y, z, rot).ok) return { x, y, z, rot }
    }
  }
  return null
}

export function randomTrampler(opts = {}) {
  const rng = Math.random
  const chassisPool = PARTS.filter((p) => p.category === 'Chassis')
  const chassisId = (opts.chassisId && opts.chassisId !== 'random' && PART_BY_ID[opts.chassisId])
    ? opts.chassisId
    : (_pick(chassisPool, opts, rng)?.id ?? chassisPool[0]?.id)
  let state = { v: 2, name: 'RANDOM RIG', chassisId, placements: [] }
  let idc = 1
  const tryPlace = (partId) => {
    if (!partId) return false
    const spot = _findSpot(state, partId, rng)
    if (!spot) return false
    state = { ...state, placements: [...state.placements, { id: `r${idc++}`, partId, x: spot.x, y: spot.y, z: spot.z, rot: spot.rot, conns: {} }] }
    return true
  }
  const N = { low: 1, medium: 3, high: 6, slow: 0, balanced: 1, fast: 2 }
  // 1) essentials — one per required group, so the rig is valid
  for (const { group } of ESSENTIALS) tryPlace(_pick(_byGroup(group), opts, rng)?.id)
  // 2) crew quarters up to the requested size
  const crew = Math.max(0, Math.min(MEMBER_LIMIT, opts.crew ?? 2))
  for (let i = 0; i < crew; i++) tryPlace(_pick(_byGroup('CREW'), opts, rng)?.id)
  // 3) weapons (attack), engines (speed), armour (defense)
  for (let i = 0; i < (N[opts.attack] ?? 3); i++) tryPlace(_pick(_byGroup('WEAPONE'), opts, rng)?.id)
  for (let i = 0; i < (N[opts.speed] ?? 1); i++) tryPlace(_pick(_byGroup('ENGINE'), opts, rng)?.id)
  for (let i = 0; i < (N[opts.defense] ?? 3); i++) tryPlace(_pick(_byCategory(['Armor']), opts, rng)?.id)
  // 4) round it out with a few deck/cargo/balcony pieces
  for (let i = 0; i < 4; i++) tryPlace(_pick(_byCategory(['Deck', 'Cargo', 'Balcony']), opts, rng)?.id)
  return state
}
