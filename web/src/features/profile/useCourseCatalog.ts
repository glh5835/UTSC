import { useDataVersion } from '../../data/DataVersionContext'
import { useMarketBundle } from '../market/useMarketBundle'

/** Public course and skill data comes from the same configured version context
 * as market pages. Personal records remain in their separate authenticated hooks. */
export function useCourseCatalog() {
  const { config } = useDataVersion()
  return useMarketBundle(config.courseBundlePath)
}
