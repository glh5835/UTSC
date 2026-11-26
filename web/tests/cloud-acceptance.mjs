import assert from 'node:assert/strict'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { OWNER_KEY, TABLES, runMatrix } from './rls-matrix.mjs'
import { reserveReportOutput } from './report-output.mjs'

function argumentsForRun(args) {
  const { values } = parseArgs({ args, options: Object.fromEntries([
    'target', 'project-ref', 'other-project-ref', 'site', 'code-commit', 'inventory-sha', 'out',
  ].map(name => [name, { type: 'string', multiple: true }])) })
  for (const name of ['target', 'project-ref', 'other-project-ref', 'site', 'code-commit', 'inventory-sha', 'out']) {
    assert.equal(values[name]?.length, 1, `Supply --${name} exactly once`)
  }
  const [target] = values.target
  const [projectRef] = values['project-ref']
  const [otherProject] = values['other-project-ref']
  const [commit] = values['code-commit']
  const [inventory] = values['inventory-sha']
  const [reportPath] = values.out
  assert.ok(['staging', 'production'].includes(target), 'Select staging or production explicitly')
  assert.ok(/^[a-z0-9]{20}$/.test(projectRef) && /^[a-z0-9]{20}$/.test(otherProject) && projectRef !== otherProject,
    'Specify both distinct hosted Supabase project refs')
  assert.ok(/^[0-9a-f]{40}$/.test(commit) && /^[0-9a-f]{64}$/.test(inventory), 'Supply exact approved commit and inventory digests')
  const site = URL.parse(values.site[0])
  assert.ok(site?.protocol === 'https:' && site.hostname.includes('.') && !site.port &&
    !site.username && !site.password && site.pathname === '/' && !site.search && !site.hash,
  'Specify the exact hosted HTTPS site origin')
  return { target, url: `https://${projectRef}.supabase.co`, site: site.origin, commit, inventory, reportPath }
}

function readCredentials() {
  const { UTSC_CLOUD_QA_PUBLISHABLE_KEY: publicKey, UTSC_CLOUD_QA_SECRET_KEY: secret,
    UTSC_CLOUD_QA_MAILBOX: mailbox, UTSC_CLOUD_QA_PASSWORD_A: passwordA,
    UTSC_CLOUD_QA_PASSWORD_B: passwordB, UTSC_CLOUD_QA_RECOVERED_PASSWORD_A: recoveredPasswordA } = process.env
  assert.ok(/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey ?? '') && /^sb_secret_[A-Za-z0-9_-]+$/.test(secret ?? ''),
    'Configure the selected project’s cloud QA publishable and secret keys')
  assert.ok(/^[a-z0-9._-]{1,30}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(mailbox ?? ''),
    'Configure a dedicated QA mailbox supporting plus aliases')
  assert.ok([passwordA, passwordB, recoveredPasswordA].every(value => value && value.length >= 12) &&
    new Set([passwordA, passwordB, recoveredPasswordA]).size === 3, 'Configure three distinct QA passwords of at least 12 characters')
  return { publicKey, secret, mailbox, passwordA, passwordB, recoveredPasswordA }
}

function ok(result, action) {
  if (result.error) throw new Error(`${action} failed`)
  return result.data
}

function absent(result) {
  return result.error?.code === 'user_not_found' && result.error?.status === 404
}

async function run() {
  const options = argumentsForRun(process.argv.slice(2))
  const output = reserveReportOutput(['--out', options.reportPath], { root: fileURLToPath(new URL('../../', import.meta.url)) })
  const { target, url, site, commit, inventory } = options
  const report = { started: new Date().toISOString(), target, supabaseOrigin: url, site, commit, inventory, checks: [] }
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 20)
  report.runId = runId
  const tracked = new Map()
  const cachedSessions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  let terminal
  let admin
  async function cleanupAccount(label) {
    const account = tracked.get(label)
    assert.ok(account, 'Only accounts registered by this run are eligible for cleanup')
    const result = await admin.auth.admin.getUserById(account.uid)
    if (!absent(result)) {
      const { user } = ok(result, `Read tracked QA account ${label}`)
      assert.ok(user?.id === account.uid && user.email === account.email && user.user_metadata?.utsc_cloud_qa_run === runId,
        `Refusing cleanup of unrecognized account ${label}`)
      ok(await admin.auth.admin.deleteUser(account.uid), `Clean tracked QA account ${label}`)
    }
    assert.ok(absent(await admin.auth.admin.getUserById(account.uid)), `QA account ${label} still exists`)
    for (const table of TABLES) {
      const key = OWNER_KEY(table)
      const { count, error } = await admin.from(table).select(key, { count: 'exact', head: true }).eq(key, account.uid)
      assert.ok(!error && count === 0, `QA rows may remain in ${table}`)
    }
  }
  function passed(name) { report.checks.push({ name, passed: true }) }
  async function operatorConfirm(prompt) {
    const answer = await terminal.question(`${prompt}\nEnter verified to continue, or any other text to stop. `)
    assert.equal(answer.trim(), 'verified', 'Operator did not verify the browser step')
  }

  try {
    assert.ok(process.stdin.isTTY, 'An interactive operator is required to verify the actual browser and mail steps')
    const credentials = readCredentials()
    const { publicKey, secret } = credentials
    const response = await fetch(`${site}/deployment.json`, { redirect: 'error', signal: AbortSignal.timeout(10_000), cache: 'no-store' })
    assert.ok(response.ok, 'Hosted deployment receipt is unavailable')
    const receipt = await response.json()
    assert.ok(receipt?.target === target && receipt.supabaseOrigin === url && receipt.codeCommit === commit &&
      receipt.inventorySha256 === inventory && /^[a-f0-9]{64}$/.test(receipt.bundleSha256),
    'Hosted code, data and Supabase target must match the exact approved release')
    report.datasetVersion = receipt.datasetVersion
    report.bundleSha256 = receipt.bundleSha256
    passed('Hosted deployment matches the explicit target, commit and approved package')
    admin = createClient(url, secret, cachedSessions)
    const [localPart, domain] = credentials.mailbox.split('@')
    const alias = label => `${localPart}+utsc-${runId}-${label.toLowerCase()}@${domain}`
    const password = label => label === 'A' ? credentials.passwordA : credentials.passwordB
    terminal = createInterface({ input: process.stdin, output: process.stdout })
    terminal.on('SIGINT', () => terminal.close())
    console.log(`UTSC QA run ${runId}. A/B alias format: mailbox+utsc-${runId}-{a,b}@domain.`)
    await operatorConfirm('Confirm this target and dedicated QA mail aliases are authorized for this run.')

    const cloud = {
      async createAccount(label, client) {
        const email = alias(label)
        const created = ok(await client.auth.signUp({ email, password: password(label), options: {
          emailRedirectTo: `${site}/`, data: { utsc_cloud_qa_run: runId },
        } }), `QA ${label} signup`)
        const user = created.user
        assert.ok(user?.id && user.email === email && user.identities?.length > 0 &&
          user.user_metadata?.utsc_cloud_qa_run === runId && Math.abs(Date.now() - Date.parse(user.created_at)) <= 120_000,
        `QA ${label} signup did not return a fresh isolated identity`)
        tracked.set(label, { uid: user.id, email })
        assert.equal(created.session, null, 'Cloud signup must require email verification')
        const preConfirm = await client.auth.signInWithPassword({ email, password: password(label) })
        assert.equal(preConfirm.error?.code, 'email_not_confirmed', 'Password login succeeded before email verification')
        await operatorConfirm(`${label}: Open the actual confirmation email in a clean browser, verify it returns to the selected origin, and complete the on-page confirmation.`)
        const verified = ok(await admin.auth.admin.getUserById(user.id), `Read newly verified QA ${label}`)
        assert.ok(verified.user?.email_confirmed_at, `QA ${label} confirmation was not applied`)
        let finalPassword = password(label)
        if (label === 'A') {
          await operatorConfirm('A: Sign out of the confirmation session if needed. Sign in through the site, refresh to check session persistence, then sign out and refresh to check personal pages stay signed out.')
          await operatorConfirm('A: Request password recovery in the site, open the delivered link, set the configured recovered password, and verify that the site signs in with it.')
          finalPassword = credentials.recoveredPasswordA
          const oldLogin = await client.auth.signInWithPassword({ email, password: password(label) })
          assert.equal(oldLogin.error?.code, 'invalid_credentials', 'The previous password was not refused after recovery')
          passed('A: Browser session restore, sign-out and password recovery observed; old password refused by Auth')
        }
        const login = ok(await client.auth.signInWithPassword({ email, password: finalPassword }), `QA ${label} sign-in`)
        assert.equal(login.session?.user.id, user.id, `QA ${label} logged in as an unexpected user`)
        return user.id
      },
      cleanupAccount,
      async deleteAccounts(accounts, anonymous) {
        const anonDeletion = await anonymous.rpc('delete_own_account')
        assert.ok(['42501', 'PGRST202'].includes(anonDeletion.error?.code), 'Anonymous deletion was not refused')
        const badSignature = await accounts.B.client.rpc('delete_own_account', { user_id: accounts.A.uid })
        assert.ok(['42883', 'PGRST202'].includes(badSignature.error?.code), 'Deletion accepted a caller-supplied account ID')
        const b = accounts.B.client
        const bSession = ok(await b.auth.signInWithPassword({ email: alias('B'), password: password('B') }), 'Refresh QA B sign-in').session
        ok(await b.auth.signOut({ scope: 'local' }), 'Revoke QA B current session')
        const stale = createClient(url, publicKey, { ...cachedSessions, accessToken: async () => bSession.access_token })
        assert.equal((await stale.rpc('delete_own_account')).error?.code, '42501', 'A revoked session could call the deletion RPC')
        await operatorConfirm('A: Use Delete account in the site, re-enter the recovered password and confirm deletion. Verify the site returns to signed out.')
        assert.ok(absent(await admin.auth.admin.getUserById(accounts.A.uid)), 'Browser deletion did not remove QA A')
        const removedLogin = await accounts.A.client.auth.signInWithPassword({ email: alias('A'), password: credentials.recoveredPasswordA })
        assert.equal(removedLogin.error?.code, 'invalid_credentials', 'Deleted QA A could sign in')
        const bLogin = ok(await b.auth.signInWithPassword({ email: alias('B'), password: password('B') }), 'Sign in QA B after A deletion')
        assert.equal(bLogin.user?.id, accounts.B.uid, 'QA B was affected by the deletion of A')
        for (const table of TABLES) {
          const rows = ok(await b.from(table).select(OWNER_KEY(table)).eq(OWNER_KEY(table), accounts.B.uid), `Read QA B ${table} after A deletion`)
          assert.equal(rows.length, 1, `QA B ${table} was affected by deletion of A`)
        }
        ok(await b.rpc('delete_own_account'), 'Remove QA B through authenticated RPC')
        assert.ok(absent(await admin.auth.admin.getUserById(accounts.B.uid)), 'RPC did not remove QA B')
        passed('Deletion requires the owner’s active session. A browser deletion left B intact; B self-deletion followed.')
      },
    }
    const result = await runMatrix({ url, publicKey, secret, createClient, cloud })
    for (const check of result.checks) report.checks.push({ name: check.name, passed: check.passed })
  } catch {
    report.checks.push({ name: 'Cloud prerequisites and execution', passed: false })
  } finally {
    terminal?.close()
    for (const label of tracked.keys()) {
      try {
        await cleanupAccount(label)
        passed(`QA ${label}: Auth identity and all six personal tables rechecked empty`)
      } catch {
        report.checks.push({ name: `QA ${label}: cleanup needs owner review of the run alias`, passed: false })
      }
    }
    report.finished = new Date().toISOString()
    report.allPassed = tracked.size === 2 && report.checks.every(check => check.passed)
    output.write(report)
    for (const check of report.checks.filter(check => !check.passed)) console.error(`FAILED: ${check.name}`)
    console.log(`Cloud acceptance ${report.allPassed ? 'passed' : 'failed'}. Report ${output.file}`)
    process.exitCode = report.allPassed ? 0 : 1
  }
}

run().catch(() => {
  console.error('Cloud acceptance requires --target, --project-ref, --other-project-ref, --site, --code-commit, --inventory-sha and a new --out file.')
  process.exitCode = 2
})
