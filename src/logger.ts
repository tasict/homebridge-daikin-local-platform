import { Logger } from 'homebridge';
import { Logger as TsLogger, ILogObj } from "tslog";


/**
 * Decorates the Homebridge logger to only log debug messages when debug mode is enabled.
 */
export default class DaikinPlatformLogger {

  private tsLogger: TsLogger<ILogObj> = new TsLogger();

  constructor(
    private readonly logger: Logger|undefined = undefined,
    private readonly debugMode: boolean = false,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(...messages: any[]) {

    if (this.debugMode) {
      for (let i = 0; i < messages.length; i++) {

        if(this.logger !== undefined)
          this.logger.debug(messages[i]);
        else
          this.tsLogger.debug(messages[i]);
        

      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(...messages: any[]) {
    for (let i = 0; i < messages.length; i++) {
      if(this.logger !== undefined)
        this.logger.info(messages[i]);
      else
        this.tsLogger.info(messages[i]);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error(...messages: any[]) {
    for (let i = 0; i < messages.length; i++) {
      if(this.logger !== undefined)
        this.logger.error(messages[i]);
      else
        this.tsLogger.error(messages[i]);
    }
  }
}
