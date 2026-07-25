"""Extract the locked-crate (Military/Valuables/Utility Box) loot pool.

Locked boxes don't use the LootSetupData/loot-table model — they carry a
RandomLootContainerDataComponent (containerType + per-tier roll chances) and pull
their items from `conf_worldContractsConfig._lockedBoxLootData` in
configuration_assets_all.bundle. Each entry is a LockedBoxLootData
{lockedContainerType, rewardTier, items:[{itemBlueprint, count}]} — one "set". The box
rolls a reward tier, then one random set within (containerType, rewardTier).

Output: extracted/json/lockbox_loot.json = { "<containerType>": { "<tier>": [ [ {item,count}, ... ], ... ] } }
Run from packages/datamine/:  python scripts/extract_lockbox_loot.py
"""
import sys, os, json
import UnityPy
sys.path.insert(0, os.path.dirname(__file__))
import odin_parser

AA = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64'
BUNDLE = os.path.join(AA, 'configuration_assets_all.bundle')
TARGET = 'conf_worldContractsConfig'

env = UnityPy.load(BUNDLE)
doc = None
for o in env.objects:
    if o.type.name != 'MonoBehaviour':
        continue
    try:
        tt = o.read_typetree()
    except Exception:
        continue
    if (tt.get('m_Name') if isinstance(tt, dict) else '') != TARGET:
        continue
    sb = (tt.get('serializationData') or {}).get('SerializedBytes')
    if sb:
        doc = odin_parser.decode(sb)
    break

if doc is None:
    raise SystemExit(f'{TARGET} not found (or no SerializedBytes) in {os.path.basename(BUNDLE)}')

entries = (doc.get('_lockedBoxLootData') or {}).get('$items') or []
result = {}
for e in entries:
    if not isinstance(e, dict):
        continue
    ct = str(e.get('lockedContainerType'))
    tier = str(e.get('rewardTier'))
    items = (e.get('items') or {}).get('$items') or []
    the_set = [
        {'item': it.get('itemBlueprint'), 'count': it.get('count', 1)}
        for it in items if isinstance(it, dict) and it.get('itemBlueprint')
    ]
    result.setdefault(ct, {}).setdefault(tier, []).append(the_set)

# Per-crate roll data from the EPBs: RandomLootContainerDataComponent carries the
# containerType + rewardTierChances (index-aligned to the rewardTier keys above), which
# weight how often each tier is rolled. Walk the three locked-box EPBs.
CRATE_EPBS = {'game_lockedBox_military_epb', 'game_lockedBox_valuables_epb', 'game_lockedBox_utility_epb'}

def _component_type(c):
    return str(c.get('$type', '')).split(',')[0].split('.')[-1]

def _tier_chances(v):
    """RewardTierChances {chanceS,chanceA,chanceB,chanceC,chanceD} -> {tierIndex: chance},
    index-aligned to the rewardTier keys (0=S,1=A,2=B,3=C,4=D)."""
    if not isinstance(v, dict):
        return {}
    keys = ['chanceS', 'chanceA', 'chanceB', 'chanceC', 'chanceD']
    return {str(i): v.get(k, 0) for i, k in enumerate(keys)}

crates = {}
epbenv = UnityPy.load(os.path.join(AA, 'epb_assets_all.bundle'))
objs = {o.path_id: o for o in epbenv.objects}
for obj in epbenv.objects:
    if obj.type.name != 'GameObject':
        continue
    try:
        go = obj.read()
        if go.m_Name not in CRATE_EPBS:
            continue
        comps = go.m_Component if hasattr(go, 'm_Component') else go.m_Components
        for c in comps:
            ptr = c['component'] if isinstance(c, dict) else c.component
            pid = ptr['m_PathID'] if isinstance(ptr, dict) else ptr.path_id
            o = objs.get(pid)
            if not o or o.type.name != 'MonoBehaviour':
                continue
            sb = (o.read_typetree().get('serializationData') or {}).get('SerializedBytes')
            if not sb:
                continue
            d = odin_parser.decode(sb)
            for comp in d.get('components', {}).get('$items', []):
                if isinstance(comp, dict) and 'RandomLootContainerDataComponent' in _component_type(comp):
                    crates[go.m_Name.removesuffix('_epb')] = {
                        'containerType': str(comp.get('containerType')),
                        'tierChances': _tier_chances(comp.get('rewardTierChances')),
                    }
    except Exception:
        pass

os.makedirs('extracted/json', exist_ok=True)
out = {'lootData': result, 'crates': crates}
json.dump(out, open('extracted/json/lockbox_loot.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False, default=str)
print(f'{len(entries)} LockedBoxLootData entries; containerTypes: {sorted(result)}')
for ct, tiers in sorted(result.items()):
    print(f'  containerType {ct}: ' + ', '.join(f'{t}={len(sets)} sets' for t, sets in sorted(tiers.items())))
print('crate roll data:', json.dumps(crates, indent=1, default=str))
