# Changelog

## 2.0.1 (2026-09-23)

- Fixed: the Matter options were missing from the plugin settings when the plugin runs as a child bridge without Matter — the Homebridge UI's default for new plugins, and the usual case after upgrading from 1.5. They are now always shown.
- A new setup now starts with a choice between *HomeKit (HAP)* and *Matter*; units added later follow it, and each unit can still be changed in its edit form.
- When the plugin runs as a child bridge, the settings now switch Matter and HomeKit on or off for that bridge to match the units — HomeKit goes off once every unit is on Matter, so there is only one code to pair. On the main bridge, the settings warn while Matter is off there.

## 2.0.0 — Matter support

> [!IMPORTANT]
> **This release adds Matter support.** Any unit can now be published over Matter as well as HomeKit, with the same controls, and units that meter their consumption appear in the Apple Home app's Energy view (iOS 27+). Units stay on HomeKit until you switch them — see *Matter and energy (Beta)* in the README.
>
> **Requires Homebridge 2.4 or later and Node.js 22 or later.** Homebridge 1.x installations stay on 1.5.1.

- Minimum versions raised to Homebridge 2.4 and Node.js 22: Homebridge and the Homebridge UI only offer this version to installations that meet both, so Homebridge 1.x installations stay on 1.5.1, which keeps working as before.
- Added Matter support (Beta): a unit can be published over Matter instead of HomeKit, with the same controls as its HomeKit accessory — power, the unit's modes (*Cooling only* respected), temperatures, the fan (off = automatic speed), swing and the per-axis swing switches, and the humidity and outdoor temperature sensors. Units whose adapter meters consumption (dsiot `en_ipower`) also report their live power and energy use, which the Apple Home app (iOS 27+) shows in its Energy view. The energy total is built from the unit's daily and monthly history and stored in Homebridge's storage, so it keeps counting across restarts and year boundaries.
- Moving to Matter without downtime: in the new *HomeKit + Matter* state a unit is published both ways, so its Matter accessory can get its room, scenes and automations while the HomeKit one keeps working; *Finish migration* then removes the HomeKit accessory. The *Matter* section of the settings has one-click *Start migration for all units* / *Finish migration* buttons, a step list, and the bridge's Matter pairing code and QR code. It and all other Matter options only appear while Matter is on for the plugin's bridge (switched on in the Homebridge bridge settings). New config arrays `climateMatter` and `climateMatterMigration` follow the `climateCoolingOnly` rules.
- Changed: in Auto, the Home app's temperature range now adjusts the unit's Auto target (shown as target ± 1 °C) and the unit stays in Auto. Before, the range showed the Cool and Heat targets and moving it switched the unit out of Auto.
- Fixed: while a unit is off, the Home app now shows the mode it will start in (before, the mode was only updated while the unit was on, so after a restart an off unit showed Auto). An off unit's tile also no longer keeps showing *Cooling*/*Heating* until it is opened, and a mode the tile does not offer (e.g. Auto set from the remote on a unit marked cooling-only) shows as one it does instead of an invalid value.
- If Matter is turned off on the bridge later, units set to Matter go back to HomeKit (with a warning in the log); their setting is kept for when Matter is back on.

## 1.5.1 (2026-07-22)

- Added a *HomeKit name language* setting: the default names of the switches and sensors this plugin creates — *Outdoor Temperature*, *Vertical Swing*, *Horizontal Swing* and the fallback accessory name — can now follow any of the 28 Homebridge UI languages, since HomeKit does not translate service names itself. The dropdown (settings UI → *Advanced*) offers the same options as the Homebridge UI language setting and defaults to the language the Homebridge UI is displayed in; in the JSON config it is the `language` field with the same codes (`en`, `de`, `ja`, `zh-TW`, ...; absent means English).
- The outdoor temperature sensor now takes the translated *Outdoor Temperature* as its default service name.
- Renames done in the Home app always win: a default name is only applied while the service still carries one of the plugin's own defaults (in any language), so switching languages later renames only services the user never touched. Upgrading alone changes nothing in HomeKit — existing accessories, rooms, automations and names stay exactly as they are until a language is picked.

## 1.5.0 (2026-07-22)

- Added vane swing control: units with swing-capable vanes now get HomeKit's standard swing toggle on the AC tile (on = every supported axis swings — 3D on units with both; off = vanes fixed). Supported on newer (dsiot) units — where swing is tracked per axis and per operation mode, and turning swing off restores the previously stored fixed-vane position — and on legacy BRP069-era units via `f_dir`, including the split `f_dir_ud`/`f_dir_lr` keys used by Australian Alira X models. Axes the unit does not support are never offered; AirBase ducted units (no controllable vanes) are unaffected.
- Added a per-device *Swing switches* option that exposes separate *Vertical Swing* and *Horizontal Swing* switches, for the mixed combinations the standard toggle cannot express (HomeKit has no four-way swing selector). Configured from the device's edit form in the settings UI — such units show a *swing* chip in the device list — or via the new `climateSwingSwitches` config array, which follows the `climateCoolingOnly` rules (IP exactly as written in `climateIPs`, entries matching no device preserved and re-adopted).
- The swing switches are named only when they are first created, so renaming them in the Home app survives plugin restarts.

## 1.4.5 (2026-07-19)

- Added a per-device *Cooling only* option: enable it for cool-only models (common in Singapore, Malaysia and India) whose firmware advertises heating anyway — the Home app then offers just Cool, with Heating and Auto hidden. Mode auto-detection stays the default, and the option only hides modes, never adds one. Toggling it takes effect after a plugin restart; the accessory keeps its rooms, automations and pairing.
- Redesigned the device edit form in the settings UI into option rows with switches: *Secure adapter* (the 13-digit key field now lives inside the row, locked on when the unit is known to be secure) and the new *Cooling only*, which previews the resulting Home-app mode menu as you toggle it. Cool-only units show a *❄ cool only* chip in the device list.
- The new `climateCoolingOnly` config entries hold the IP exactly as written in `climateIPs` and are matched like `climateKeys` (exact entry first, then bare IP); entries matching no device are preserved and re-adopted when the device reappears.

## 1.4.4 (2026-07-18)

- Moved secure adapter (BRP072C) keys into the device list: editing a device now shows its 13-digit key field whenever the unit needs one (with a *Secure adapter* checkbox for units the scan cannot reach), and adding a discovered secure unit opens the form with the key field focused. The separate keys section — and its error-prone requirement to repeat the IP exactly — is gone; the key follows the device, including when its IP is edited.
- Existing `climateKeys` entries are matched to their device automatically (bare-IP entries written for an `ip:port` device are repaired to the exact form the plugin looks up); entries matching no device stay visible as *unused key* rows to re-adopt or delete, instead of being dropped silently. `climateKeys` is now also declared in `config.schema.json`.
- Fixed muted text in the settings UI (device details, help text) being unreadable when Homebridge uses a dark theme.
- Log the reason when the secure (BRP072C) probe fails, so misconfigured keys are easier to diagnose.

## 1.4.3 (2026-07-17)

- Fixed spacing and styling in the settings UI that was broken by the Bootstrap version loaded in the Config UI X iframe.
- Right-aligned the per-row action buttons in the settings UI device list.

## 1.4.2 (2026-07-17)

- Merged the network finder into a unified device list in the settings UI: configured and discovered units now appear in one list with per-row add/edit/remove actions and `found` / `needs key` / `no reply` badges. The list auto-scans on page open and can be rescanned on demand.

## 1.4.1 (2026-07-17)

- Restructured the settings UI into a task-ordered layout: the device list first, with the secure adapter keys (BRP072C) and advanced options in collapsed sections below.

## 1.4.0 (2026-07-17)

- Added support for secure BRP072C-style adapters (units paired with the Daikin Comfort Control app, e.g. US ATMOSPHERA built-in WiFi). These use HTTPS with legacy TLS and require the 13-digit key printed on the unit, configured via the new `climateKeys` setting.
- Added a LAN device finder to the settings UI that discovers Daikin adapters via UDP broadcast.
- Improved discovery diagnostics: probe failures now log which protocol was ruled out for each IP.

## 1.3.0 (2026-07-16)

- Added support for legacy BRP069-era adapters and AirBase BRP15B61 (Australian ducted) units. The protocol for each configured IP is now auto-detected, alongside the existing support for newer (dsiot) firmware.

## 1.2.9 (2026-07-16)

- HomeKit now only offers the operation modes the device actually supports, instead of always showing auto/heat/cool.

## 1.2.8 (2026-07-01)

- Maintenance release, no functional changes.

## 1.2.7 (2026-07-01)

- Added outdoor temperature support (exposed as a separate temperature sensor).
- Device commands are now awaited and redundant HomeKit characteristic writes are skipped, making state updates after a change more reliable.
- Hardened device requests and fixed misleading log messages.
- Internal refactoring: consolidated duplicated protocol and accessory logic.

## 1.2.6 (2025-04-13)

- Fixed an error when fetching device data.

## 1.2.5 (2025-04-13)

- Added debug logging around error handling.

## 1.2.4 (2025-04-12)

- Added error handling to avoid a crash.

## 1.2.3 (2025-04-10)

- Added error handling around device communication.

## 1.2.1 (2025-03-02)

- Fixed a bug where the HomeKit app could reduce the maximum fan level to 5 instead of 6.
- Dependency updates.

## 1.2.0 (2025-02-20)

- Added a standalone Fan service for better HomeKit compatibility (the RotationSpeed characteristic inside the HeaterCooler service does not work properly with HomeKit).
- Added request rate limiting, since rapid fan-speed adjustments could make the Daikin adapter reject requests with HTTP 429.
- Moved noisy info-level messages to debug level.
- Fixed the return value type of `getFanStatus()` and minor code cleanups.

## 1.1.1 (2024-09-04)

- Updated for Homebridge v2 compatibility.

## 1.1.0 (2024-02-13)

- Removed the unused `cheerio` dependency and updated the remaining dependencies.

## 1.0.10 (2024-01-23)

- Fixed the fan speed mapping so that level 0 selects automatic fan speed and all device fan levels are reachable ([#2](https://github.com/tasict/homebridge-daikin-local-platform/issues/2)).
- Improved error logging.
- Dependency updates.

## 1.0.9 (2024-01-07)

- Maintenance release, no functional changes.

## 1.0.8 (2024-01-06)

- Fixed a build error (duplicate identifier) introduced by a bad merge.

## 1.0.7 (2024-01-06)

- Improved compatibility with units that report humidifier mode.
- Dependency upgrades.

## 1.0.6 (2023-12-29)

- Handle the humidify operation mode in the HeaterCooler state mapping, so units in that mode no longer confuse HomeKit.

## 1.0.5 (2023-12-11)

- Fixed a crash issue.
- Code cleanup.

## 1.0.4 (2023-12-10)

- Maintenance release, no functional changes.

## 1.0.3 (2023-12-10)

- Removed the motion detection button.

## 1.0.2 (2023-12-09)

- The current heating/cooling state shown in HomeKit now follows the active operation mode (auto/heat/cool/dry/fan) instead of only comparing temperatures.
- Named the motion sensor service.

## 1.0.1 (2023-12-09)

- Initial release: Homebridge platform plugin exposing Daikin air conditioners to HomeKit over the local network, with power, mode, target temperature, fan speed and swing control.
