from pathlib import Path
from sand_netcapture.config import load_config


def test_load_config_parses_all_fields(tmp_path: Path):
    cfg_file = tmp_path / "config.toml"
    cfg_file.write_text(
        'proxy_port = 9090\n'
        'host_allowlist = ["playfabapi.com"]\n'
        'expected_endpoints = ["Login", "GetResearchTree"]\n'
        'captures_dir = "out/captures"\n'
        'fraction_factions = ["godlewski", "kaiser", "landwehr"]\n'
        'tier_offset = 1\n',
        encoding="utf-8",
    )
    cfg = load_config(cfg_file)
    assert cfg.proxy_port == 9090
    assert cfg.host_allowlist == ["playfabapi.com"]
    assert cfg.expected_endpoints == ["Login", "GetResearchTree"]
    assert cfg.captures_dir == tmp_path / "out" / "captures"
    assert cfg.fraction_factions == ["godlewski", "kaiser", "landwehr"]
    assert cfg.tier_offset == 1


def test_load_config_missing_file_raises(tmp_path: Path):
    import pytest
    with pytest.raises(FileNotFoundError):
        load_config(tmp_path / "nope.toml")
