import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '../../lib/supabase'
import {
  createLearningPathsController,
  createSupabaseLearningPathsGateway,
  type LearningPathsPhase,
  type PathActionResult,
  type PathItemInput,
  type PathItemStatus,
} from './learningPaths'

/**
 * One controller instance per mounted page (per component instance); account
 * changes flow through setIdentity, which invalidates the previous account's
 * in-flight reads and writes. Language is not part of the identity or the
 * instance key, so switching English/Chinese never rebuilds or clears the
 * controller, drafts or paths.
 */
export function useLearningPaths(userId: string | null) {
  const controllerRef = useRef<ReturnType<typeof createLearningPathsController> | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createLearningPathsController(() =>
      createSupabaseLearningPathsGateway(getSupabase),
    )
  }
  const controller = controllerRef.current
  const [phase, setPhase] = useState<LearningPathsPhase>(() => controller.getPhase())

  useEffect(() => controller.subscribe(() => setPhase(controller.getPhase())), [controller])
  useEffect(() => {
    controller.setIdentity(userId)
    return () => controller.setIdentity(null)
  }, [controller, userId])

  return {
    phase,
    reload: useCallback(() => controller.reload(), [controller]),
    createPathWithItems: useCallback(
      (targetRoleId: string, items: readonly PathItemInput[]) =>
        controller.createPathWithItems(targetRoleId, items),
      [controller],
    ),
    addItemsToPath: useCallback(
      (pathId: string, items: readonly PathItemInput[]) =>
        controller.addItemsToPath(pathId, items),
      [controller],
    ),
    deletePath: useCallback((pathId: string) => controller.deletePath(pathId), [controller]),
    removePathItem: useCallback((itemId: string) => controller.removePathItem(itemId), [controller]),
    updatePathItemStatus: useCallback(
      (itemId: string, status: PathItemStatus) => controller.updatePathItemStatus(itemId, status),
      [controller],
    ),
  }
}

export type { PathActionResult }
