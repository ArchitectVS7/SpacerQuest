# Steam demo depot — Spacer Quest: Rimward (Demo)

**T-1703.** The demo ships as a **distinct Steam application/depot** from the full game,
not a branch of it. This is the standard Steam demo model: a separate appid that links
to the full game's store page, its own depot, and its own build.

## Identity

| Field           | Value                                                            |
| --------------- | --------------------------------------------------------------- |
| Product name    | `Spacer Quest — Rimward (Demo)`                                  |
| Bundle appId    | `com.spacerquest.rimward.demo` (`electron-builder.demo.yml`)     |
| Dev-sandbox appid | `480` (Valve's Spacewar) — `packages/desktop/steam_appid.demo.txt` |
| Real demo appid | **TODO — provisioned in T-1704** (release checklist)            |
| Real demo depot id | **TODO — provisioned in T-1704**                             |
| Content root    | the demo `electron-builder --dir` / dmg output (`release-demo/`) |

The distinct `appId` gives the demo its own macOS bundle id and its own userData dir, so
a demo and the full game installed on the same machine never share a local save store.

## Build

```
# renderer built with VITE_SQ_DEMO=1 (bakes the gate), then packaged with the demo config
npm run package:demo:dir -w @spacerquest/desktop   # unsigned --dir (CI / size check)
npm run package:demo     -w @spacerquest/desktop   # dmg + nsis installers
```

The demo bundle is byte-identical to the full bundle EXCEPT the renderer carries the
`VITE_SQ_DEMO=1` flag, which:

- caps play at day **33** (Tour One's 30 days + 3 post-resolution days) and raises the
  end-of-demo wall when the final day is ended;
- gates the three veteran systems behind teasers — **ports**, **Hangout progression**
  (crew hiring + Penny Wise lending), and the **Conqueror** capstone.

The save envelope (`sq.save.v1`, key + format) is identical between builds, so a demo
save **carries into the full game**: the full build sets `DEMO_BUILD = false`, lifting
the wall and every gate, and a day-33 demo career simply continues.

## Steam appid wiring

`packages/desktop/src/main.ts` `resolveSteamAppId()` probes `steam_appid.demo.txt`
before `steam_appid.txt`, so a demo package that ships the demo appid file reports the
demo appid to Steam. Today both files carry `480` (dev sandbox). Writing the **real**
demo depot appid into `steam_appid.demo.txt` and shipping it in the demo package is a
**T-1704 release-checklist item** — the same deferral T-1702 made for the full game's
real depot appid. No fabricated appid is committed here.

## Release checklist (T-1704)

- [ ] Provision the demo appid + depot id in the Steamworks partner site.
- [ ] Write the real demo appid into `packages/desktop/steam_appid.demo.txt` and ship it
      in the demo package (`files:` / `extraResources:` in `electron-builder.demo.yml`).
- [ ] Link the demo app to the full game's store page (Steamworks "demo" association).
- [ ] Upload the `release-demo/` content to the demo depot; smoke-test the store demo
      install boots and gates correctly.
