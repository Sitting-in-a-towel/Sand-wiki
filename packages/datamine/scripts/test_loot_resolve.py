from loot_resolve import make_resolver

WIKI = [
    {"id": "item_pistolAmmo", "slug": "pistol-ammo", "name": "Pistol Ammo"},
    {"id": "item_resourceMetal_t1", "slug": "metal-t1", "name": "Metal"},
    {"id": "item_alloySteel", "slug": "resource-alloy-steel", "name": "Alloy Steel"},
]
ALIASES = {"game_coinCrownPile_10": "coin-crown"}

def test_alias_wins():
    r = make_resolver(WIKI, ALIASES)
    # alias target not in WIKI list -> resolved False but slug returned
    assert r("game_coinCrownPile_10") == ("coin-crown", "game_coinCrownPile_10", False)

def test_direct_id_match():
    r = make_resolver(WIKI, ALIASES)
    assert r("item_pistolAmmo") == ("pistol-ammo", "Pistol Ammo", True)

def test_drop_suffix_strip():
    r = make_resolver(WIKI, ALIASES)
    assert r("item_resourceMetal_t1_mobDrop") == ("metal-t1", "Metal", True)

def test_unresolved():
    r = make_resolver(WIKI, ALIASES)
    slug, name, ok = r("item_totallyUnknown", fallback_name="Unknown Thing")
    assert slug is None and ok is False and name == "Unknown Thing"
