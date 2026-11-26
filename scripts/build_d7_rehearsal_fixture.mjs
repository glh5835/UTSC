import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { referenceStatistics, verifyD7Package } from './verify_d7_package.mjs'

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { partial: { type: 'boolean' } },
})
const [output] = positionals
if (positionals.length !== 1) {
  throw new Error('Usage: node scripts/build_d7_rehearsal_fixture.mjs <new-output-directory> [--partial]')
}

const frozen = fileURLToPath(new URL('../web/tests/fixtures/d7-1.1/valid_bundle.json', import.meta.url))
const bundle = JSON.parse(readFileSync(frozen, 'utf8'))
const originalJob = bundle.market_jobs[0]
const originalEvent = bundle.opportunities[0]
const now = '2027-03-10T16:00:00Z'
const collection = '2027-03-09T16:00:00Z'
const syntheticJob = (id, fields) => ({
  ...originalJob,
  ...fields,
  job_key: `synthetic:${id}`,
  source: 'synthetic',
  source_job_id: id,
  source_url: `https://jobs.example/${id}`,
})
bundle.market_jobs = [
  syntheticJob('data_intern', { job_title: 'Synthetic Data Analyst Intern' }),
  syntheticJob('business_entry', {
    job_title: 'Synthetic Business Analyst',
    role_id: 'business_analyst',
    career_level: 'entry_level',
    technical_skill_ids: ['excel'],
  }),
  syntheticJob('data_missing', {
    job_title: 'Synthetic Data Analyst, missing description',
    description_status: 'missing',
    description_analyzable: false,
    technical_skill_ids: [],
    soft_skill_ids: [],
  }),
]
if (values.partial) bundle.market_jobs.pop()
bundle.manifest = {
  ...bundle.manifest,
  dataset_version: values.partial ? '1.1.2' : '1.1.1',
  generated_at: now,
  run_status: values.partial ? 'partial' : 'complete',
  sample_count: bundle.market_jobs.length,
}
bundle.organizers[0].profile_url = 'https://www.instagram.com/utsc_synthetic_rehearsal_fixture/'
const syntheticEvent = (id, title, fields) => ({
  ...originalEvent,
  ...fields,
  opportunity_id: id,
  title,
  source_url: `https://www.instagram.com/p/UTSC_SYNTHETIC_${id}/`,
  source_post_id: id,
  source_post_ids: [id],
  start_date: '2027-03-14',
  start_date_text: 'March 14',
  verified_at: collection,
})
bundle.opportunities = [
  syntheticEvent('synthetic_exact_event', 'Synthetic Exact-Time Workshop', {
    start_at: '2027-03-14T16:00:00Z',
    end_at: '2027-03-14T18:00:00Z',
    end_date: '2027-03-14',
    date_precision: 'datetime',
    start_precision: 'datetime',
    end_precision: 'datetime',
    start_date_text: 'March 14, noon Toronto',
    end_date_text: 'March 14, 2 p.m. Toronto',
  }),
  syntheticEvent('synthetic_date_only_event', 'Synthetic Date-Only Workshop', {}),
]
if (values.partial) {
  Object.assign(bundle.opportunities[0], {
    deadline_at: '2027-03-14T15:30:00Z',
    deadline_date: '2027-03-14',
    deadline_precision: 'datetime',
    deadline_date_text: 'March 14, 11:30 a.m. Toronto',
  })
  Object.assign(bundle.opportunities[1], {
    deadline_date: '2027-03-13',
    deadline_precision: 'date',
    deadline_date_text: 'March 13',
  })
}
const timedRecords = (records, id, time) => ({
  timestamp_field: time,
  records: records.map(item => ({ [id]: item[id], [time]: item[time] })),
})
const provenance = {
  generated_at: now,
  datasets: {
    market_jobs: {
      source: 'synthetic',
      collected_from: bundle.manifest.collected_from,
      collected_to: bundle.manifest.collected_to,
    },
    opportunities: {
      source: 'synthetic',
      collected_from: collection,
      collected_to: collection,
      records: bundle.opportunities.map((event, index) => ({
        opportunity_id: event.opportunity_id,
        source_post_ids: event.source_post_ids.map(id => ({
          source_post_id: id,
          first_seen_at: collection,
          last_seen_at: collection,
          last_fetched_at: collection,
        })),
        eligibility: {
          decision: index === 0 ? 'human_approved' : 'auto_candidate',
          content_revision: event.content_revision,
          evaluated_at: now,
        },
      })),
    },
    courses: timedRecords(bundle.courses, 'course_id', 'verified_at'),
    resources: timedRecords(bundle.resources, 'resource_id', 'verified_at'),
    organizers: timedRecords(bundle.organizers, 'organizer_id', 'last_verified_at'),
  },
}
const files = {
  'bundle.json': bundle,
  'manifest.json': bundle.manifest,
  'market_jobs.json': bundle.market_jobs,
  'skills.json': bundle.skills,
  'organizers.json': bundle.organizers,
  'courses.json': bundle.courses,
  'learning_resources.json': bundle.resources,
  'opportunities.json': bundle.opportunities,
  'reference_statistics.json': referenceStatistics(bundle.market_jobs),
  'dataset_provenance.json': provenance,
  'release_attestation.template.json': {
    dataset_version: bundle.manifest.dataset_version,
    reviewer: '',
    confirmed_at: '',
    confirmations: { role_classifications: false, course_evidence: false, opportunity_dates: false },
  },
}

const target = path.resolve(output)
const packageDirectory = path.join(target, 'package')
const jsonBytes = data => Buffer.from(JSON.stringify(data, null, 2) + '\n')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
mkdirSync(target)
mkdirSync(packageDirectory)
const inventory = []
for (const name of Object.keys(files).sort()) {
  const bytes = jsonBytes(files[name])
  writeFileSync(path.join(packageDirectory, name), bytes, { flag: 'wx' })
  inventory.push(`${hash(bytes)}  ${name}`)
}
const inventoryBytes = Buffer.from(inventory.join('\n') + '\n')
writeFileSync(path.join(packageDirectory, 'SHA256SUMS.txt'), inventoryBytes, { flag: 'wx' })
const inventorySha256 = hash(inventoryBytes)
await verifyD7Package(packageDirectory, inventorySha256)
writeFileSync(path.join(target, 'PIN.json'), jsonBytes({
  purpose: 'SYNTHETIC D7 1.1 candidate for isolated website rehearsal only',
  inventory_sha256: inventorySha256,
  now,
}), { flag: 'wx' })
