# Homebridge Daikin Local Platform

[![GitHub version](https://img.shields.io/github/package-json/v/tasict/homebridge-daikin-local-platform?label=GitHub)](https://github.com/tasict/homebridge-daikin-local-platform)
[![npm version](https://img.shields.io/npm/v/homebridge-daikin-local-platform?color=%23cb3837&label=npm)](https://www.npmjs.com/package/homebridge-daikin-local-platform)

`homebridge-daikin-local-platform` is a dynamic platform plugin for [Homebridge](https://homebridge.io) that provides HomeKit support for Daikin climate devices to be controlled.

## How it works
The plugin communicates with your AC units through the local api from devices. This means your units must be set up there and connect to lan before you can use this plugin.
## Homebridge setup
Configure the plugin through the settings UI or directly in the JSON editor:

```json
{
  "platforms": [
    {
        "platform": "Daikin Local Platform",
        "name": "Daikin Local Platform",
        "climateIPs": ["ipv4-here"],
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

* `debugMode` (boolean):
If `true`, the plugin will print debugging information to the Homebridge log.

## Troubleshooting

- If you have any issues with this plugin, enable the debug mode in the settings (and restart the plugin). This will print additional information to the log. If this doesn't help you resolve the issue, feel free to create a [GitHub issue](https://github.com/tasict/homebridge-daikin-local-platform/issues) and attach the available debugging information.

- If the plugin affects the general responsiveness and reliability of your Homebridge setup, you can run it as an isolated [child bridge](https://github.com/homebridge/homebridge/wiki/Child-Bridges).

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
