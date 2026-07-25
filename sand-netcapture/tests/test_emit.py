import json
from pathlib import Path
from sand_netcapture.emit import write_json


def test_write_json_pretty_utf8_trailing_newline(tmp_path: Path):
    out = tmp_path / "sub" / "data.json"
    write_json({"b": 1, "a": 2}, out)
    text = out.read_text(encoding="utf-8")
    assert text.endswith("\n")
    assert json.loads(text) == {"b": 1, "a": 2}
    assert '  "b": 1' in text  # 2-space indent
