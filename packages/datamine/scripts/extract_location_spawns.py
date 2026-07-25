"""Extract per-LOCATION item spawns (which items each island/POI/event places), so notable
location loot (e.g. the Dreadnought's experimental cannons) can be attributed to its page.

Two-hop resolve:
  1. Canonical spawner EPBs (epb_assets_all) -> decode SpawnerData/SpawnerSetDataComponent ->
     blueprint(s) + per-set weight + mandatory. (weights let us compute a real drop %.)
  2. Walk each location prefab's Transform tree (islands/pois/environmentsetup) -> collect its
     spawner child instances -> join to (1).

Output: extracted/json/location_spawns.json = { "<root>": { "bundle", "spawns": [
  {blueprint, count, weight, spawnerTotalWeight, mandatory, spawner} ] } }
Run from packages/datamine/ :  python scripts/extract_location_spawns.py
"""
import UnityPy, json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from odin_parser import decode

BASE = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64/'
LOC_BUNDLES = ['islands_assets_all.bundle', 'pois_assets_all.bundle', 'environmentsetup_assets_all.bundle']

def component_type(c):
    return str(c.get('$type', '')).split(',')[0].split('.')[-1]

def as_int(v, d=1):
    try: return int(v)
    except (TypeError, ValueError): return d

# ---- 1. canonical spawner EPB -> [{blueprint, count, weight, spawnerTotalWeight, mandatory}] ----
def decode_spawner(doc):
    """Return (entries, mandatory). entries: list of {blueprint,count,weight}. For a single
    SpawnerData -> one entry weight=None. For SpawnerSet -> one entry per set's blueprint(s),
    weight = that set's weight."""
    entries, mandatory = [], False
    for comp in doc.get('components', {}).get('$items', []):
        if not isinstance(comp, dict):
            continue
        ct = component_type(comp)
        if ct == 'SpawnerDataComponent':
            bp = comp.get('blueprint')
            if bp:
                entries.append({'blueprint': bp, 'count': as_int(comp.get('itemCount', 1)), 'weight': None})
                mandatory = mandatory or bool(comp.get('mandatory'))
        elif ct == 'SpawnerSetDataComponent':
            mandatory = mandatory or bool(comp.get('mandatory'))
            for s in (comp.get('items', {}) or {}).get('$items', []):
                if not isinstance(s, dict):
                    continue
                w = as_int(s.get('weight', 1))
                # a Set holds one or more ItemSets (blueprint + count) under items/itemSets
                for key in ('items', 'itemSets'):
                    for it in (s.get(key, {}) or {}).get('$items', []) if isinstance(s.get(key), dict) else []:
                        if isinstance(it, dict) and it.get('blueprint'):
                            entries.append({'blueprint': it['blueprint'], 'count': as_int(it.get('count', 1)), 'weight': w})
    total = sum(e['weight'] for e in entries if e['weight'] is not None)
    for e in entries:
        e['spawnerTotalWeight'] = total or None
    return entries, mandatory

spawner_map = {}
env = UnityPy.load(BASE + 'epb_assets_all.bundle')
objs = {o.path_id: o for o in env.objects}
for obj in env.objects:
    if obj.type.name != 'GameObject':
        continue
    try:
        go = obj.read()
        name = go.m_Name
        if 'Spawner' not in name or not name.endswith('_epb'):
            continue
        comps = go.m_Component if hasattr(go, 'm_Component') else go.m_Components
        merged = {'components': {'$items': []}}
        for c in comps:
            ptr = c['component'] if isinstance(c, dict) else c.component
            pid = ptr['m_PathID'] if isinstance(ptr, dict) else ptr.path_id
            o = objs.get(pid)
            if not o or o.type.name != 'MonoBehaviour':
                continue
            sb = (o.read_typetree().get('serializationData') or {}).get('SerializedBytes')
            if not sb:
                continue
            try:
                merged['components']['$items'].extend(decode(sb).get('components', {}).get('$items', []))
            except Exception:
                pass
        entries, mandatory = decode_spawner(merged)
        if entries:
            spawner_map[name.removesuffix('_epb')] = {'entries': entries, 'mandatory': mandatory}
    except Exception:
        pass
print(f'canonical spawners with blueprints: {len(spawner_map)}')

# ---- 2. walk location prefab trees, join spawner instances to canonical blueprints ----
SUFFIX = re.compile(r'(_\d+)?$')
def canonical(name):
    return SUFFIX.sub('', name).removesuffix('_epb')

result = {}
for b in LOC_BUNDLES:
    env = UnityPy.load(BASE + b)
    transforms, go_names = {}, {}
    for obj in env.objects:
        if obj.type.name == 'Transform':
            try: transforms[obj.path_id] = obj.read_typetree()
            except Exception: pass
        elif obj.type.name == 'GameObject':
            try: go_names[obj.path_id] = obj.read().m_Name
            except Exception: pass
    parent, tf_go, children = {}, {}, {}
    for pid, t in transforms.items():
        tf_go[pid] = (t.get('m_GameObject') or {}).get('m_PathID')
        parent[pid] = (t.get('m_Father') or {}).get('m_PathID', 0)
    for pid, par in parent.items():
        if par: children.setdefault(par, []).append(pid)
    roots = [pid for pid, par in parent.items() if not par]

    for r in roots:
        root_name = go_names.get(tf_go.get(r))
        if not root_name:
            continue
        spawns = []
        stack = [r]
        while stack:
            cur = stack.pop()
            stack.extend(children.get(cur, []))
            nm = go_names.get(tf_go.get(cur), '')
            if 'Spawner' not in nm:
                continue
            canon = canonical(nm)
            sp = spawner_map.get(canon)
            if not sp:
                continue
            for e in sp['entries']:
                spawns.append({**e, 'mandatory': sp['mandatory'], 'spawner': canon})
        if spawns:
            entry = result.setdefault(root_name, {'bundle': b, 'spawns': []})
            entry['spawns'].extend(spawns)

os.makedirs('extracted/json', exist_ok=True)
json.dump(result, open('extracted/json/location_spawns.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f'locations with spawns: {len(result)}')
d = result.get('loc_event_Dreadnought')
if d:
    bps = sorted({s['blueprint'] for s in d['spawns']})
    print(f'Dreadnought: {len(d["spawns"])} spawn entries, {len(bps)} distinct blueprints')
    print('  T4/artefact:', [b for b in bps if 'T4' in b or 'Artefact' in b or 'artefact' in b])
