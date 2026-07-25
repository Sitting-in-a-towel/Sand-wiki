from sand_netcapture.capture_core import derive_endpoint_key, host_allowed, build_record


def test_derive_endpoint_key_from_playfab_path():
    assert derive_endpoint_key("https://abc.playfabapi.com/Client/GetResearchTree") == "GetResearchTree"
    assert derive_endpoint_key("https://abc.playfabapi.com/Client/Login?sdk=1") == "Login"


def test_derive_endpoint_key_strips_trailing_slash():
    assert derive_endpoint_key("https://master.example.com/GetShopItems/") == "GetShopItems"


def test_host_allowed_substring_match():
    allow = ["playfabapi.com", "master.example.com"]
    assert host_allowed("abc.playfabapi.com", allow) is True
    assert host_allowed("evil.com", allow) is False


def test_host_allowed_ignores_empty_fragments():
    # An empty fragment must NOT match every host (would capture all traffic).
    assert host_allowed("anything.com", [""]) is False
    assert host_allowed("anything.com", []) is False


def test_build_record_captures_metadata():
    rec = build_record(
        key="GetResearchTree",
        url="https://abc.playfabapi.com/Client/GetResearchTree",
        status=200,
        body=b'{"ok":true}',
        timestamp="2026-07-11T12:00:00Z",
    )
    assert rec == {
        "key": "GetResearchTree",
        "url": "https://abc.playfabapi.com/Client/GetResearchTree",
        "status": 200,
        "size": 11,
        "timestamp": "2026-07-11T12:00:00Z",
    }
