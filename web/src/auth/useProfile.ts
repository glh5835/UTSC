import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabase'
import {
  createProfileController,
  type ProfileData,
  type ProfilePhase,
  type ProfileUpdate,
  type SaveResult,
} from './profileController'

export type { ProfileData, ProfilePhase, ProfileUpdate, SaveResult }

/**
 * Loads and saves the signed-in user's profile row. The isolation logic lives
 * in createProfileController (profileController.ts): the cache is strictly
 * keyed on the live user id, and every async response is re-checked against
 * the current owner + generation before it may update state. This hook is the
 * React binding only.
 */
export function useProfile(user: User | null | undefined) {
  const controllerRef = useRef<ReturnType<typeof createProfileController> | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createProfileController(getSupabase)
  }
  const controller = controllerRef.current
  const [phase, setPhase] = useState<ProfilePhase>(() => controller.getPhase())

  useEffect(() => controller.subscribe(() => setPhase(controller.getPhase())), [controller])

  useEffect(() => {
    controller.setIdentity(user)
  }, [controller, user?.id])

  const save = useCallback(
    (update: ProfileUpdate): Promise<SaveResult> => controller.save(update),
    [controller],
  )

  return { phase, save }
}
