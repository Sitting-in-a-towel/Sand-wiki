from sand_netcapture.coverage import format_checklist, all_captured


def test_format_checklist_marks_seen_and_missing():
    text = format_checklist(expected=["Login", "GetResearchTree"], seen={"Login"})
    assert "[x] Login" in text
    assert "[ ] GetResearchTree" in text


def test_all_captured_true_only_when_every_expected_seen():
    assert all_captured(expected=["Login", "GetResearchTree"], seen={"Login"}) is False
    assert all_captured(expected=["Login", "GetResearchTree"], seen={"Login", "GetResearchTree"}) is True
    assert all_captured(expected=["Login"], seen={"Login", "Extra"}) is True
