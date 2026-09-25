<p align="center">
  <img src="https://raw.githubusercontent.com/tasict/homebridge-daikin-local-platform/master/branding/icon-100.png" width="96" height="96" alt="">
</p>

# Homebridge Daikin Local Platform

**Website: [tasict.github.io/homebridge-daikin-local-platform](https://tasict.github.io/homebridge-daikin-local-platform/)** (English, 繁體中文, 日本語)

[![GitHub version](https://img.shields.io/github/package-json/v/tasict/homebridge-daikin-local-platform?label=GitHub)](https://github.com/tasict/homebridge-daikin-local-platform)
[![npm version](https://img.shields.io/npm/v/homebridge-daikin-local-platform?color=%23cb3837&label=npm)](https://www.npmjs.com/package/homebridge-daikin-local-platform)
[![Matter](https://img.shields.io/badge/Matter-supported%20since%202.0.0-2ea44f)](#matter-and-energy-beta--new-in-200)

`homebridge-daikin-local-platform` is a dynamic platform plugin for [Homebridge](https://homebridge.io) that provides HomeKit and Matter support for Daikin climate devices to be controlled.

Free and open source. If it keeps your home comfortable, you can [buy me a boba](https://tasict.bobaboba.me) (by card, no PayPal account needed) or [tip with PayPal](https://paypal.me/tasict).

> [!IMPORTANT]
> **New in 2.0.0: Matter support.** Units can now be published over Matter as well as HomeKit — with the same controls — and units that meter their consumption show up in the Apple Home app's Energy view (iOS 27+). See [Matter and energy (Beta)](#matter-and-energy-beta--new-in-200).
>
> Version 2.0.0 requires Homebridge 2.4+ and Node.js 22+; installations on Homebridge 1.x stay on 1.5.1.

## How it works
The plugin communicates with your AC units through the local api from devices. This means your units must be set up there and connect to lan before you can use this plugin.

## What you get in HomeKit

Each configured unit appears as one accessory with:

* **Heater Cooler** — power, operation mode (only the modes the unit actually supports; see also `climateCoolingOnly`), target temperature and the current room temperature.
* **Swing** — the standard HomeKit swing toggle, on units with swing-capable vanes (on = every supported axis swings, off = vanes fixed). Separate per-axis switches are available as an option, see `climateSwingSwitches`.
* **Fan** — speed steps 0–6: 0 = automatic, 1 = quiet, 2–6 = fan levels 1–5. Turning the fan off selects automatic speed.
* **Humidity sensor** and **outdoor temperature sensor**, on units that report those readings.

## Matter and energy (Beta) — new in 2.0.0

Requires Homebridge 2.4 or later (Homebridge 1.x installations stay on plugin version 1.5.1). Any unit can be published over **Matter** instead of HomeKit (HAP). The reason to do so is energy: the Apple Home app (iOS 27+) reads power and energy only from Matter, so units whose adapter meters consumption (newer dsiot units with the `en_ipower` function) then appear in the Home app's Energy view — both in the home total and individually. The plugin reports the live power draw and a running energy total built from the unit's own daily and monthly history; the total is kept in Homebridge's storage so it never goes backwards.

A Matter unit offers the same controls as its HomeKit accessory: power, the unit's modes (with *Cooling only* respected), temperatures, the fan (off = automatic speed, like in HomeKit), and the humidity and outdoor temperature sensors. The fan and swing tiles show the running unit: they read off while the air conditioner is off, and switching either on starts it. Apple Home shows the air conditioner as a thermostat; the fan and the humidity and outdoor temperature sensors are accessories of their own, named after the unit (e.g. *Study Fan*, *Study Humidity*, *Study Outdoor Temperature*, in the plugin's HomeKit name language), because Apple Home ignores the names of tiles inside a Matter accessory. Matter has no swing control Apple Home shows, so swing is an opt-in *Matter swing switch* (in the unit's edit form, or `climateMatterSwing`): another accessory, *Study Swing*, that turns every vane axis on or off. Apple Home shows it as an outlet (*Display As* can change that). The per-axis swing switches (`climateSwingSwitches`) are HomeKit only. Matter limits names to 32 bytes, so a long unit name is shortened, keeping the part after it.

**New setup:** the plugin settings first ask how to connect to Apple Home — *HomeKit (HAP)* or *Matter* — and units you add follow that choice (each unit can still be changed in its edit form). Then restart Homebridge and pair the bridge in the Home app with the Matter code shown in the plugin settings, instead of the HomeKit code.

Matter has to be on for the bridge the plugin runs on. When the plugin runs as a child bridge (the Homebridge UI's default), the plugin settings take care of it: Matter is switched on for the child bridge while any unit uses it, and HomeKit is switched off once every unit is on Matter, so there is only one code to pair. On the main bridge, turn Matter on in the Homebridge settings; the plugin settings show a warning while it is off.

**Moving an existing setup to Matter** (rooms, scenes and automations cannot be carried over — Apple Home keeps them in its own database):

1. In the plugin settings, *Matter* section, choose **Start migration for all units** (or set a single unit to *HomeKit + Matter* in its edit form) and restart Homebridge. Each unit is now in the Home app twice: the HomeKit accessory keeps working.
2. Add the Matter bridge in the Home app with the code shown in the *Matter* section (one code for all units on that bridge), give each Matter accessory its room, and rebuild the scenes and automations that use the unit.
3. Choose **Finish migration** and restart Homebridge: the HomeKit accessories of these units are removed.

**Going back to HomeKit** works at any step: choose **Back to HomeKit** in the *Matter* section (or set units to *HomeKit* in their edit forms) and restart Homebridge. The plugin then removes its Matter accessories from the Home app; units that were still migrating keep their HomeKit accessory with its room and automations, units already on Matter only get a new one. This needs Matter to run for that one restart: on a child bridge the plugin settings keep Matter on (or switch it back on) until the Matter accessories are gone, then switch it off with the next save; on the main bridge, leave Matter on for that restart. Finally remove the now empty Matter bridge in the Home app.

Keep in mind:

* In Auto, Daikin units have a single target temperature. Both HomeKit and Matter show it as a 2 °C range around the target, and moving either end moves the target (the unit stays in Auto).
* Over Matter the fan speed maps to percent (quiet ≈ 17 %, level 1–5 ≈ 33–100 %); other Matter controllers can use it too.
* If Matter is turned off on the bridge, units set to Matter are published over HomeKit again (with a warning in the log); the setting is kept.

## Supported devices
The plugin auto-detects, per IP address, which of the two local protocols the unit speaks — no configuration needed:

* **Newer adapters (firmware 2.8.0+)** using the JSON `/dsiot/multireq` API (e.g. BRP069C4x and recent built-in WiFi modules).
* **Legacy adapters** using the query-string API (`/common/basic_info`, `/aircon/get_control_info`, ...) — the same devices supported by the [Home Assistant Daikin integration](https://www.home-assistant.io/integrations/daikin/) via BRP069-style adapters (BRP069A/Bxx and built-in WiFi units of the same era). Set semantics follow [pydaikin](https://github.com/fredrike/pydaikin).
* **AirBase (BRP15B61) adapters**, common on Australian ducted systems — same query-string API under a `skyfi/` path prefix, with the AirBase mode and 3-speed fan numbering. Zone control is not exposed yet.
* **Secure BRP072C-style adapters** (external adapters such as the US BRP072C42, paired with the *Daikin Comfort Control* app) — same query-string API, but served only over HTTPS after registering the 13-digit key printed on the adapter sticker. Add the key via `climateKeys` (see below); everything else is auto-detected.

You can verify which protocol your unit speaks: `http://<ip>/common/basic_info` answers `ret=OK,...` on a legacy unit, `http://<ip>/skyfi/common/basic_info` on an AirBase unit; newer units answer on `/dsiot/multireq`. A unit that answers `/common/basic_info` but returns *page not found* for `/aircon/get_control_info` is either a secure BRP072C-style adapter (HTTPS answers on port 443 — configure its key) or a cloud-only unit (port 443 closed — see below). SkyFi (password-based) adapters are not supported yet.

### Cloud-only units (no local API)

Daikin's newest adapter generation cannot be controlled locally at all. This includes the European BRP069C4x/C8x adapters and the US FTXM-W "ATMOSPHERA" (FTXMxxWVJU9) built-in WiFi modules — the ones set up with the *Daikin Comfort Control* app. These units answer `http://<ip>/common/basic_info` (reporting `adp_kind=4` and `method=polling`) but return *page not found* for every control endpoint, listen on no other port, and are driven exclusively through Daikin's cloud — the app stops working as soon as the unit's internet access is blocked, even from inside the same network. No LAN-based integration (this plugin, Home Assistant's, or any other) can control this hardware; see [issue #17](https://github.com/tasict/homebridge-daikin-local-platform/issues/17) for the full investigation. Realistic alternatives are an [ESP32-Faikin](https://github.com/revk/ESP32-Faikin) board wired to the indoor unit's serial service port (it replaces the cloud module's role and provides full local control) or an IR blaster.
## Homebridge setup
Configure the plugin through the settings UI or directly in the JSON editor.

In the settings UI, the device list scans your local network automatically (UDP broadcast) and shows the Daikin units it finds — one click adds a unit, and for secure BRP072C units (marked 🔒) the edit form opens right away so you can enter the 13-digit key. Note that the scan cannot cross subnets or leave a Docker *bridge* network (use host networking, or enter the IP manually — tick *Secure adapter* in the edit form if such a unit needs a key).

```json
{
  "platforms": [
    {
        "platform": "Daikin Local Platform",
        "name": "Daikin Local Platform",
        "climateIPs": ["ipv4-here"],
        "climateKeys": [
            {"ipv4-here": "13-digit-key-here"}
        ],
        "climateCoolingOnly": ["ipv4-here"],
        "climateSwingSwitches": ["ipv4-here"],
        "climateMatter": ["ipv4-here"],
        "climateMatterMigration": ["ipv4-here"],
        "climateMatterSwing": ["ipv4-here"],
        "language": "en",
        "debugMode": false,
    }
  ]
}
```

Required:

* `platform` (string):
Tells Homebridge which platform this config belongs to. Leave as is.

* `name` (string):
Will be displayed in the Homebridge log.

* `climateIPs` (array):
The IP addresses of the Daikin climate devices to be controlled.

Optional:

* `climateKeys` (array):
Only needed for secure BRP072C-style adapters (see *Supported devices*). One object per unit mapping its IP address (exactly as written in `climateIPs`) to the 13-digit key printed on the adapter/unit sticker. Units without a key entry are auto-detected as before. In the Homebridge UI the key is entered by editing the device in the plugin settings; the settings UI keeps this mapping in sync with the device list automatically.

* `climateCoolingOnly` (array):
Units to expose as cooling-only in HomeKit, by IP address exactly as written in `climateIPs`. Heating and Auto are hidden in the Home app — for cool-only models (common in South-East Asia) whose WLAN firmware still reports heating, which the plugin's mode auto-detection cannot see through. In the Homebridge UI this is the *Cooling only* switch in the device's edit form. The option only hides modes, it never adds one.

* `climateSwingSwitches` (array):
Units that get separate *Vertical Swing* and *Horizontal Swing* switches in HomeKit, by IP address exactly as written in `climateIPs`. Units with swing-capable vanes always get the standard HomeKit swing toggle on the AC tile (on = all supported axes swing, off = all fixed); these extra switches add independent per-axis control, since HomeKit itself has no four-way swing selector. In the Homebridge UI this is the *Swing switches* option in the device's edit form. Axes the unit does not support are never exposed.

* `climateMatter` (array):
Units published over Matter instead of HomeKit, by IP address exactly as written in `climateIPs` — see [Matter and energy (Beta)](#matter-and-energy-beta--new-in-200). Takes effect only while Matter is enabled on the plugin's bridge. In the Homebridge UI this is the *Matter (Beta)* option in the device's edit form.

* `climateMatterSwing` (array):
Units on Matter that also get a separate *Swing* switch accessory (every vane axis at once), by IP address exactly as written in `climateIPs`. In the Homebridge UI this is *Matter swing switch* in the device's edit form. Units without swing-capable vanes get none.

* `climateMatterMigration` (array):
Units published over both HomeKit and Matter while moving them to Matter (step 2 above), by IP address exactly as written in `climateIPs`. Takes precedence over `climateMatter`. In the Homebridge UI this is *HomeKit + Matter* in the device's edit form, or *Start migration for all units*.

* `language` (string):
Language for the default HomeKit names of the switches and sensors this plugin creates — e.g. *Outdoor Temperature*, *Vertical Swing*, *Horizontal Swing* — which HomeKit does not translate itself. The options are the same language codes as the Homebridge UI language setting (`en`, `de`, `zh-TW`, `ja`, ...), and the plugin settings UI defaults the dropdown to the language your Homebridge UI is displayed in. Defaults are only applied while a service still carries a plugin-default name: anything you renamed in the Home app is never touched, and changing the language later renames only the untouched services. Absent means English.

* `debugMode` (boolean):
If `true`, the plugin will print debugging information to the Homebridge log.

## Troubleshooting

- If you have any issues with this plugin, enable the debug mode in the settings (and restart the plugin). This will print additional information to the log. If this doesn't help you resolve the issue, feel free to create a [GitHub issue](https://github.com/tasict/homebridge-daikin-local-platform/issues) and attach the available debugging information.

- If the plugin affects the general responsiveness and reliability of your Homebridge setup, you can run it as an isolated [child bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges).

## Support

If this plugin is useful to you, I'd love it if you bought me a boba:

- **[Buy me a boba](https://tasict.bobaboba.me)**: pay by card, no PayPal account needed
- **[Tip with PayPal](https://paypal.me/tasict)**

## Contributing

You can contribute to this project in the following ways:

* Test/use the plugin and [report issues and share feedback](https://github.com/tasict/homebridge-daikin-local-platform/issues).

* Review source code changes [before](https://github.com/tasict/homebridge-daikin-local-platform/pulls) and [after](https://github.com/tasict/homebridge-daikin-local-platform/commits/master) they are published.

* Contribute with your own bug fixes, code clean-ups, or additional features (pull requests are accepted).

## Acknowledgements
* Thanks to [やまでん](https://ydn.jp/archives/12367) for protocol detail.
* Thanks to the team behind Homebridge. Your efforts do not go unnoticed.

## Disclaimer
All product and company names are trademarks™ or registered® trademarks of their respective holders. Use of them does not imply any affiliation with or endorsement by them.
