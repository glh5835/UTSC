/**
 * English is the source-of-truth dictionary. Chinese (zh.ts) must define
 * every key listed here — TypeScript enforces `Record<TxKey, string>`.
 * Interpolation placeholders use {name} and are substituted by t().
 */

const en = {
  'app.title': 'UTSC Career & Practice Navigator',
  'app.tagline': 'Compare data career directions, confirm your skills, find courses and club opportunities.',
  'app.syntheticBanner':
    'Development preview (A0): all data shown is SYNTHETIC contract fixtures, not real market or activity data.',
  'app.skipToContent': 'Skip to main content',
  'app.languageSwitch': 'Switch language',
  'app.primaryNav': 'Primary navigation',

  'nav.home': 'Home',
  'nav.sample': 'Sample data (read-only)',
  'nav.market': 'Market overview',
  'nav.compare': 'Role comparison',
  'nav.courses': 'Courses & skills',
  'nav.opportunities': 'Opportunities',
  'nav.profile': 'Profile',

  'home.title': 'Home',
  'home.intro':
    'This site is being built for UTSC students. A0 (this release) delivers the project foundation: React + TypeScript + Vite skeleton, the shared data contract, runtime validation, and a read-only sample data viewer.',
  'home.workingTitle': 'Working now',
  'home.workingItem1':
    'Basic navigation with a global English/Chinese switch that keeps canonical IDs, filters and the current page unchanged.',
  'home.workingItem2':
    'Read-only sample data viewer loading the agreed contract fixtures through a runtime validation layer.',
  'home.workingItem3':
    'Loading, error, empty and stale-data states; broken packages are rejected and never silently replaced.',
  'home.sampleCta': 'Open the sample data viewer',
  'home.pendingTitle': 'Not implemented yet (planned stages)',
  'home.pendingA1': 'A1 — Accounts, database and permissions (Supabase Auth + Postgres RLS). No login exists yet.',
  'home.pendingA2': 'A2 — Market overview and role comparison pages with filters and skill mention charts.',
  'home.pendingA3': 'A3 — Course–skill mapping and experience-based candidate skill extraction.',
  'home.pendingA4': 'A4 — Recommendations and learning paths.',
  'home.pendingA5': 'A5 — Opportunity browsing, classification filters and calendar export.',
  'home.pendingA6': 'A6 — Personal profile, favorites and saved progress (requires A1 accounts).',
  'home.pendingA7': 'A7 — Publishing adapter and ICS calendar export.',
  'home.pendingA8': 'A8 — Deployment and end-to-end acceptance.',
  'home.honestyNote':
    'No login, favorites, submissions or publishing are implemented in A0, and none are simulated. Nothing on this site should be read as real recruitment, course availability or activity information.',

  'sample.title': 'Sample data (read-only)',
  'sample.intro':
    'Load one of the three jointly agreed contract fixtures. Every bundle is validated at runtime against the upstream schemas plus cross-record checks; a bundle with any problem is rejected as a whole and nothing from it is shown.',
  'sample.selectorLegend': 'Choose a data package',
  'fixture.valid.label': 'Valid package',
  'fixture.valid.description': 'Synthetic sample with one job, skills, course, resource and opportunity.',
  'fixture.empty.label': 'Empty package',
  'fixture.empty.description': 'Valid structure with zero records; shows empty states.',
  'fixture.invalid.label': 'Broken package',
  'fixture.invalid.description': 'Intentionally violates the contract; must be clearly rejected.',
  'sample.syntheticBadge': 'SYNTHETIC',
  'sample.loading': 'Loading and validating data…',
  'sample.errorTitle': 'Could not load data files',
  'sample.errorMessage': 'The data package could not be fetched. Check that the local server is running, then retry.',
  'sample.retry': 'Retry',
  'sample.rejectedTitle': 'This data package was rejected',
  'sample.rejectedMessage':
    'Validation found problems, so nothing from this package is displayed. The previously loaded package is not substituted silently — choose another package or retry.',
  'sample.loadedOk': 'Package loaded and validated.',
  'sample.provenanceHeading': 'Data source',
  'sample.provenanceLine':
    'Verbatim copies from the data side contract (upstream commit {commit}). See the provenance record under public/contracts/.',
  'sample.issueHeading': 'Validation issues:',

  'manifest.title': 'Package manifest',
  'manifest.schemaVersion': 'Contract (schema) version',
  'manifest.datasetVersion': 'Dataset version',
  'manifest.generatedAt': 'Generated at (UTC)',
  'manifest.collectedFrom': 'Collection start (UTC)',
  'manifest.collectedTo': 'Collection end (UTC)',
  'manifest.postingFrom': 'Posting date from',
  'manifest.postingTo': 'Posting date to',
  'manifest.queryConfigVersion': 'Query config version',
  'manifest.runStatus': 'Run status',
  'manifest.sampleCount': 'Sample count (jobs)',
  'manifest.timesNote':
    'Times are shown exactly as stored in the package (UTC instants and date-only values). No build or view time is substituted.',

  'stale.banner':
    'This snapshot is old: generated {days} days ago (threshold {threshold} days). Data may be out of date.',

  'section.skills': 'Skills ({count})',
  'section.jobs': 'Market jobs ({count})',
  'section.courses': 'Courses ({count})',
  'section.resources': 'Learning resources ({count})',
  'section.opportunities': 'Approved opportunities ({count})',

  'empty.bundle': 'This package contains no records. Each section below shows its empty state.',
  'empty.skills': 'No skills in this package.',
  'empty.jobs': 'No market jobs in this package.',
  'empty.courses': 'No courses in this package.',
  'empty.resources': 'No learning resources in this package.',
  'empty.opportunities': 'No approved opportunities in this package.',

  'skill.id': 'skill_id',
  'skill.label': 'Label',
  'skill.category': 'Category',
  'skill.aliases': 'Aliases',

  'field.employer': 'Employer',
  'field.source': 'Source',
  'field.sourceJobId': 'Source job ID',
  'field.role': 'Role (role_id)',
  'field.roleSubtype': 'Role subtype',
  'field.classification': 'Classification',
  'field.careerLevel': 'Career level',
  'field.marketArea': 'Market area',
  'field.posted': 'Posted',
  'field.firstSeen': 'First seen (UTC)',
  'field.lastSeen': 'Last seen (UTC)',
  'field.technicalSkills': 'Technical skills',
  'field.softSkills': 'Soft skills',
  'field.descriptionStatus': 'Description status',
  'field.analyzable': 'Analyzable description',
  'field.yes': 'Yes',
  'field.no': 'No',
  'field.notSet': 'Not set',
  'field.noRoleId': 'No counted role (review)',
  'field.timezone': 'Timezone',
  'field.sourceUrl': 'Original source',
  'field.officialUrl': 'Official page',
  'field.calendarYear': 'Calendar year',
  'field.candidateSkills': 'Candidate skills',
  'field.evidence': 'Evidence (original text)',
  'field.verifiedAt': 'Verified at (UTC)',
  'field.prerequisiteNote': 'Prerequisites',
  'field.resourceType': 'Type',
  'field.level': 'Level',
  'field.eligibilityNote': 'Eligibility',
  'field.kind': 'Kind',
  'field.activityTypes': 'Activity types',
  'field.topics': 'Topics',
  'field.skills': 'Skills',
  'field.beginnerLevel': 'Difficulty',
  'field.format': 'Format',
  'field.location': 'Location',
  'field.start': 'Starts',
  'field.end': 'Ends',
  'field.deadline': 'Deadline',
  'field.reviewStatus': 'Review status',
  'field.reasons': 'Classification evidence (original text)',
  'field.registrationUrl': 'Registration',
  'field.changePending': 'Pending change under review',
  'field.originalNote':
    'Official names and source evidence are kept in their original language; canonical IDs are not translated.',

  'ph.title': '{page} — not implemented yet',
  'ph.planRef': 'Planned task: {ref}',
  'ph.noFake':
    'This page intentionally has no content: no login, favorites, submissions or results are simulated. The navigation entry exists so the site structure is visible.',

  'ph.market.desc': 'Will show job volume, filters by 8 roles, area, level and date, and skill mention rates (task A2).',
  'ph.compare.desc': 'Will compare two career directions with skill mention rates and shared denominators (task A2).',
  'ph.courses.desc': 'Will map UTSC courses and learning resources to skills, with candidate skill confirmation (task A3).',
  'ph.opportunities.desc': 'Will browse approved club activities and ongoing opportunities with filters (task A5).',
  'ph.profile.desc': 'Will provide personal profile, favorites and progress after real accounts exist (tasks A1/A4/A6).',

  'notfound.title': 'Page not found',
  'notfound.message': 'The address does not match any page of this site.',
  'notfound.back': 'Back to home',

  'errorBoundary.title': 'Something went wrong rendering this page',
  'errorBoundary.message': 'An unexpected error occurred. The data shown before the error is untouched; you can go back or reload.',
  'errorBoundary.reload': 'Reload page',

  'footer.preview': 'Development preview (A0). Not a deployed product.',
  'footer.contract': 'Contract synced verbatim from upstream commit {commit}.',
  'footer.dataRepo': 'Data repository (Seraphina)',
  'footer.websiteRepo': 'Website repository',
  'footer.provenance': 'Provenance record',
  'footer.langNote': 'Language switch affects interface text only; IDs, filters and current page are unchanged.',
} as const

export type TxKey = keyof typeof en

export type Dictionary = Record<TxKey, string>

export default en
