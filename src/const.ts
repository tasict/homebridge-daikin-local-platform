export const ENDPOINT = '/dsiot/multireq';
export const USER_AGENT = 'DaikinMobileController/1.0.0 CFNetwork/1410.0.3 Darwin/22.6.0';

// Minimum time between two device queries; a read inside this window returns the
// cached response instead of hitting the unit again.
export const MIN_REQUEST_INTERVAL_MS = 2000;

// Abort a device request that hasn't responded within this window so a hung
// connection can't stall the shared rate-limited queue.
export const REQUEST_TIMEOUT_MS = 20 * 1000;

export const DEVICE_STATUS_REFRESH_INTERVAL = 30 * 1000;

// The energy history is a separate, much larger request (the whole /dsiot/edge
// tree), so it is polled on its own slow cadence instead of every status refresh.
export const ENERGY_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

// Daikin's Auto mode has a single target temperature. Both accessories show
// it as a heating..cooling range of target ± this offset (HomeKit's Auto range
// slider; Matter's 2 °C default dead band), and moving either end moves the
// target instead of leaving Auto.
export const AUTO_SETPOINT_OFFSET = 1;
