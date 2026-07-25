"""Extract loose world/ground item spawns from the game's spawner prefabs.

Ground items are data-driven: GameObjects named *Spawner*_epb carry a
`SpawnerDataComponent` (single blueprint) or `SpawnerSetDataComponent` (weighted
sets of blueprints). Their Transform is the placement; the item choice + counts are
the data. We only need WHICH blueprints spawn loose + their stack counts — the exact
per-item probability is not globally meaningful (weights are local to each spawner and
the same item spawns from many POIs), so we don't compute a chance.

Walks epb_assets_all.bundle (the canonical, named standalone spawner EPBs) and
aggregates per blueprint. Output: extracted/json/world_spawns.json.
Run from packages/datamine/ :  python scripts/extract_world_spawns.py
"""
import UnityPy, json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from odin_parser import decode

BASE = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64/'
BUNDLES = ['epb_assets_all.bundle']

def component_type(c):
    return str(c.get('$type', '')).split(',')[0].split('.')[-1]

def as_int(v, default=1):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default

def collect_blueprints(node, out):
    """Recursively find every {'blueprint': <id>, ...} dict, capturing a nearby count.
    Robust to the exact SpawnerData/SpawnerSet nesting (blueprint may sit under
    items->Set->ItemSet). Count comes from a sibling 'count'/'itemCount' (default 1)."""
    if isinstance(node, dict):
        bp = node.get('blueprint')
        if isinstance(bp, str) and bp:
            cnt = as_int(node.get('count', node.get('itemCount', 1)))
            out.append((bp, cnt))
        for v in node.values():
            collect_blueprints(v, out)
    elif isinstance(node, list):
        for v in node:
            collect_blueprints(v, out)
    elif isinstance(node, dict) is False and hasattr(node, 'get'):
        pass

result = {}
errors = 0
spawner_objs = 0
for b in BUNDLES:
    env = UnityPy.load(BASE + b)
    objs = {obj.path_id: obj for obj in env.objects}
    for obj in env.objects:
        if obj.type.name != 'GameObject':
            continue
        try:
            go = obj.read()
            name = go.m_Name
            if 'Spawner' not in name or not name.endswith('_epb'):
                continue
            comps = go.m_Component if hasattr(go, 'm_Component') else go.m_Components
            spawner_hit = False
            for c in comps:
                ptr = c['component'] if isinstance(c, dict) else c.component
                pid = ptr['m_PathID'] if isinstance(ptr, dict) else ptr.path_id
                o = objs.get(pid)
                if not o or o.type.name != 'MonoBehaviour':
                    continue
                t = o.read_typetree()
                sb = t.get('serializationData', {}).get('SerializedBytes', [])
                if not sb:
                    continue
                try:
                    doc = decode(sb)
                except Exception:
                    errors += 1
                    continue
                for comp in doc.get('components', {}).get('$items', []):
                    if not isinstance(comp, dict):
                        continue
                    ctype = component_type(comp)
                    if 'SpawnerDataComponent' not in ctype and 'SpawnerSetDataComponent' not in ctype:
                        continue
                    spawner_hit = True
                    mandatory = bool(comp.get('mandatory'))
                    pairs = []
                    collect_blueprints(comp, pairs)
                    for bp, cnt in pairs:
                        e = result.setdefault(bp, {
                            'countMin': cnt, 'countMax': cnt, 'spawners': 0, 'mandatoryAny': False,
                        })
                        e['countMin'] = min(e['countMin'], cnt)
                        e['countMax'] = max(e['countMax'], cnt)
                        e['spawners'] += 1
                        e['mandatoryAny'] = e['mandatoryAny'] or mandatory
            if spawner_hit:
                spawner_objs += 1
        except Exception:
            errors += 1

os.makedirs('extracted/json', exist_ok=True)
json.dump(result, open('extracted/json/world_spawns.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f'{spawner_objs} spawner EPBs, {len(result)} distinct blueprints, {errors} decode errors')
print('sample:', json.dumps(dict(sorted(result.items(), key=lambda kv: -kv[1]["spawners"])[:12]), indent=1))
