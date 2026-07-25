from __future__ import annotations

from typing import Any


def _faction_slug(fraction: int, fraction_factions: list[str]) -> str:
    if 0 <= fraction < len(fraction_factions):
        return fraction_factions[fraction]
    return f"fraction-{fraction}"


def _cost(price: list[dict]) -> list[dict]:
    return [
        {"name": p.get("_name"), "itemId": p.get("ItemDefinition"), "amount": p.get("Amount")}
        for p in price
    ]


def transform_research_tree(raw: dict[str, Any], *, fraction_factions: list[str], tier_offset: int) -> dict:
    """GetResearchTree server response -> authoritative ID-based node list.

    Emits comp-ids and node-id prereqs verbatim; display-name/letter resolution is a
    separate follow-up (see design 'future work'). Stable-sorted by id for clean diffs.
    """
    nodes = []
    for n in raw.get("Result", {}).get("Nodes", []):
        nodes.append({
            "id": n["Id"],
            "faction": _faction_slug(int(n.get("Fraction", -1)), fraction_factions),
            "tier": int(n.get("Tier", 0)) + tier_offset,
            "unlockCompartmentIds": list(n.get("CompartmentDefinitionIds", [])),
            "unlockCost": _cost(n.get("ResearchPrice", [])),
            "prereqIds": list(n.get("RequiredNodesIds", [])),
        })
    nodes.sort(key=lambda x: x["id"])
    return {
        "_meta": {"source": "master_GetResearchTree", "note": "authoritative ID-based tree; display names/letters resolved separately"},
        "nodes": nodes,
    }
