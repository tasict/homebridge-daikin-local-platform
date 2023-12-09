class DaikinBaseException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DaikinBaseException';
  }
}

export class DaikinDeviceOffline extends DaikinBaseException {
  constructor(message: string) {
    super(message);
    this.name = 'DaikinDeviceOffline';
  }
}