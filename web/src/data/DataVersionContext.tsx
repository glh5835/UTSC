import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'
import type { ValidateFunction } from 'ajv'
import { DATA_CONFIG, type DataVersionConfig } from './sources'
import { createBundleValidator, loadSchemaSet } from './validation'

interface DataVersionContextValue {
  config: DataVersionConfig
  validator: () => Promise<ValidateFunction>
}

const DataVersionContext = createContext<DataVersionContextValue | null>(null)

export function DataVersionProvider({
  children,
  config = DATA_CONFIG,
}: {
  children: ReactNode
  config?: DataVersionConfig
}) {
  const validatorPromise = useRef<Promise<ValidateFunction> | null>(null)
  const validator = useCallback(() => {
    validatorPromise.current ??= loadSchemaSet(config.schemaBasePath, config.schemaVersion)
      .then(createBundleValidator)
      .catch((error: unknown) => {
        validatorPromise.current = null
        throw error
      })
    return validatorPromise.current
  }, [config])
  const value = useMemo(() => ({ config, validator }), [config, validator])
  return <DataVersionContext.Provider value={value}>{children}</DataVersionContext.Provider>
}

export function useDataVersion(): DataVersionContextValue {
  const value = useContext(DataVersionContext)
  if (!value) throw new Error('useDataVersion requires DataVersionProvider')
  return value
}
