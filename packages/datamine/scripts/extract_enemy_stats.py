"""Extract per-enemy gameplay stats (HP, niceName, type) from the mob_* EPB prefabs.
Odin-decodes each allow-listed GameObject's components. Output: extracted/json/enemy_stats.json
Run from packages/datamine/ :  python scripts/extract_enemy_stats.py

Only `hp` is consumed downstream (by build_enemies.py). `niceName`, `type`, and `components`
are informational — they help author transform/overrides/enemy-overrides.json, where the
authoritative name/type/variant mapping actually lives (the override wins).
"""
import UnityPy, json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from odin_parser import decode

BASE = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64/'
BUNDLES = ['epb_assets_all.bundle']

# EPB names (without the _epb suffix) we care about. Everything else is skipped.
ALLOW = {
    'mob_ghoul', 'mob_ghoul_melee', 'mob_ghoul_turret',
    'mob_ironclad_Buckler', 'mob_ironclad_Falchion', 'mob_ironclad_Tophelm',
}

def component_type(c):
    return str(c.get('$type', '')).split(',')[0].split('.')[-1]

def find_hp(doc):
    """Scan the HealthDataComponent for the first health-like numeric (handles a scalar
    `value` or a nested {value:{...}} shape). Returns int HP or None."""
    for c in doc.get('components', {}).get('$items', []):
        if not isinstance(c, dict) or 'HealthDataComponent' not in component_type(c):
            continue
        v = c.get('value')
        if isinstance(v, (int, float)):
            return int(v)
        if isinstance(v, dict):
            for k in ('value', 'health', 'maxHealth', 'hp'):
                if isinstance(v.get(k), (int, float)):
                    return int(v[k])
        for k in ('health', 'maxHealth', 'hp', 'maxHp'):
            if isinstance(c.get(k), (int, float)):
                return int(c[k])
    return None

def find_nice_name(doc):
    for c in doc.get('components', {}).get('$items', []):
        if isinstance(c, dict) and 'NiceNameDataComponent' in component_type(c):
            return c.get('name') or c.get('value')
    return None

def classify(types):
    if any('Trampler' in t or 'Walker' in t for t in types):
        return 'enemy-trampler'
    return 'creature'

result, errors = {}, 0
for b in BUNDLES:
    env = UnityPy.load(BASE + b)
    objs = {obj.path_id: obj for obj in env.objects}
    for obj in env.objects:
        if obj.type.name != 'GameObject':
            continue
        try:
            go = obj.read()
            name = go.m_Name
            if not name.endswith('_epb') or name.removesuffix('_epb') not in ALLOW:
                continue
            comps = go.m_Component if hasattr(go, 'm_Component') else go.m_Components
            merged = {'components': {'$items': []}}
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
                merged['components']['$items'].extend(doc.get('components', {}).get('$items', []))
            types = [component_type(c) for c in merged['components']['$items'] if isinstance(c, dict)]
            key = name.removesuffix('_epb')
            result[key] = {
                'hp': find_hp(merged),
                'niceName': find_nice_name(merged),
                'type': classify(types),
                'components': sorted(set(types)),
            }
        except Exception:
            errors += 1

os.makedirs('extracted/json', exist_ok=True)
json.dump(result, open('extracted/json/enemy_stats.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
print(f'{len(result)} enemies extracted, {errors} decode errors')
print(json.dumps(result, indent=1, ensure_ascii=False))
