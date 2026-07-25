"""Pure item-id -> wiki-slug resolver, shared by loot/enemy builders.
make_resolver(wiki_items, aliases) -> resolve(lid, fallback_name=None) -> (slug|None, name, ok).
Match order: explicit alias -> exact id (case-insensitive) -> drop-suffix strip -> name match.
"""
import re

DROP_SUFFIX = re.compile(r"(_mob ?drop|_mine ?drop|mobdrop|minedrop)$", re.I)

def make_resolver(wiki_items, aliases):
    by_id = {w["id"]: w for w in wiki_items if w.get("id")}
    by_id_lc = {w["id"].lower(): w for w in wiki_items if w.get("id")}
    by_name = {w["name"].lower(): w for w in wiki_items if w.get("name")}
    by_slug = {w["slug"]: w for w in wiki_items if w.get("slug")}

    def resolve(lid, fallback_name=None):
        name = fallback_name or lid
        if lid in aliases:
            s = aliases[lid]
            w = by_slug.get(s)
            return s, (w["name"] if w else name), (w is not None)
        w = by_id.get(lid) or by_id_lc.get(lid.lower())
        if w:
            return w["slug"], w["name"], True
        base = DROP_SUFFIX.sub("", lid)
        if base != lid:
            w = by_id.get(base) or by_id_lc.get(base.lower())
            if w:
                return w["slug"], w["name"], True
        if name.lower() in by_name:
            w = by_name[name.lower()]
            return w["slug"], w["name"], True
        return None, name, False

    return resolve
