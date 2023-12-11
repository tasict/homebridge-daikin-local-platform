import {DaikinLocalAPI, DaikinDevice} from './daikin-local';
import {
  CLIMATE_MODE_AUTO,
  CLIMATE_MODE_COOLING,
  CLIMATE_MODE_DEHUMIDIFY,
  CLIMATE_MODE_FAN,
  CLIMATE_MODE_HEATING,
  CLIMATE_FAN_SPEED_AUTO,
  CLIMATE_FAN_SPEED_SLIENT,
  CLIMATE_FAN_SPEED_1,
  CLIMATE_FAN_SPEED_2,
  CLIMATE_FAN_SPEED_3,
  CLIMATE_FAN_SPEED_4,
  CLIMATE_FAN_SPEED_5
} from './daikin-local';
import DaikinPlatformLogger from './logger';




const logger = new DaikinPlatformLogger(undefined, true);


const daikinLocalAPI = new DaikinLocalAPI(logger);

daikinLocalAPI.fetchDevices(["10.1.10.120", "10.1.10.121", "10.1.10.122", "10.1.10.123"]).then((devices) => {

  for(let i = 0; i < devices.length; i++) {
    logger.info(`Name: '${devices[i].getDeviceName()}' Temp: '${devices[i].getIndoorTemperature()}' Humidity: '${devices[i].getIndoorHumidity()}' Target Temp: '${devices[i].getTargetTemperature()}'  Mode: '${devices[i].getOperationModeName()}' FanSpeed: '${devices[i].getFanSpeedName()}'`);
    logger.info(`Model: ${ devices[i].getDeviceType()} SSID: ${devices[i].getSSID()}`);
    devices[i].setShowSSID(false);
    devices[i].setCallback(updateDeviceStatus);
  }

});

function updateDeviceStatus(device: DaikinDevice) {
  device.fetchDeviceStatus().then(() => {
    logger.info(`Name: '${device.getDeviceName()}' Temp: '${device.getIndoorTemperature()}' Humidity: '${device.getIndoorHumidity()}' Target Temp: '${device.getTargetTemperature()}'  Mode: '${device.getOperationModeName()}' FanSpeed: '${device.getFanSpeedName()}'`);
    logger.info(`Model: '${ device.getDeviceType()}'`);
  });
}



