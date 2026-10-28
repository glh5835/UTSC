import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '../../lib/supabase'
import {
  createPersonalSkillsController,
  createSupabasePersonalSkillsGateway,
  type ConfirmationInput,
  type PersonalSkillsPhase,
} from './personalSkills'

export function usePersonalSkills(userId: string | null) {
  const controllerRef = useRef<ReturnType<typeof createPersonalSkillsController> | null>(null)
  if (controllerRef.current === null) {
    controllerRef.current = createPersonalSkillsController(() =>
      createSupabasePersonalSkillsGateway(getSupabase),
    )
  }
  const controller = controllerRef.current
  const [phase, setPhase] = useState<PersonalSkillsPhase>(() => controller.getPhase())

  useEffect(() => controller.subscribe(() => setPhase(controller.getPhase())), [controller])
  useEffect(() => {
    controller.setIdentity(userId)
    return () => controller.setIdentity(null)
  }, [controller, userId])

  return {
    phase,
    reload: useCallback(() => controller.reload(), [controller]),
    createExperience: useCallback((text: string) => controller.createExperience(text), [controller]),
    updateExperience: useCallback((id: string, text: string) => controller.updateExperience(id, text), [controller]),
    deleteExperience: useCallback((id: string) => controller.deleteExperience(id), [controller]),
    confirmSkill: useCallback((input: ConfirmationInput) => controller.confirmSkill(input), [controller]),
    revokeSkill: useCallback((id: string) => controller.revokeSkill(id), [controller]),
  }
}
