// Backend for the custom settings UI (run on the Homebridge host by
// Config UI X). Exposes the LAN device finder and the Matter status to the
// browser-side UI.
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const { discover } = require('./discover');

const PLATFORM_NAME = 'Daikin Local Platform';
const PLUGIN_NAME = 'homebridge-daikin-local-platform';

// Homebridge accepts `matter: true` or a config object without
// `enabled: false` (its isMatterConfigEnabled).
const matterFlagEnabled = (value) => Boolean(value) && value.enabled !== false;

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

class DaikinPluginUiServer extends HomebridgePluginUiServer {

  constructor() {
    super();

    this.onRequest('/discover', async () => {
      return { devices: await discover() };
    });

    this.onRequest('/matter', () => this.matterStatus());

    this.ready();
  }

  // Matter state of the saved config: whether the main bridge has Matter on,
  // how many of this plugin's accessories the bridge's Matter cache still
  // holds (they are only removed while Matter is on), and the pairing code
  // of the bridge this plugin runs on (the units are bridged accessories, so
  // they share the bridge's single Matter node).
  async matterStatus() {
    const status = { mainBridgeMatterEnabled: false, cachedAccessories: 0, pairing: null };
    try {
      const config = readJson(this.homebridgeConfigPath);
      const platform = (config.platforms || []).find((entry) => entry && entry.platform === PLATFORM_NAME);
      status.mainBridgeMatterEnabled = matterFlagEnabled(config.bridge && config.bridge.matter);

      const bridge = platform && platform._bridge ? platform._bridge : config.bridge;
      const node = String((bridge && bridge.username) || '').replace(/:/g, '').toUpperCase();
      const nodeDir = path.join(this.homebridgeStoragePath, 'matter', node);
      try {
        status.cachedAccessories = readJson(path.join(nodeDir, 'accessories.json'))
          .filter((accessory) => accessory && accessory.plugin === PLUGIN_NAME).length;
      } catch (e) {
        // No Matter cache for this bridge.
      }
      const commissioning = readJson(path.join(nodeDir, 'commissioning.json'));
      status.pairing = {
        manualPairingCode: commissioning.manualPairingCode,
        commissioned: Boolean(commissioning.commissioned),
        fabricCount: commissioning.fabricCount || 0,
        qrSvg: await QRCode.toString(commissioning.qrCode, { type: 'svg', margin: 1 }),
      };
    } catch (e) {
      // No config, or no Matter node for this bridge yet (it is created on
      // the first start with Matter enabled).
    }
    return status;
  }
}

(() => new DaikinPluginUiServer())();
