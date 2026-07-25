# SAND Net-Capture

Passively captures the SAND game client's own PlayFab / master-server HTTPS responses
(research tree, compartment definitions, shop, etc.) and transforms them for the Unofficial
SAND Wiki. Companion to the offline `sand-scraper` (which reads static game bundles).

- Design: `../docs/superpowers/specs/2026-07-11-sand-netcapture-design.md`

## Safety — read this first

- **Observe-only.** The proxy forwards every request/response unmodified and only copies
  response bodies to disk. No request tampering, no response injection, no replay, no extra
  requests to the server.
- **You drive the game by hand.** The tool never automates or talks to the client.
- **Never commit `out/`.** Raw captures contain session tickets / account data. `out/` is
  gitignored; only redacted fixtures and transformed outputs are committed.
- **No guarantee against bans.** MITM of your own client is inherently against some games'
  ToS even when passive. Accepted trade-off; kept minimal.

## Setup

```
python -m venv .venv
.venv\Scripts\python -m pip install -e ".[dev]"
```

## Phase 0 — Probe (do this once, before trusting the tool)

Confirms the client's TLS is not certificate-pinned and records the real hostnames.

1. Install mitmproxy's root CA: run `.venv\Scripts\mitmdump` once, browse to
   http://mitm.it from the machine, install the Windows cert (Local Machine → Trusted Root).
2. Start `.venv\Scripts\mitmdump -p 8080`.
3. Set Windows proxy to `127.0.0.1:8080` (Settings → Network → Proxy), launch the game, log in.
4. **If you see decoded PlayFab/master JSON flow by:** not pinned — note the hostnames and put
   them in `config.toml`'s `host_allowlist`. Proceed to Phase 1.
5. **If the game fails to connect / mitmproxy logs TLS handshake errors:** the client pins its
   certs. Stop — the proxy approach won't work; see "Fallback" below.
6. Turn the Windows proxy back off.

## Phase 1 — Guided capture

1. Edit `config.toml`: set `host_allowlist` (from the probe) and `expected_endpoints`.
2. Run:
   ```
   .venv\Scripts\python -m sand_netcapture capture
   ```
   This enables the system proxy, starts the recorder, and prints a live checklist.
3. Launch the game, log in, and click through the menus (research tree, shop, storage,
   expeditions, characters) until every endpoint shows `[x]`.
4. Press Ctrl+C. The system proxy is restored automatically.

Raw responses land in `out/captures/<Endpoint>.json` plus `out/captures/_index.json`.

## Transform

```
.venv\Scripts\python -m sand_netcapture transform
```

Writes `out/tech-tree.json` — an authoritative, ID-based research tree (faction slug, tier,
compartment ids, cost, prerequisite node ids), stable-sorted by id.

**Note:** the server response has no node display names or a/b/c letters — those in the wiki's
legacy `tech-tree-extracted.json` were hand-added. Resolving names (join with
`GetCompartmentDefinitions` + localization) and wiring this into the wiki generator are
follow-ups (see the design doc's "future work").

## Fallback (cert pinning)

If Phase 0 shows pinning, the proxy cannot decrypt the traffic. The documented fallback is a
Frida in-process hook that reads plaintext before encryption — significantly more work
(IL2CPP RE, brittle per patch). Not implemented; reassess with the user before pursuing.

## Tests

```
.venv\Scripts\python -m pytest
```
Pure unit tests over committed fixtures. The live capture session is manual (not automated).
