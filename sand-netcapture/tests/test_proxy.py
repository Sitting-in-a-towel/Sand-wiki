from sand_netcapture.proxy import build_proxy_server, ProxyState, apply_state


def test_build_proxy_server_format():
    assert build_proxy_server(8080) == "127.0.0.1:8080"


def test_apply_state_round_trips_through_a_fake_backend():
    # Fake registry backend: a dict of {name: (value, kind)}.
    store = {"ProxyEnable": (0, "dword"), "ProxyServer": ("", "sz")}

    def fake_read():
        return ProxyState(enabled=store["ProxyEnable"][0], server=store["ProxyServer"][0])

    def fake_write(state: ProxyState):
        store["ProxyEnable"] = (state.enabled, "dword")
        store["ProxyServer"] = (state.server, "sz")

    prior = fake_read()
    apply_state(ProxyState(enabled=1, server="127.0.0.1:8080"), write=fake_write)
    assert store["ProxyEnable"] == (1, "dword")
    assert store["ProxyServer"] == ("127.0.0.1:8080", "sz")

    apply_state(prior, write=fake_write)  # restore
    assert store["ProxyEnable"] == (0, "dword")
    assert store["ProxyServer"] == ("", "sz")
