import path from 'path';
import type { MatterAccessory } from 'homebridge';
import DaikinPlatform from '../platform';
import { AUTO_SETPOINT_OFFSET, DEVICE_STATUS_REFRESH_INTERVAL, ENERGY_REFRESH_INTERVAL_MS } from '../const';
import {
  DaikinDevice,
  CLIMATE_MODE_AUTO,
  CLIMATE_MODE_COOLING,
  CLIMATE_MODE_DEHUMIDIFY,
  CLIMATE_MODE_FAN,
  CLIMATE_MODE_HEATING,
  FAN_SPEED_TABLE,
} from '../daikin-local';
import { EnergyLedger } from '../energy-ledger';
import { PLUGIN_NAME } from '../settings';
import { getServiceNames } from '../i18n';

// Matter Thermostat SystemModeEnum.
const SYSTEM_MODE_OFF = 0;
const SYSTEM_MODE_BY_MODE: Record<string, number> = {
  [CLIMATE_MODE_AUTO]: 1,
  [CLIMATE_MODE_COOLING]: 3,
  [CLIMATE_MODE_HEATING]: 4,
  [CLIMATE_MODE_FAN]: 7,
  [CLIMATE_MODE_DEHUMIDIFY]: 8,
};

// Matter ControlSequenceOfOperationEnum.
const SEQUENCE_COOLING_ONLY = 0;
const SEQUENCE_HEATING_ONLY = 2;
const SEQUENCE_COOLING_AND_HEATING = 4;

// matter.js's default minSetpointDeadBand (not declared: Homebridge restores
// cached state onto a thermostat without the AutoMode feature, where the
// attribute is illegal). Enforced between the setpoints in every mode.
const DEADBAND = 2 * AUTO_SETPOINT_OFFSET;

// The declared setpoints, from which Homebridge derives the thermostat
// features (see the class comment); the platform rebuilds a cached accessory
// whose signature differs.
export const thermostatFeatureSignature = (clusters: MatterAccessory['clusters']): string => {
  const thermostat = clusters?.thermostat ?? {};
  return ['occupiedHeatingSetpoint', 'occupiedCoolingSetpoint'].filter((key) => key in thermostat).join(',');
};

// Matter FanControl FanModeEnum and the OffLowMedHigh sequence (Homebridge's
// FanControl behavior drops cluster features, so there is no Auto mode).
const FAN_MODE_OFF = 0;
const FAN_MODE_LOW = 1;
const FAN_MODE_MEDIUM = 2;
const FAN_MODE_HIGH = 3;
const FAN_MODE_ON = 4;
const FAN_MODE_SEQUENCE_OFF_LOW_MED_HIGH = 0;
// Fan steps as in the HomeKit Fan service (FAN_SPEED_TABLE number): 0 = auto,
// shown as "off" like HomeKit does, 1 = quiet, 2..6 = level 1..5.
const FAN_STEPS = 6;
const STEP_BY_FAN_MODE: Record<number, number> = { [FAN_MODE_LOW]: 2, [FAN_MODE_MEDIUM]: 4, [FAN_MODE_HIGH]: 6 };

const INITIAL_PUSH_DELAY_MS = 5000;

// Matter caps a bridged device's name (nodeLabel) at 32 bytes; a longer one
// fails the accessory's registration. Cut at a character boundary.
const NODE_LABEL_MAX_BYTES = 32;
const fitLabel = (text: string, maxBytes = NODE_LABEL_MAX_BYTES): string => {
  let fitted = '';
  for (const char of text) {
    if (Buffer.byteLength(fitted + char) > maxBytes) {
      break;
    }
    fitted += char;
  }
  return fitted.trim();
};

const toMatterTemp = (celsius: number) => Math.round(celsius * 100);
const fromMatterTemp = (value: number) => Math.round(value / 50) / 2; // 0.01 °C -> 0.5 °C steps
const clamp = (value: number, [min, max]: number[]) => Math.min(Math.max(value, min), max);

// Unit command failed: throwing makes Homebridge answer the controller with
// a failure, like ClimateAccessory's HAP SERVICE_COMMUNICATION_FAILURE.
const check = (ok: boolean) => {
  if (!ok) {
    throw new Error('the unit did not accept the command');
  }
};

// Publishes one Daikin unit as a Matter Thermostat (Homebridge 2.x), feature
// for feature the counterpart of ClimateAccessory.
//
// Why Thermostat and not Room Air Conditioner: Homebridge caches a device type
// by name only and, on restart, keeps the endpoint it rebuilt from the cache
// whenever the shape looks unchanged. A Room Air Conditioner is rebuilt with
// its fixed Heating+Cooling thermostat, silently dropping the AutoMode (and
// cooling-only) composition — Auto would break after every restart. On a
// plain Thermostat Homebridge derives the features from the declared
// setpoints, identically for fresh and restored endpoints: heating + cooling
// setpoints = Heating, Cooling and AutoMode; cooling only = Cooling.
//
// Apple Home shows only power, mode and setpoints on a thermostat, so the
// fan, the humidity and outdoor temperature sensors and the optional swing
// switch (climateMatterSwing) are accessories of their own, named
// "<unit> <role>". Not child endpoints: Apple Home ignores the names of
// those (it showed "Outlet", "Outlet 1", ...) and turns a unit with outlet
// children into a power strip. Unlike their HomeKit counterparts, the fan
// and swing tiles show the running unit: both read off while it is off, and
// switching either on starts it. Units with
// the en_ipower function also get the electrical power/energy clusters on the
// main endpoint, which is what the iOS 27 Home app's Energy view reads.
export default class ClimateMatterAccessory {

  public readonly UUID: string;
  public readonly accessory: MatterAccessory;
  // The unit's other accessories (fan, sensors, swing), see the class comment.
  public readonly fanAccessory: MatterAccessory;
  public readonly humidityAccessory?: MatterAccessory;
  public readonly outdoorAccessory?: MatterAccessory;
  public readonly swingAccessory?: MatterAccessory;
  private readonly supportsHeat: boolean;
  private readonly supportsCool: boolean;
  private readonly supportsSwingVertical: boolean;
  private readonly supportsSwingHorizontal: boolean;
  private heatRange: number[];
  private coolRange: number[];
  private readonly metered: boolean;
  private readonly ledger?: EnergyLedger;
  private lastEnergy = '';
  // Last explicit fan speed, restored when the fan is switched back on
  // (same as ClimateAccessory; starts at quiet).
  private lastFanStep = 1;
  // Controller commands, one after another: two can arrive together (e.g.
  // matter.js moving the idle setpoint along with the active one), and each
  // must see the unit state the previous one left.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly platform: DaikinPlatform,
    private readonly device: DaikinDevice,
  ) {
    const matter = platform.api.matter!;
    const mac = device.getMacAddress();
    const names = getServiceNames(platform.platformConfig.language);
    const displayName = fitLabel(device.getDeviceName() || names.airConditioner);

    this.UUID = matter.uuid.generate(mac);
    this.supportsCool = device.supportsOperationMode(CLIMATE_MODE_COOLING);
    this.supportsHeat = device.supportsOperationMode(CLIMATE_MODE_HEATING) && !platform.isCoolingOnly(device.IP);
    if (platform.isCoolingOnly(device.IP)) {
      this.supportsCool = true;
    }
    if (!this.supportsCool && !this.supportsHeat) {
      this.supportsCool = this.supportsHeat = true;
    }
    this.supportsSwingVertical = device.supportsSwingVertical();
    this.supportsSwingHorizontal = device.supportsSwingHorizontal();
    this.coolRange = this.range(device.getCoolingThresholdTemperatureRange());
    this.heatRange = this.range(device.getHeatingThresholdTemperatureRange());
    this.metered = device.supportsPowerMeasurement();

    // With both setpoints Homebridge enables AutoMode, whose dead band also
    // applies to the limits.
    if (this.supportsHeat && this.supportsCool) {
      if (this.coolRange[1] - this.heatRange[1] < DEADBAND) {
        this.heatRange = [this.heatRange[0], this.coolRange[1] - DEADBAND];
      }
      if (this.coolRange[0] - this.heatRange[0] < DEADBAND) {
        this.coolRange = [this.heatRange[0] + DEADBAND, this.coolRange[1]];
      }
    }
    const clusters: MatterAccessory['clusters'] = {
      thermostat: {
        ...this.thermostatState(),
        controlSequenceOfOperation: this.supportsHeat && this.supportsCool ? SEQUENCE_COOLING_AND_HEATING
          : this.supportsCool ? SEQUENCE_COOLING_ONLY : SEQUENCE_HEATING_ONLY,
        ...(this.supportsCool ? this.limits('Cool', this.coolRange) : {}),
        ...(this.supportsHeat ? this.limits('Heat', this.heatRange) : {}),
      },
    };

    if (this.metered) {
      this.ledger = new EnergyLedger(path.join(platform.api.user.storagePath(), PLUGIN_NAME, `energy-${mac}.json`));
      clusters.electricalPowerMeasurement = { activePower: this.activePower() };
      clusters.electricalEnergyMeasurement = { cumulativeEnergyImported: null, periodicEnergyImported: null };
    }

    this.accessory = {
      UUID: this.UUID,
      displayName,
      deviceType: matter.deviceTypes.Thermostat,
      serialNumber: mac,
      manufacturer: 'Daikin ' + device.getDeviceReg(),
      model: device.getDeviceType() || 'Unknown',
      firmwareRevision: device.getFirmwareVersion() || 'Unknown',
      context: { ip: device.IP, mac },
      clusters,
      // Power is the thermostat's system mode (Off / a mode), as on HomeKit's
      // Active + mode pair.
      handlers: {
        thermostat: {
          systemModeChange: ({ systemMode }) => this.serial(() => this.setSystemMode(systemMode)),
          occupiedCoolingSetpointChange: ({ occupiedCoolingSetpoint }) =>
            this.serial(() => this.setSetpoint(occupiedCoolingSetpoint, CLIMATE_MODE_COOLING)),
          occupiedHeatingSetpointChange: ({ occupiedHeatingSetpoint }) =>
            this.serial(() => this.setSetpoint(occupiedHeatingSetpoint, CLIMATE_MODE_HEATING)),
        },
      },
    };

    // One bridged accessory per role: the name is the only one Apple Home shows.
    const companion = (role: string, name: string, deviceType: MatterAccessory['deviceType'],
      extra: Pick<MatterAccessory, 'clusters' | 'handlers'>): MatterAccessory => ({
      UUID: matter.uuid.generate(`${mac}:${role}`),
      // The role is what tells the tiles apart, so the unit's name gives way.
      displayName: fitLabel(`${fitLabel(displayName, NODE_LABEL_MAX_BYTES - Buffer.byteLength(` ${name}`))} ${name}`),
      deviceType,
      serialNumber: `${mac}-${role}`,
      manufacturer: 'Daikin ' + device.getDeviceReg(),
      model: device.getDeviceType() || 'Unknown',
      firmwareRevision: device.getFirmwareVersion() || 'Unknown',
      context: { ip: device.IP, mac, role },
      ...extra,
    });

    this.fanAccessory = companion('fan', names.fan, matter.deviceTypes.Fan, {
      clusters: { fanControl: { ...this.fanState(), fanModeSequence: FAN_MODE_SEQUENCE_OFF_LOW_MED_HIGH } },
      handlers: {
        fanControl: {
          fanModeChange: ({ fanMode }) => this.serial(() => this.setFanMode(fanMode)),
          percentSettingChange: ({ percentSetting }) => this.serial(() => this.setFanPercent(percentSetting)),
        },
      },
    });
    if (device.supportsIndoorHumidity()) {
      this.humidityAccessory = companion('humidity', names.humidity, matter.deviceTypes.HumiditySensor, {
        clusters: { relativeHumidityMeasurement: this.humidityState() },
      });
    }
    if (device.supportsOutdoorTemperature()) {
      this.outdoorAccessory = companion('outdoor', names.outdoorTemperature, matter.deviceTypes.TemperatureSensor, {
        clusters: { temperatureMeasurement: this.outdoorState() ?? { measuredValue: null } },
      });
    }
    // HomeKit's SwingMode toggle: every supported axis at once.
    if (platform.isMatterSwingEnabled(device.IP) && (this.supportsSwingVertical || this.supportsSwingHorizontal)) {
      this.swingAccessory = companion('swing', names.swing, matter.deviceTypes.OnOffOutlet, {
        clusters: { onOff: { onOff: this.isSwinging() } },
        handlers: {
          onOff: {
            on: () => this.serial(() => this.setSwingOn(true)),
            off: () => this.serial(() => this.setSwingOn(false)),
          },
        },
      });
    }
  }

  // Every accessory of this unit, for registration.
  public get accessories(): MatterAccessory[] {
    return [this.accessory, this.fanAccessory, this.humidityAccessory, this.outdoorAccessory, this.swingAccessory]
      .filter((accessory): accessory is MatterAccessory => accessory !== undefined);
  }

  // Force Homebridge to rebuild a cached accessory whose thermostat features
  // changed: it keeps a restored endpoint only while the device type's
  // behaviors match the cached (plain) one, and otherwise replaces it —
  // unregistering and re-registering in order, which a plugin cannot do
  // itself since unregistering is fire-and-forget. The composed features are
  // the ones Homebridge detects from the same setpoints, so the next restart
  // attaches to the rebuilt endpoint again.
  public composeThermostat() {
    const matter = this.platform.api.matter!;
    const features: string[] = [];
    if (this.supportsHeat) {
      features.push('Heating');
    }
    if (this.supportsCool) {
      features.push('Cooling');
    }
    if (this.supportsHeat && this.supportsCool) {
      features.push('AutoMode');
    }
    this.accessory.deviceType = matter.deviceTypes.Thermostat.with(
      matter.deviceRequirements.Thermostat.ThermostatServer.with(...features));
  }

  // Call once registration was requested. `poll` is false while the unit
  // also has a HomeKit accessory (migration), which already refreshes the
  // shared device.
  public start(poll: boolean) {
    this.device.addCallback(() => this.pushState());
    // A restored endpoint still carries the state cached at shutdown, so push
    // the current one — after a moment: registering is fire-and-forget, and
    // an immediate push can hit the endpoint Homebridge is replacing.
    setTimeout(() => this.pushState(), INITIAL_PUSH_DELAY_MS);
    if (poll) {
      setInterval(() => this.device.fetchDeviceStatus(), DEVICE_STATUS_REFRESH_INTERVAL);
    }
    if (this.ledger) {
      setInterval(() => this.refreshEnergy(), ENERGY_REFRESH_INTERVAL_MS);
    }
  }

  // The user limits default to the spec's, which may lie outside the unit's
  // absolute range; matter.js rejects that, so pin both to the unit's range.
  private limits(kind: 'Heat' | 'Cool', [min, max]: number[]): Record<string, number> {
    return {
      [`absMin${kind}SetpointLimit`]: toMatterTemp(min),
      [`min${kind}SetpointLimit`]: toMatterTemp(min),
      [`absMax${kind}SetpointLimit`]: toMatterTemp(max),
      [`max${kind}SetpointLimit`]: toMatterTemp(max),
    };
  }

  // Same fallback range as ClimateAccessory's threshold characteristics.
  private range([min, max]: number[]): number[] {
    return min > 0 && max > min ? [min, max] : [10, 30];
  }

  private serial(command: () => Promise<void>): Promise<void> {
    const next = this.queue.then(command);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async powerOn() {
    if (!this.device.getPowerStatus()) {
      check(await this.device.setPowerStatus(true));
    }
  }

  // Every supported axis at once, like HomeKit's SwingMode; switching it on
  // while the unit is off starts the unit.
  private async setSwingOn(on: boolean) {
    if (on) {
      await this.powerOn();
    }
    check(await this.device.setSwing(on && this.supportsSwingVertical, on && this.supportsSwingHorizontal));
  }

  // Off while the unit is off, whatever the vane setting.
  private isSwinging(): boolean {
    return this.device.getPowerStatus() && ((this.supportsSwingVertical && this.device.getSwingVertical())
      || (this.supportsSwingHorizontal && this.device.getSwingHorizontal()));
  }

  private thermostatState(): Record<string, unknown> {
    const device = this.device;
    const power = device.getPowerStatus();
    const mode = device.getOperationMode();
    const indoor = device.getIndoorTemperature();
    const outdoor = device.supportsOutdoorTemperature() ? device.getOutdoorTemperature() : NaN;

    // Each mode keeps its own target on the unit; Auto's single target is
    // shown as a range around it (AUTO_SETPOINT_OFFSET). In the other modes
    // the idle setpoint gives way to keep the dead band.
    let cool = clamp(device.getTargetTemperatureWithMode(CLIMATE_MODE_COOLING) || this.coolRange[0], this.coolRange);
    let heat = clamp(device.getTargetTemperatureWithMode(CLIMATE_MODE_HEATING) || this.heatRange[0], this.heatRange);
    if (mode === CLIMATE_MODE_AUTO) {
      const target = device.getTargetTemperatureWithMode(CLIMATE_MODE_AUTO);
      cool = clamp(target + AUTO_SETPOINT_OFFSET, this.coolRange);
      heat = clamp(target - AUTO_SETPOINT_OFFSET, this.heatRange);
    }
    if (cool - heat < DEADBAND) {
      if (mode === CLIMATE_MODE_HEATING) {
        cool = Math.min(heat + DEADBAND, this.coolRange[1]);
      } else {
        heat = Math.max(cool - DEADBAND, this.heatRange[0]);
      }
    }

    // Heating/cooling/idle exactly as ClimateAccessory derives the HomeKit
    // CurrentHeaterCoolerState: from the room vs the target temperature.
    const target = device.getTargetTemperature();
    const heating = power && Number.isFinite(indoor) && indoor < target
      && (mode === CLIMATE_MODE_AUTO || mode === CLIMATE_MODE_HEATING);
    const cooling = power && Number.isFinite(indoor) && indoor > target
      && (mode === CLIMATE_MODE_AUTO || mode === CLIMATE_MODE_COOLING);

    return {
      localTemperature: Number.isFinite(indoor) ? toMatterTemp(indoor) : null,
      ...(Number.isFinite(outdoor) ? { outdoorTemperature: toMatterTemp(outdoor) } : {}),
      systemMode: power ? this.reportedSystemMode(mode) : SYSTEM_MODE_OFF,
      thermostatRunningState: { heat: heating, cool: cooling, fan: power },
      ...(this.supportsCool ? { occupiedCoolingSetpoint: toMatterTemp(cool) } : {}),
      ...(this.supportsHeat ? { occupiedHeatingSetpoint: toMatterTemp(heat) } : {}),
    };
  }

  // Exactly ClimateAccessory's target state: a mode this accessory does not
  // offer (fan, dry, or e.g. Auto set from the remote on a unit marked
  // cooling-only) shows as Auto, else Cool, else Heat (auxModeTargetState) —
  // Apple Home's thermostat knows only those, and Matter rejects a system
  // mode outside the features. Fan and dry can still be selected by other
  // controllers.
  private reportedSystemMode(mode: string): number {
    if (mode === CLIMATE_MODE_COOLING && this.supportsCool
      || mode === CLIMATE_MODE_HEATING && this.supportsHeat
      || mode === CLIMATE_MODE_AUTO && this.supportsHeat && this.supportsCool) {
      return SYSTEM_MODE_BY_MODE[mode];
    }
    return SYSTEM_MODE_BY_MODE[this.supportsHeat && this.supportsCool ? CLIMATE_MODE_AUTO
      : this.supportsCool ? CLIMATE_MODE_COOLING : CLIMATE_MODE_HEATING];
  }

  // Off while the unit is off, and (HomeKit's Fan semantics) at the unit's
  // automatic speed.
  private fanState(): { fanMode: number; percentSetting: number; percentCurrent: number } {
    const step = this.device.getPowerStatus() ? this.device.getFanSpeedNumber() : 0;
    const percent = Math.round(step * 100 / FAN_STEPS);
    const fanMode = step === 0 ? FAN_MODE_OFF : percent <= 33 ? FAN_MODE_LOW : percent <= 67 ? FAN_MODE_MEDIUM : FAN_MODE_HIGH;
    return { fanMode, percentSetting: percent, percentCurrent: percent };
  }

  private humidityState(): Record<string, unknown> {
    const humidity = this.device.getIndoorHumidity();
    return { measuredValue: Number.isFinite(humidity) ? Math.round(humidity * 100) : null };
  }

  // Undefined while the outdoor unit has not reported (e.g. just powered
  // on): the last value is kept rather than dropping to nothing.
  private outdoorState(): Record<string, unknown> | undefined {
    const outdoor = this.device.getOutdoorTemperature();
    return Number.isFinite(outdoor) ? { measuredValue: toMatterTemp(outdoor) } : undefined;
  }

  private activePower(): number | null {
    const watts = this.device.getPowerConsumption();
    return Number.isFinite(watts) ? Math.round(watts * 1000) : null;
  }

  private update(cluster: string, attributes: Record<string, unknown>, uuid = this.UUID) {
    this.platform.api.matter?.updateAccessoryState(uuid, cluster, attributes)
      .catch((e) => this.platform.log.debug(`Matter: '${this.accessory.displayName}' ${cluster} update failed: ${e}`));
  }

  // Pushed on every status refresh: matter.js ignores unchanged values, and
  // re-pushing undoes controller writes the unit did not take.
  private pushState() {
    const step = this.device.getFanSpeedNumber();
    if (step !== 0) {
      this.lastFanStep = step;
    }
    this.update('thermostat', this.thermostatState());
    this.update('fanControl', this.fanState(), this.fanAccessory.UUID);
    if (this.humidityAccessory) {
      this.update('relativeHumidityMeasurement', this.humidityState(), this.humidityAccessory.UUID);
    }
    const outdoor = this.outdoorState();
    if (outdoor && this.outdoorAccessory) {
      this.update('temperatureMeasurement', outdoor, this.outdoorAccessory.UUID);
    }
    if (this.swingAccessory) {
      this.update('onOff', { onOff: this.isSwinging() }, this.swingAccessory.UUID);
    }
    if (this.metered) {
      this.update('electricalPowerMeasurement', { activePower: this.activePower() });
    }
  }

  // Fetch the energy history once before registration so the first
  // reading is part of the registered state (pushes before that are dropped).
  public async loadEnergy() {
    const state = await this.energyState();
    if (state) {
      this.accessory.clusters!.electricalEnergyMeasurement = state;
    }
  }

  private async refreshEnergy() {
    const state = await this.energyState();
    if (state) {
      this.update('electricalEnergyMeasurement', state);
    }
  }

  // New energy readings, or undefined when nothing changed: Homebridge does
  // not throttle energy events, so only changes are pushed.
  private async energyState(): Promise<Record<string, unknown> | undefined> {
    const history = this.ledger ? await this.device.fetchEnergyHistory() : undefined;
    if (!history || !this.ledger) {
      return undefined;
    }
    this.ledger.update(history);

    const cumulative = this.ledger.cumulativeWh();
    const today = history.dailyWh[history.dailyWh.length - 1] ?? 0;
    const key = `${cumulative}/${today}`;
    if (key === this.lastEnergy) {
      return undefined;
    }
    this.lastEnergy = key;

    const now = Math.floor(Date.now() / 1000);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return {
      cumulativeEnergyImported: { energy: cumulative * 1000, endTimestamp: now },
      periodicEnergyImported: { energy: today * 1000, startTimestamp: Math.floor(midnight.getTime() / 1000), endTimestamp: now },
    };
  }

  // Attribute handlers can also fire for the plugin's own pushes, so each
  // one is a no-op when the value equals what is already reported.

  private async setSystemMode(systemMode: number) {
    if (systemMode === this.thermostatState().systemMode) {
      return;
    }
    if (systemMode === SYSTEM_MODE_OFF) {
      return check(await this.device.setPowerStatus(false));
    }
    const mode = Object.keys(SYSTEM_MODE_BY_MODE).find((code) => SYSTEM_MODE_BY_MODE[code] === systemMode);
    // Auto is offered whenever both setpoints are (Homebridge's feature
    // detection), so a heat pump without Auto rejects it here.
    if (!mode || !this.device.supportsOperationMode(mode)) {
      throw new Error(`system mode ${systemMode} is not supported by this unit`);
    }
    if (this.device.getOperationMode() !== mode) {
      check(await this.device.setOperationMode(mode));
    }
    if (!this.device.getPowerStatus()) {
      check(await this.device.setPowerStatus(true));
    }
  }

  // Same as the HomeKit thresholds: in Auto either end of the range moves the
  // single Auto target; in a mode shown as another (fan, dry, ...) the unit
  // switches to the setpoint's mode; otherwise the setpoint of the running
  // mode is the unit's target. The idle setpoint is not a unit setting
  // (matter.js may also move it on its own to keep the dead band), so writes
  // to it are reverted by the next refresh.
  private async setSetpoint(value: number, setpointMode: string) {
    const reported = this.thermostatState()[setpointMode === CLIMATE_MODE_COOLING ? 'occupiedCoolingSetpoint' : 'occupiedHeatingSetpoint'];
    if (value === reported) {
      return;
    }
    const mode = this.device.getOperationMode();
    const celsius = fromMatterTemp(value);
    let target: number;
    if (mode === CLIMATE_MODE_AUTO) {
      target = celsius + (setpointMode === CLIMATE_MODE_HEATING ? AUTO_SETPOINT_OFFSET : -AUTO_SETPOINT_OFFSET);
    } else if (mode === setpointMode) {
      target = celsius;
    } else if (this.reportedSystemMode(mode) !== SYSTEM_MODE_BY_MODE[mode]) {
      check(await this.device.setOperationMode(setpointMode));
      check(await this.device.setTargetTemperature(celsius));
      return;
    } else {
      return;
    }
    if (this.device.getTargetTemperatureWithMode(mode) !== target) {
      check(await this.device.setTargetTemperature(target));
    }
  }

  private async setFanStep(step: number) {
    const code = FAN_SPEED_TABLE.find((entry) => entry.number === step)?.code;
    const current = this.device.getFanSpeedNumber();
    if (step === 0 && current !== 0) {
      this.lastFanStep = current;
    }
    if (code && current !== step) {
      check(await this.device.setFanSpeed(code));
    }
  }

  // HomeKit Fan semantics — off = the unit's automatic speed, on = back to
  // the last explicit speed — except that the fan reads off while the unit
  // is off, and switching it on then starts the unit.
  private async setFanMode(fanMode: number) {
    if (fanMode === this.fanState().fanMode) {
      return;
    }
    if (fanMode === FAN_MODE_OFF) {
      return this.setFanStep(0);
    }
    await this.powerOn();
    if (STEP_BY_FAN_MODE[fanMode] !== undefined && this.fanState().fanMode !== fanMode) {
      return this.setFanStep(STEP_BY_FAN_MODE[fanMode]);
    }
    if (this.device.getFanSpeedNumber() === 0) {
      return this.setFanStep(this.lastFanStep);
    }
  }

  private async setFanPercent(percent: number | null) {
    if (percent === null || percent === this.fanState().percentSetting) {
      return;
    }
    if (percent === 0) {
      return this.setFanStep(0);
    }
    await this.powerOn();
    await this.setFanStep(clamp(Math.round(percent * FAN_STEPS / 100), [1, FAN_STEPS]));
  }
}
