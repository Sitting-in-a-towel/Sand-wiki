import json
from pathlib import Path
from sand_netcapture.transform_research_tree import transform_research_tree

FIXTURE = Path(__file__).parent / "fixtures" / "master_GetResearchTree.min.json"
FACTIONS = ["godlewski", "kaiser", "landwehr"]


def test_transform_maps_fields_and_sorts_by_id():
    raw = json.loads(FIXTURE.read_text(encoding="utf-8"))
    result = transform_research_tree(raw, fraction_factions=FACTIONS, tier_offset=1)
    nodes = result["nodes"]
    # stable-sorted by id -> "76abc..." comes before "f67098..."
    assert [n["id"] for n in nodes] == [
        "76abc596-d1b3-4661-8950-ae66a3964fb2",
        "f67098d9-f21c-4cb2-a43c-1319e74b844b",
    ]
    first = nodes[0]
    assert first["faction"] == "kaiser"          # Fraction 1 -> index 1
    assert first["tier"] == 2                      # Tier 1 + offset 1
    assert first["unlockCompartmentIds"] == ["walker_compEngine_Small_Steel_1x1_aaa"]
    assert first["unlockCost"] == [
        {"name": "Crowns", "itemId": "item_coinCrown", "amount": 1500},
        {"name": "Weird Coral", "itemId": "item_weirdCoral", "amount": 15},
    ]
    assert first["prereqIds"] == []
    # second node references the first as a prereq
    assert nodes[1]["prereqIds"] == ["76abc596-d1b3-4661-8950-ae66a3964fb2"]


def test_unknown_fraction_index_falls_back_to_string():
    raw = {"Result": {"Nodes": [{
        "Id": "x", "Fraction": 9, "Tier": 0,
        "CompartmentDefinitionIds": [], "ResearchPrice": [], "RequiredNodesIds": [],
    }]}}
    result = transform_research_tree(raw, fraction_factions=FACTIONS, tier_offset=1)
    assert result["nodes"][0]["faction"] == "fraction-9"
