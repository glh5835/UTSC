import { describe, expect, it } from 'vitest'
import { accountRoute, readMailCallback } from '../src/auth/emailCallback'

const token = 'test_only_auth_callback_token_123456789'

describe('email callback boundary', () => {
  it.each(['email', 'recovery'])('recognizes %s links without using the network', intent => {
    expect(readMailCallback(`#auth=${intent}&token_hash=${token}`)).toEqual({ kind: 'verify', intent, tokenHash: token })
  })

  it('preserves navigation and strips the fragment when replacing the callback with the account route', () => {
    expect(readMailCallback('#/market?role=data_analyst')).toBeNull()
    expect(accountRoute(new URL(`https://student.example/?lang=zh#auth=email&token_hash=${token}`))).toBe('/?lang=zh#/account')
  })

  it.each(['#auth=recovery', `#auth=invite&token_hash=${token}`, `#auth=email&auth=recovery&token_hash=${token}`, '#error_code=otp_expired'])('rejects a malformed or unsupported link', hash => {
    expect(readMailCallback(hash)).toEqual({ kind: 'invalid' })
  })

  it('recognizes the pre-existing local Supabase recovery redirect without holding tokens', () => {
    expect(readMailCallback('#access_token=example&refresh_token=example&type=recovery')).toEqual({ kind: 'recovery-redirect' })
  })
})
