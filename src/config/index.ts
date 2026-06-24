/**
 * Config — re-exports and convenience access.
 */

export { ConfigSchema, validateConfig } from './schema'
export type { Config, PartialConfig } from './schema'

export { getConfig, loadConfig, resetConfig } from './loader'

export {
  getEnv,
  getEnvArray,
  getEnvBoolean,
  getEnvNumber,
  isDeniedEnvVar,
  requireEnv
} from './env'
