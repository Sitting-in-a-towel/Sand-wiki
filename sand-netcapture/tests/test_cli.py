import json
from pathlib import Path
from sand_netcapture.__main__ import run_transform


def test_run_transform_reads_capture_and_writes_output(tmp_path: Path):
    captures = tmp_path / "captures"
    captures.mkdir()
    (captures / "GetResearchTree.json").write_text(json.dumps({
        "Result": {"Nodes": [{
            "Id": "abc", "Fraction": 0, "Tier": 0,
            "CompartmentDefinitionIds": ["c1"], "ResearchPrice": [], "RequiredNodesIds": [],
        }]}
    }), encoding="utf-8")
    out = tmp_path / "tech-tree.json"
    run_transform(
        captures_dir=captures,
        out_path=out,
        fraction_factions=["godlewski", "kaiser", "landwehr"],
        tier_offset=1,
    )
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["nodes"][0]["id"] == "abc"
    assert data["nodes"][0]["faction"] == "godlewski"
    assert data["nodes"][0]["tier"] == 1
