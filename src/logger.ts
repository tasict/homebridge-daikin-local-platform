import { Logger } from 'homebridge';


/**
 * Decorates the Homebridge logger to only log debug messages when debug mode is enabled.
 * Without a Homebridge logger (the standalone harnesses) it falls back to the console.
 */
export default class DaikinPlatformLogger {

  constructor(
    private readonly logger: Logger|undefined = undefined,
    private readonly debugMode: boolean = false,
  ) {}

  debug(...messages: any[]) {

    if (this.debugMode) {
      for (let i = 0; i < messages.length; i++) {

        if(this.logger !== undefined)
          this.logger.debug(messages[i]);
        else
          console.debug(messages[i]);
        

      }
    }
  }

  info(...messages: any[]) {
    for (let i = 0; i < messages.length; i++) {
      if(this.logger !== undefined)
        this.logger.info(messages[i]);
      else
        console.info(messages[i]);
    }
  }

  warn(...messages: any[]) {
    for (let i = 0; i < messages.length; i++) {
      if(this.logger !== undefined)
        this.logger.warn(messages[i]);
      else
        console.warn(messages[i]);
    }
  }

  error(...messages: any[]) {
    for (let i = 0; i < messages.length; i++) {
      if(this.logger !== undefined)
        this.logger.error(messages[i]);
      else
        console.error(messages[i]);
    }
  }
}
