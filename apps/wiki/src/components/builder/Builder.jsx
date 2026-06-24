'use client'
// Builder V2: identical in-game builder rebuild.
// Truth source: the game's CompartmentsDatabase (cells/sockets/limits), real meshes.
import './builder.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ToolNavBrand } from '@/components/ToolNavBrand'
import { AuthMenuClient } from '@/components/AuthMenuClient'
import { ToolNav } from '@/components/ToolNav'
import { Button, actionButtonClass } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SteamGateModal } from '@/components/SteamGateModal'
import BuilderScene from './BuilderScene.jsx'
import thumbsV2 from './data/part_thumbs_v2.json'
import partTech from './data/part_tech.json'
import partIcons from './data/part_icons.json'
import { asset } from './data.js'
import {
  PARTS, PART_BY_ID, GROUP_LIMITS, MEMBER_LIMIT, ESSENTIALS, DISABLED_PARTS,
  CAT_COLOR, CATEGORY_ORDER, buildOccupancy, validate, manifest,
  encodeShare, decodeShare, editableSockets, checkPaths,
  costBreakdown, COST_ROWS,
} from './builderCore.js'
import { decodeWbt, wbtToState } from './wbtImport.js'
import { downloadWbt } from './wbtExport.js'
import { submitBuild } from './galleryApi.js'
import { designShareUrl } from '@/lib/share'

const STORE_KEY = 'sand_blueprint_v2'
// The /tech page persists the user's unlocked nodes here (JSON array of node slugs).
const TECH_KEY = 'sand_techtree_unlocked_v1'
const chassisList = PARTS.filter((p) => p.category === 'Chassis')
// Groups that make a trampler valid — these parts are the "Essentials" (mandatory).
const ESS_GROUPS = new Set(ESSENTIALS.map((e) => e.group))
const isEssential = (p) => (p.groups ?? []).some((g) => ESS_GROUPS.has(g))
// Locker lists parts enabled in the game (chassis + mirror variants excluded), split into
// Essentials (required groups) vs everything else. Disabled parts come from DISABLED_PARTS.
const lockerParts = PARTS.filter((p) => p.category !== 'Chassis' && !p.id.endsWith('_mirror'))
const essentialParts = lockerParts.filter(isEssential)
const otherParts = lockerParts.filter((p) => !isEssential(p))

const DEFAULT_STATE = {
  v: 2,
  name: 'UNTITLED RIG',
  chassisId: 'compChassis_Medium4_Metal_4x4',
  placements: [], // {id, partId, x, y, z, rot, conns:{}}  (y = grid level, 1 = on the plate)
}

const LEVEL_LABELS = ['HULL', 'DECK 2', 'DECK 3', 'DECK 4', 'DECK 5', 'DECK 6']

// Windows default location for in-game .wbt trampler saves (shown in the Load modal).
const SAVE_PATH = '%AppData%\\..\\LocalLow\\Hologryph\\Sand\\Data\\Walkers\\'


function thumbOf(partId) {
  const t = thumbsV2[partId]
  return t ? asset(t.replace(/^\//, '')) : null
}

// Part thumbnail. Prefers the wiki's 2D game icon (same-origin /tramplers/…), falling
// back to the 3D render, then a ghost glyph — so a missing image never shows broken.
function Thumb({ partId }) {
  const candidates = [partIcons[partId], thumbOf(partId)].filter(Boolean)
  const [idx, setIdx] = useState(0)
  if (idx >= candidates.length) return <span className="bv2-ghosticon">▦</span>
  return <img src={candidates[idx]} alt="" loading="lazy" onError={() => setIdx((i) => i + 1)} />
}

// Lightweight modal shell for the Share / Import / Load / Publish dialogs.
// Module-level (stable identity) so the inputs inside don't remount on every keystroke.
function Modal({ title, icon, onClose, children, footer }) {
  return (
    <div
      className="tb-modal-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="tb-modal" role="dialog" aria-modal="true">
        <div className="tb-modal-h">
          {icon && <span className="ic">{icon}</span>}
          <span>{title}</span>
          <button type="button" className="tb-modal-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="tb-modal-b">{children}</div>
        {footer && <div className="tb-modal-f">{footer}</div>}
      </div>
    </div>
  )
}

export default function BuilderV2() {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY)
      if (saved) return { ...DEFAULT_STATE, ...JSON.parse(saved) }
    } catch { /* fresh */ }
    return DEFAULT_STATE
  })
  const [level, setLevel] = useState(1)
  const [activePart, setActivePart] = useState(null)
  const [activeRot, setActiveRot] = useState(0)
  const [selectedId, setSelectedId] = useState(null)
  const [openCat, setOpenCat] = useState('Cargo')
  // Hull picker + Essentials are collapsible (default open) so users can fold them away
  // once their hull + required parts are in, to cut scrolling — re-open any time.
  const [hullOpen, setHullOpen] = useState(true)
  const [essOpen, setEssOpen] = useState(true)
  const [q, setQ] = useState('')
  // "Match my tech tree": when on, parts gated behind a not-yet-unlocked tech node
  // are shown locked (greyed, non-placeable). unlockedNodes mirrors the /tech planner.
  const [matchTech, setMatchTech] = useState(false)
  const [unlockedNodes, setUnlockedNodes] = useState(() => new Set())
  const [notice, setNotice] = useState('')
  const [hoverInfo, setHoverInfo] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [loadOpen, setLoadOpen] = useState(false)
  const [shareText, setShareText] = useState('')
  const [pubOpen, setPubOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [pendingChassis, setPendingChassis] = useState(null)
  const [pub, setPub] = useState({ name: '' })
  const [pubThumb, setPubThumb] = useState(null)
  const [pubBusy, setPubBusy] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [gateOpen, setGateOpen] = useState(false)
  const idRef = useRef(Date.now() % 1e7)
  const moveBackup = useRef(null)
  const captureRef = useRef(null)
  // Latest placement the pointer is over in the 3D scene (for context-aware X).
  // A ref, not state, so hovering never re-renders the React tree — the scene
  // draws its own hover outline.
  const hoveredId = useRef(null)

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(state))
  }, [state])

  // Auth state for gating the Publish flow behind Steam sign-in (same source as
  // AuthMenuClient). Signed-out users get the SteamGateModal instead of the dialog.
  useEffect(() => {
    let alive = true
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive) setSignedIn(!!d.user) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Close any open modal on Escape (UI only — placement Esc is handled separately).
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { setShareOpen(false); setImportOpen(false); setLoadOpen(false); setPubOpen(false); setPubThumb(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Mirror the tech-tree planner's unlocked set (read on mount + when it changes,
  // incl. edits made in the /tech tab in another window via the storage event).
  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem(TECH_KEY)
        setUnlockedNodes(new Set(raw ? JSON.parse(raw) : []))
      } catch { setUnlockedNodes(new Set()) }
    }
    read()
    function onStorage(e) { if (e.key === TECH_KEY) read() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // handoff: "Open in builder" from the Gallery drops a code in localStorage
  useEffect(() => {
    const code = localStorage.getItem('sand_load_code')
    if (code) {
      localStorage.removeItem('sand_load_code')
      try { setState({ ...DEFAULT_STATE, ...decodeShare(code) }) } catch { /* ignore */ }
    }
  }, [])

  const occ = useMemo(() => buildOccupancy(state), [state])
  const man = useMemo(() => manifest(state), [state])
  const paths = useMemo(() => checkPaths(state), [state])
  // Total build cost (crowns + the three resources), via the shared helper so
  // the gallery cards and this panel can never drift.
  const cost = useMemo(() => costBreakdown(state), [state])

  // ---------- actions ----------
  function flash(msg) {
    setNotice(msg)
    window.clearTimeout(flash._t)
    flash._t = window.setTimeout(() => setNotice(''), 2400)
  }

  function place(gx, gz, valid) {
    if (!activePart) return
    if (!valid) {
      flash(hoverInfo || 'invalid position')
      return
    }
    const id = `p${idRef.current++}`
    setState((s) => ({
      ...s,
      placements: [...s.placements, { id, partId: activePart, x: gx, y: level, z: gz, rot: activeRot, conns: {} }],
    }))
    setSelectedId(id)
    if (!keysDown.current.has('Shift')) setActivePart(null) // auto-deselect (round-3 ask); Shift = keep placing
  }

  function movePlacement(plId, gx, gz, preview) {
    if (preview) {
      setState((s) => {
        const pl = s.placements.find((p) => p.id === plId)
        if (!pl) return s
        if (!moveBackup.current || moveBackup.current.id !== plId) {
          moveBackup.current = { id: plId, x: pl.x, z: pl.z }
        }
        if (pl.x === gx && pl.z === gz) return s
        return {
          ...s,
          placements: s.placements.map((p) => (p.id === plId ? { ...p, x: gx, z: gz } : p)),
        }
      })
    } else {
      // commit: validate final spot, revert if invalid
      setState((s) => {
        const pl = s.placements.find((p) => p.id === plId)
        if (!pl) return s
        const others = { ...s, placements: s.placements.filter((p) => p.id !== plId) }
        const o = buildOccupancy(others)
        const v = validate(others, o, pl.partId, pl.x, pl.y, pl.z, pl.rot)
        if (!v.ok && moveBackup.current?.id === plId) {
          flash(`can't move there — ${v.reason}`)
          const bk = moveBackup.current
          moveBackup.current = null
          return {
            ...s,
            placements: s.placements.map((p) => (p.id === plId ? { ...p, x: bk.x, z: bk.z } : p)),
          }
        }
        moveBackup.current = null
        return s
      })
      setSelectedId(plId)
    }
  }

  function rotate() {
    if (activePart) {
      setActiveRot((r) => (r + 1) % 4)
      return
    }
    if (selectedId) {
      setState((s) => {
        const pl = s.placements.find((p) => p.id === selectedId)
        if (!pl) return s
        const rot = (pl.rot + 1) % 4
        const others = { ...s, placements: s.placements.filter((p) => p.id !== selectedId) }
        const v = validate(others, buildOccupancy(others), pl.partId, pl.x, pl.y, pl.z, rot)
        if (!v.ok) {
          flash(`can't rotate — ${v.reason}`)
          return s
        }
        return { ...s, placements: s.placements.map((p) => (p.id === selectedId ? { ...p, rot } : p)) }
      })
    }
  }

  function mirrorSelected() {
    if (!selectedId) return
    setState((s) => {
      const pl = s.placements.find((p) => p.id === selectedId)
      const part = pl && PART_BY_ID[pl.partId]
      const mirrorId = part?.mirror ?? (PART_BY_ID[`${pl?.partId}_mirror`] ? `${pl.partId}_mirror` : null)
      if (!pl || !mirrorId) {
        flash('no mirrored variant for this part')
        return s
      }
      const others = { ...s, placements: s.placements.filter((p) => p.id !== selectedId) }
      const v = validate(others, buildOccupancy(others), mirrorId, pl.x, pl.y, pl.z, pl.rot)
      if (!v.ok) {
        flash(`mirror doesn't fit — ${v.reason}`)
        return s
      }
      return { ...s, placements: s.placements.map((p) => (p.id === selectedId ? { ...p, partId: mirrorId } : p)) }
    })
  }

  function removeSelected() {
    if (!selectedId) return
    setState((s) => ({ ...s, placements: s.placements.filter((p) => p.id !== selectedId) }))
    setSelectedId(null)
  }

  // X — context-aware "clear": cancel a pending placement, else delete whatever the
  // pointer is hovering, else fall back to deleting the selected piece.
  function deleteContext() {
    if (activePart) { setActivePart(null); return }
    const id = hoveredId.current
    if (id) {
      setState((s) => ({ ...s, placements: s.placements.filter((p) => p.id !== id) }))
      if (selectedId === id) setSelectedId(null)
      hoveredId.current = null
      return
    }
    removeSelected()
  }

  // Copy = pick up a fresh copy of the selected part to place again (matches the
  // in-game builder's C shortcut), reusing the normal place flow.
  function copySelected() {
    if (!selectedId) return
    const pl = state.placements.find((p) => p.id === selectedId)
    if (!pl) return
    setActivePart(pl.partId)
    setActiveRot(pl.rot)
    setSelectedId(null)
    flash('copied — click a cell to place')
  }

  // Clear the build (keeps the chosen chassis), wired from the top-bar toolbar.
  function doClear() {
    setState((s) => ({ ...DEFAULT_STATE, chassisId: s.chassisId }))
    setSelectedId(null)
  }

  // Pick a hull from the left-panel chassis tiles. Switching chassis clears the build,
  // so confirm first when there are placements to lose.
  function chooseChassis(id) {
    if (id === state.chassisId) return
    if (state.placements.length > 0) { setPendingChassis(id); return }
    setState((s) => ({ ...s, chassisId: id, placements: [] }))
    setSelectedId(null)
  }
  function applyChassis(id) {
    setState((s) => ({ ...s, chassisId: id, placements: [] }))
    setSelectedId(null)
    setPendingChassis(null)
  }

  function toggleSocket(plId, key) {
    setState((s) => ({
      ...s,
      placements: s.placements.map((p) => {
        if (p.id !== plId) return p
        const part = PART_BY_ID[p.partId]
        const sock = part && editableSockets(part, p).find((es) => es.key === key)
        const states = sock?.states?.length ? sock.states : ['DEFAULT', 'DOOR', 'OPEN']
        const cur = p.conns?.[key] ?? 'DEFAULT'
        const next = states[(states.indexOf(cur) + 1) % states.length]
        return { ...p, conns: { ...(p.conns ?? {}), [key]: next } }
      }),
    }))
  }

  // keyboard
  const keysDown = useRef(new Set())
  useEffect(() => {
    function down(e) {
      keysDown.current.add(e.key)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); rotate() } // Space scrolls the page by default
      if (e.key === 'r' || e.key === 'R') setLevel((l) => Math.min(LEVEL_LABELS.length, l + 1))
      if (e.key === 'f' || e.key === 'F') setLevel((l) => Math.max(1, l - 1))
      if (e.key === 'Delete' || e.key === 'Backspace') removeSelected()
      if (e.key === 'x' || e.key === 'X') deleteContext()
      if (e.key === 'c' || e.key === 'C') copySelected()
      if (e.key === 'Escape') {
        setActivePart(null)
        setSelectedId(null)
      }
      if (e.key === 'm' || e.key === 'M') mirrorSelected()
    }
    function up(e) {
      keysDown.current.delete(e.key)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  // ---------- locker ----------
  // Group a part list into [category, parts][] honouring the search box + "match my tech".
  function groupParts(list) {
    const byCat = new Map()
    for (const p of list) {
      if (q && !p.name.toLowerCase().includes(q.toLowerCase()) && !p.id.toLowerCase().includes(q.toLowerCase())) continue
      if (matchTech) {
        const t = partTech[p.id]
        if (t && !unlockedNodes.has(t.node)) continue
      }
      if (!byCat.has(p.category)) byCat.set(p.category, [])
      byCat.get(p.category).push(p)
    }
    return [...byCat.entries()].sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a[0]) + 99) - (CATEGORY_ORDER.indexOf(b[0]) + 99) ||
        a[0].localeCompare(b[0]),
    )
  }
  // Essentials (required parts, grouped by category) shown first; everything else below;
  // disabled (not-yet-in-game) parts last, search-filtered.
  const essCats = useMemo(() => groupParts(essentialParts), [q, matchTech, unlockedNodes])
  const cats = useMemo(() => groupParts(otherParts), [q, matchTech, unlockedNodes])
  const disabledList = useMemo(
    () => DISABLED_PARTS.filter((p) => !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) || p.id.toLowerCase().includes(q.toLowerCase())),
    [q],
  )
  // Hull picker honours "Match my tech tree" just like the parts list: when on, only show
  // chassis whose tech node is unlocked (chassis with no tech node are always available).
  // The currently-selected hull stays visible even if locked, so you never lose your build.
  const chassisShown = useMemo(() => chassisList.filter((c) => {
    if (!matchTech) return true
    if (c.id === state.chassisId) return true
    const t = partTech[c.id]
    return !t || unlockedNodes.has(t.node)
  }), [matchTech, unlockedNodes, state.chassisId])

  const essentialsState = ESSENTIALS.map((e) => ({ ...e, ok: man.groups.has(e.group) }))
  const selectedPl = state.placements.find((p) => p.id === selectedId)
  const selectedPart = selectedPl && PART_BY_ID[selectedPl.partId]
  const chassisPart = PART_BY_ID[state.chassisId]

  // One locker part row — reused in Essentials, the category accordions, and Disabled.
  function renderPart(p, opts = {}) {
    const tech = partTech[p.id]
    return (
      <div key={p.id} className="tb-part-row">
        <button
          type="button"
          className={`tb-part ${activePart === p.id ? 'active' : ''} ${opts.disabled ? 'is-disabled' : ''}`}
          onClick={() => { setActivePart(activePart === p.id ? null : p.id); setActiveRot(0); setSelectedId(null) }}
          title={p.desc ? `${p.name}\n\n${p.desc}` : p.id}
        >
          <span className="tb-part-icon"><Thumb partId={p.id} /></span>
          <span className="tb-part-name">{p.name}{opts.disabled && <span className="tb-badge-dis">SOON</span>}</span>
          <span className="tb-part-size">
            {p.bounds[0]}×{p.bounds[2]}{p.bounds[1] > 1 ? `·${p.bounds[1]}h` : ''}{p.mirror ? ' ⇋' : ''}
          </span>
        </button>
        {tech && (
          <a
            className="tb-part-tech"
            href={`/tech?select=${encodeURIComponent(tech.node)}`}
            target="_blank" rel="noopener noreferrer"
            title={`Unlocked by "${tech.name ?? 'tech node'}" — open in the tech tree`}
            aria-label={`Show ${p.name} in the tech tree`}
          >⌖</a>
        )}
      </div>
    )
  }

  // ---------- share ----------
  function doExport() {
    setShareText(encodeShare(state))
    setShareOpen(true)
  }
  function doImport() {
    try {
      const st = decodeShare(shareText)
      setState({ ...DEFAULT_STATE, ...st })
      setImportOpen(false)
      flash('blueprint imported')
    } catch {
      flash('not a valid SANDBP2 code')
    }
  }
  // publish current build to the community gallery (goes live immediately; reportable)
  async function doPublish() {
    const name = (pub.name || state.name || '').trim()
    if (!name) { flash('give your build a name first'); return }
    setPubBusy(true)
    try {
      const { slug } = await submitBuild({
        name,
        buildCode: encodeShare(state),
        thumbnail: pubThumb ?? undefined,
      })
      setPubOpen(false)
      setPub({ name: '' })
      setPubThumb(null)
      try {
        await navigator.clipboard.writeText(designShareUrl(slug, window.location.origin))
        flash('Published — share link copied to clipboard')
      } catch {
        flash('Published — view it in the gallery')
      }
    } catch (e) {
      flash(`publish failed — ${e.message || 'try again'}`)
    } finally {
      setPubBusy(false)
    }
  }

  // import an in-game .wbt save file (decoded fully in-browser, nothing uploaded)
  async function doImportWbt(file) {
    if (!file) return
    try {
      const doc = await decodeWbt(await file.arrayBuffer())
      const { state: st, stats } = wbtToState(doc, PART_BY_ID, () => String(idRef.current++))
      setState({ ...DEFAULT_STATE, ...st })
      setImportOpen(false)
      setLoadOpen(false)
      flash(
        stats.skipped
          ? `imported ${stats.total} parts (${stats.skipped} skipped — old game version)`
          : `imported ${stats.total} parts from ${file.name}`,
      )
    } catch (e) {
      flash(`couldn't read .wbt — ${e.message || 'unsupported file'}`)
    }
  }

  // download the current build as an in-game .wbt save. The icon is the canonical
  // capture frame (front-facing, opaque) rendered by the 3D scene.
  async function doDownloadWbt() {
    try {
      const iconSrc = captureRef.current ? captureRef.current() : null
      await downloadWbt(state, { iconSrc })
      flash('downloaded .wbt')
    } catch {
      flash('couldn’t build .wbt')
    }
  }

  return (
    <div className="tb-app" data-screen-label="Trampler Builder">
      {/* ===== top bar ===== */}
      <header className="tb-appbar">
        <ToolNavBrand title="Trampler Builder" />
        <ToolNav active="builder" />
        <span className="spacer" />
        <button type="button" className={actionButtonClass} onClick={doExport}>Share code</button>
        <button type="button" className={actionButtonClass} onClick={() => { setShareText(''); setImportOpen(true) }}>Import</button>
        <button type="button" className={actionButtonClass} onClick={() => setLoadOpen(true)}>
          <span style={{ color: 'var(--info)' }}>⭱</span>&nbsp;Load .wbt save
        </button>
        <button type="button" className={actionButtonClass} onClick={doDownloadWbt}>
          <span style={{ color: 'var(--info)' }}>⭳</span>&nbsp;Download .wbt
        </button>
        <span className="divider" />
        <button type="button" className={actionButtonClass} onClick={() => setClearOpen(true)}>✕ Clear</button>
        <AuthMenuClient />
      </header>

      <div className="tb-body">

        {/* ===================== LEFT — PARTS LOCKER ===================== */}
        <aside className="tb-panel left">
          <div className="tb-panel-head">Parts Locker</div>
          <div className="tb-search">
            <div className="tb-searchbox">
              <span className="tb-searchbox-icon">⌕</span>
              <input
                className="tb-input" placeholder="Search parts…" value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={matchTech}
              className={`tb-switch ${matchTech ? 'on' : ''}`}
              onClick={() => setMatchTech((v) => !v)}
              title="When on, parts you haven't unlocked in the tech tree are shown locked"
            >
              <span className="tb-switch-track"><span className="tb-switch-thumb" /></span>
              <span className="tb-switch-label">Match my tech tree</span>
            </button>
          </div>
          <div className="tb-scroll">
            {/* ① Hull — choose a chassis first; image tiles, not a dropdown. Collapsible. */}
            <div className={`tb-cat ${hullOpen ? 'open' : ''}`}>
              <button type="button" className="tb-cat-head" onClick={() => setHullOpen((v) => !v)}>
                <span className="tb-cat-caret">▶</span>
                <span className="tb-cat-dot" style={{ '--cat': CAT_COLOR.Chassis }} />
                ① Choose a hull
                <span className="tb-cat-count">{chassisShown.length}{matchTech && chassisShown.length < chassisList.length ? ` / ${chassisList.length}` : ''}</span>
              </button>
              {hullOpen && (
                <div className="tb-cat-body tb-chassis-grid">
                  {chassisShown.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`tb-part chassis ${state.chassisId === c.id ? 'active' : ''}`}
                      onClick={() => chooseChassis(c.id)}
                      title={c.label ?? c.name}
                    >
                      <span className="tb-part-icon"><Thumb partId={c.id} /></span>
                      <span className="tb-part-name">{c.label ?? c.name}</span>
                      <span className="tb-part-size">{c.bounds[0]}×{c.bounds[2]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ② Essentials — the parts a trampler needs to be valid, grouped by category.
                Collapsible (force-open while searching so matches still show). */}
            {(() => {
              const essShow = essOpen || !!q
              return (
                <div className={`tb-cat ${essShow ? 'open' : ''}`}>
                  <button type="button" className="tb-cat-head" onClick={() => setEssOpen((v) => !v)}>
                    <span className="tb-cat-caret">▶</span>
                    <span className="tb-cat-dot ess" />
                    ② Essentials <span className="tb-cat-sub">required</span>
                    <span className="tb-cat-count">{essCats.reduce((n, [, it]) => n + it.length, 0)}</span>
                  </button>
                  {essShow && (
                    <div className="tb-cat-body">
                      {essCats.length === 0 && <div className="tb-hint-sm">No matches.</div>}
                      {essCats.map(([cat, items]) => (
                        <div key={cat} className="tb-ess-group">
                          <div className="tb-ess-label">
                            <span className="tb-cat-dot" style={{ '--cat': CAT_COLOR[cat] ?? 'var(--primary)' }} />{cat}
                          </div>
                          {items.map((p) => renderPart(p))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ③ Everything else — optional categories (collapsible) */}
            {cats.map(([cat, items]) => {
              const open = openCat === cat || !!q
              return (
                <div key={cat} className={`tb-cat ${open ? 'open' : ''}`}>
                  <button type="button" className="tb-cat-head" onClick={() => setOpenCat(openCat === cat ? null : cat)}>
                    <span className="tb-cat-caret">▶</span>
                    <span className="tb-cat-dot" style={{ '--cat': CAT_COLOR[cat] ?? 'var(--primary)' }} />
                    {cat}
                    <span className="tb-cat-count">{items.length}</span>
                  </button>
                  {open && <div className="tb-cat-body">{items.map((p) => renderPart(p))}</div>}
                </div>
              )
            })}

            {/* ④ Disabled — in the files but not enabled in-game */}
            {disabledList.length > 0 && (() => {
              const open = openCat === '__disabled' || !!q
              return (
                <div className={`tb-cat ${open ? 'open' : ''}`}>
                  <button type="button" className="tb-cat-head" onClick={() => setOpenCat(openCat === '__disabled' ? null : '__disabled')}>
                    <span className="tb-cat-caret">▶</span>
                    <span className="tb-cat-dot" style={{ '--cat': '#6b7280' }} />
                    Disabled
                    <span className="tb-cat-count">{disabledList.length}</span>
                  </button>
                  {open && (
                    <div className="tb-cat-body">
                      <div className="tb-hint-sm tb-disabled-note">Not in the game yet — shown for preview, placeable.</div>
                      {disabledList.map((p) => renderPart(p, { disabled: true }))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </aside>

        {/* ===================== CENTER — VIEWPORT ===================== */}
        <section className="tb-viewport">
          <BuilderScene
            state={state}
            level={level}
            activePart={activePart}
            activeRot={activeRot}
            selectedId={selectedId}
            onPlace={place}
            onSelect={setSelectedId}
            onMove={movePlacement}
            onHoverInfo={setHoverInfo}
            onSocketToggle={toggleSocket}
            onHoverPart={(plId) => { hoveredId.current = plId }}
            captureRef={captureRef}
          />

          {/* hull level rail */}
          <div className="tb-hull">
            <button type="button" className="tb-hull-btn" title="up a level" onClick={() => setLevel((l) => Math.min(LEVEL_LABELS.length, l + 1))}>▲</button>
            <div className="tb-hull-label" title={LEVEL_LABELS[level - 1] ?? `Level ${level}`}>
              <span className="txt">Level</span>
              <span className="lvl">{level}</span>
            </div>
            <button type="button" className="tb-hull-btn" title="down a level" onClick={() => setLevel((l) => Math.max(1, l - 1))}>▼</button>
          </div>

          {/* bottom toolbar */}
          <div className="tb-toolbar">
            <button type="button" className="tb-tool" onClick={rotate} title="rotate (Space)"><span className="ic">⟳</span>Rotate</button>
            <button type="button" className="tb-tool" onClick={mirrorSelected} disabled={!selectedPart?.mirror && !PART_BY_ID[`${selectedPl?.partId}_mirror`]} title="mirror (M)"><span className="ic">⇄</span>Mirror</button>
            <button type="button" className="tb-tool danger" onClick={removeSelected} disabled={!selectedId} title="remove (X / Del)"><span className="ic">✕</span>Remove</button>
          </div>

          {/* contextual messages */}
          {activePart && (
            <div className="tb-placing">
              placing <b>{PART_BY_ID[activePart]?.name}</b> on {LEVEL_LABELS[level - 1]} — click to place, Space rotate, hold Shift to keep placing, X / Esc to cancel
              {hoverInfo && <span className="tb-placing-err"> · {hoverInfo}</span>}
            </div>
          )}
          {selectedPl && !activePart && (
            <div className="tb-placing">
              <b>{selectedPart?.name}</b> selected — drag to move, Space rotate, M mirror, X / Del remove · spheres = convertible sockets (click: wall → door → open)
            </div>
          )}
        </section>

        {/* ===================== RIGHT — INSPECTOR ===================== */}
        <aside className="tb-panel right">
            {/* rig name */}
            <div className="tb-rig-name">
              <input
                value={state.name}
                spellCheck={false}
                onChange={(e) => setState((s) => ({ ...s, name: e.target.value.toUpperCase().slice(0, 28) }))}
              />
              <span className="edit-ic">✎</span>
            </div>

            {/* chassis — chosen via the left panel's hull picker */}
            <div className="tb-section">
              <div className="tb-section-h">Chassis</div>
              <div className="tb-chassis-readout">
                <span className="tb-chassis-ic"><Thumb partId={state.chassisId} /></span>
                <span className="tb-chassis-name">{chassisPart?.label ?? chassisPart?.name ?? state.chassisId}</span>
              </div>
              <div className="tb-hint-sm">Pick a hull from the left panel. Changing it clears the build.</div>
            </div>

            {/* manifest */}
            <div className="tb-section tb-section-grow">
              <div className="tb-section-h">Manifest <span className="n">{man.total} parts</span></div>
              {man.rows.length === 0 && <div className="tb-hint-sm">Click a part in the locker, then click the grid.</div>}
              {man.rows.length > 0 && (
                <div className="tb-manifest tb-scroll">
                  {man.rows.map((r) => (
                    <div key={r.part.id} className="tb-mani-row">
                      <span className="tb-mani-icon"><Thumb partId={r.part.id} /></span>
                      <span className="tb-mani-name">{r.part.name}</span>
                      <span className="tb-mani-qty">×{r.n}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* build cost */}
            <div className="tb-section">
              <div className="tb-section-h">Build Cost</div>
              <div className="tb-cost">
                {COST_ROWS.map(([key, label, icon]) => (
                  <div key={key} className={`tb-cost-row ${cost[key] ? '' : 'zero'}`}>
                    <img className="tb-cost-ic" src={icon} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                    <span className="tb-cost-val">{cost[key].toLocaleString()}</span>
                    <span className="tb-cost-label">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* requirements */}
            <div className="tb-section">
              <div className="tb-section-h">Build Requirements</div>
              <div className="tb-req">
                {essentialsState.map((e) => (
                  <div key={e.group} className={`tb-req-row ${e.ok ? 'met' : 'unmet'}`}>
                    <span className="tb-req-mark" />
                    <span className="tb-req-label">{e.label}</span>
                    {GROUP_LIMITS[e.group] ? <span className="tb-req-meta">max {GROUP_LIMITS[e.group]}</span> : null}
                  </div>
                ))}
                <div className={`tb-req-row ${man.crew <= MEMBER_LIMIT ? 'met' : 'bad'}`}>
                  <span className="tb-req-mark" />
                  <span className="tb-req-label">Crew quarters</span>
                  <span className="tb-req-meta">{man.crew} / {MEMBER_LIMIT}</span>
                </div>
                <div className={`tb-req-row ${paths.ok ? 'met' : 'bad'}`}>
                  <span className="tb-req-mark" />
                  <span className="tb-req-label">
                    Walking paths
                    {paths.unreachable.length > 0 && <> — can&apos;t reach {paths.unreachable.map((g) => g.toLowerCase()).join(', ')}</>}
                  </span>
                </div>
              </div>
            </div>

            {/* actions */}
            <div className="tb-actions">
              <Button
                size="sm"
                className="tb-publish"
                onClick={() => {
                  if (!signedIn) { setGateOpen(true); return }
                  setPub((p) => ({ ...p, name: p.name || state.name }))
                  setPubThumb(captureRef.current ? captureRef.current() : null)
                  setPubOpen(true)
                }}
              >
                ★ Publish to gallery
              </Button>
            </div>
        </aside>
      </div>

      {/* Transient toast — rendered at the app root so it sits above the modals. */}
      {notice && <div className="tb-notice">{notice}</div>}

      {/* ===================== MODALS ===================== */}
      {shareOpen && (
        <Modal
          title="Share this rig" icon="⤴" onClose={() => setShareOpen(false)}
          footer={<Button variant="ghost" size="sm" onClick={() => setShareOpen(false)}>Close</Button>}
        >
          <p>Copy this code and send it to anyone — they paste it into <b>Import</b> to load your exact build. The code holds the chassis and every placed part.</p>
          <div className="tb-modal-block">
            <span className="blk-h">Share code</span>
            <div className="tb-code-box">
              <input className="code" value={shareText} readOnly />
              <Button size="sm" onClick={() => { flash('copied'); try { navigator.clipboard?.writeText(shareText) } catch { /* clipboard blocked */ } }}>Copy</Button>
            </div>
            <span className="tb-note">Codes are version-tagged — a code from an older patch may skip parts that no longer exist.</span>
          </div>
        </Modal>
      )}

      {importOpen && (
        <Modal
          title="Import a build" icon="⤓" onClose={() => setImportOpen(false)}
          footer={<Button variant="ghost" size="sm" onClick={() => setImportOpen(false)}>Cancel</Button>}
        >
          <div className="tb-modal-block">
            <span className="blk-h">Paste a share code</span>
            <div className="tb-code-box">
              <textarea
                className="code" placeholder="SANDBP2.…" rows={3}
                style={{ color: 'var(--foreground)' }}
                value={shareText}
                onChange={(e) => setShareText(e.target.value)}
              />
              <Button size="sm" onClick={doImport}>Load</Button>
            </div>
            <span className="tb-note">Pasting replaces your current build. Save or share it first if you want to keep it. To load an in-game <b>.wbt</b> save instead, use <b>Load .wbt save</b>.</span>
          </div>
        </Modal>
      )}

      {loadOpen && (
        <Modal
          title="Load in-game save" icon={<span style={{ color: 'var(--info)' }}>⭱</span>} onClose={() => setLoadOpen(false)}
          footer={<Button variant="ghost" size="sm" onClick={() => setLoadOpen(false)}>Cancel</Button>}
        >
          <p>SAND stores each saved trampler as a <b>.wbt</b> file on your machine. Find it, then drop it below — it&apos;s read in your browser and <b>nothing is uploaded</b>.</p>
          <div className="tb-modal-block">
            <span className="blk-h">Where to find your saves</span>
            <ol className="tb-steps">
              <li><span className="sn">1</span>Open your file explorer and paste the path below into the address bar.</li>
              <li><span className="sn">2</span>Pick the rig you want — files are named after the in-game rig.</li>
              <li><span className="sn">3</span>Drop it on the box below (or browse to it).</li>
            </ol>
            <div className="tb-path">
              <code>{SAVE_PATH}</code>
              <Button variant="ghost" size="sm" className="copy" onClick={() => { flash('copied'); try { navigator.clipboard?.writeText(SAVE_PATH) } catch { /* clipboard blocked */ } }}>Copy</Button>
            </div>
            <span className="tb-note">Windows default. On other platforms look under your Sand user-data folder → <b>Data/Walkers</b>.</span>
          </div>
          <div className="tb-modal-block">
            <span className="blk-h">Load the file</span>
            <label className="tb-drop">
              <span className="dz-glyph">⭱</span>
              <span>Drop a <b>.wbt</b> save here, or click to browse</span>
              <input type="file" accept=".wbt,.wbtb" hidden onChange={(e) => { doImportWbt(e.target.files[0]); e.target.value = '' }} />
            </label>
          </div>
        </Modal>
      )}

      {pubOpen && (
        <Modal
          title="Publish to gallery" icon="★" onClose={() => { setPubOpen(false); setPubThumb(null) }}
          footer={<>
            <Button variant="ghost" size="sm" onClick={() => { setPubOpen(false); setPubThumb(null) }}>Cancel</Button>
            <Button size="sm" disabled={pubBusy} onClick={doPublish}>{pubBusy ? 'Submitting…' : 'Submit'}</Button>
          </>}
        >
          <p>Share your build with the community. It goes live in the gallery right away — you can edit or remove it any time.</p>
          {pubThumb && (
            <img
              src={pubThumb}
              alt="Build preview"
              className="tb-pub-thumb"
              style={{ width: '100%', maxHeight: 200, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm, 4px)' }}
            />
          )}
          <div className="tb-pub-fields">
            <input className="tb-input" placeholder="build name" value={pub.name}
              onChange={(e) => setPub({ ...pub, name: e.target.value })} />
          </div>
        </Modal>
      )}

      <SteamGateModal open={gateOpen} onClose={() => setGateOpen(false)} returnTo="/builder" />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear this build?"
        description="This removes every placed part. The chassis is kept. This can't be undone."
        confirmLabel="Clear build"
        cancelLabel="Cancel"
        destructive
        onConfirm={doClear}
      />

      <ConfirmDialog
        open={!!pendingChassis}
        onOpenChange={(o) => { if (!o) setPendingChassis(null) }}
        title="Change hull?"
        description="Switching the hull clears every placed part. This can't be undone."
        confirmLabel="Change hull"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => applyChassis(pendingChassis)}
      />
    </div>
  )
}
