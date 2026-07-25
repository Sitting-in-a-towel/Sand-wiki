import json
from pathlib import Path
from sand_netcapture.capture import CaptureAddon


def make_addon(tmp_path: Path) -> CaptureAddon:
    return CaptureAddon(
        captures_dir=tmp_path / "captures",
        host_allowlist=["playfabapi.com"],
        expected_endpoints=["GetResearchTree", "Login"],
    )


def test_allowed_response_writes_body_and_index(tmp_path: Path):
    addon = make_addon(tmp_path)
    addon.handle_response(
        host="abc.playfabapi.com",
        url="https://abc.playfabapi.com/Client/GetResearchTree",
        status=200,
        body=b'{"Result":{"Nodes":[]}}',
        timestamp="2026-07-11T12:00:00Z",
    )
    body_file = tmp_path / "captures" / "GetResearchTree.json"
    index_file = tmp_path / "captures" / "_index.json"
    assert body_file.read_bytes() == b'{"Result":{"Nodes":[]}}'
    index = json.loads(index_file.read_text(encoding="utf-8"))
    assert index[0]["key"] == "GetResearchTree"
    assert "GetResearchTree" in addon.seen


def test_disallowed_host_is_ignored(tmp_path: Path):
    addon = make_addon(tmp_path)
    addon.handle_response(
        host="tracker.evil.com",
        url="https://tracker.evil.com/collect",
        status=200,
        body=b"nope",
        timestamp="2026-07-11T12:00:00Z",
    )
    assert not (tmp_path / "captures").exists() or not any((tmp_path / "captures").iterdir())
    assert addon.seen == set()


def test_non_200_recorded_but_not_counted_as_seen(tmp_path: Path):
    addon = make_addon(tmp_path)
    addon.handle_response(
        host="abc.playfabapi.com",
        url="https://abc.playfabapi.com/Client/Login",
        status=500,
        body=b"err",
        timestamp="2026-07-11T12:00:00Z",
    )
    index = json.loads((tmp_path / "captures" / "_index.json").read_text(encoding="utf-8"))
    assert index[0]["status"] == 500
    assert addon.seen == set()  # failures do not count toward coverage
