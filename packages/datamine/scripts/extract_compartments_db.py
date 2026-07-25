"""Extract the CompartmentsDatabase TextAsset.

The asset has migrated between bundles across builds (walkereditor -> walkershared
in the 2026-07-10 build), so probe the likely bundles rather than hard-coding one.
"""
import UnityPy, io, sys, os

BASE = 'gamefiles/Sand_Data/StreamingAssets/aa/StandaloneWindows64'
CANDIDATES = [
    'walkershared_assets_all.bundle',
    'walkereditor_assets_all.bundle',
    'walker_assets_all.bundle',
]

wrote = False
for bundle in CANDIDATES:
    path = os.path.join(BASE, bundle)
    if not os.path.exists(path):
        continue
    env = UnityPy.load(path)
    for o in env.objects:
        if o.type.name != 'TextAsset':
            continue
        d = o.read()
        if 'ompartment' in d.m_Name:
            raw = d.m_Script if isinstance(d.m_Script, bytes) else d.m_Script.encode('utf-8', 'surrogateescape')
            open('extracted/json/compartments_database.json', 'wb').write(raw)
            print(f'{bundle} :: {d.m_Name} -> wrote extracted/json/compartments_database.json, {len(raw)} bytes')
            wrote = True
            break
    if wrote:
        break

if not wrote:
    print('NOT FOUND: CompartmentsDatabase TextAsset in', CANDIDATES, file=sys.stderr)
    sys.exit(1)
