import fs from 'node:fs'
import path from 'node:path'

/** Parse exactly one optional output path; relative paths use the caller's cwd. */
export function parseOutputArgument(args, { required = false } = {}) {
  let output = null
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    let value
    if (argument === '--out') value = args[++index]
    else if (argument.startsWith('--out=')) value = argument.slice('--out='.length)
    else throw new Error(`Unknown argument: ${argument}`)
    if (output !== null) throw new Error('Specify --out only once')
    if (!value || !value.trim() || value.startsWith('--')) throw new Error('--out requires a file path')
    output = path.resolve(value)
  }
  if (required && output === null) throw new Error('An explicit --out file path is required')
  return output
}

/** Reserve the report before service actions. 'wx' refuses files and symlinks. */
export function reserveReportOutput(args, { root, now = new Date() } = {}) {
  let file = parseOutputArgument(args)
  if (file === null) {
    const artifacts = path.join(root, 'artifacts')
    fs.mkdirSync(artifacts, { recursive: true })
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
    const directory = fs.mkdtempSync(path.join(artifacts, `rls-acceptance-${stamp}-`))
    file = path.join(directory, 'rls-acceptance.json')
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  let descriptor
  try {
    descriptor = fs.openSync(file, 'wx')
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Refusing to overwrite existing report: ${file}`)
    throw error
  }
  let closed = false
  return {
    file,
    write(report) {
      if (closed) throw new Error('Report output has already been written')
      try {
        fs.writeFileSync(descriptor, JSON.stringify(report, null, 2) + '\n', 'utf8')
      } finally {
        fs.closeSync(descriptor)
        closed = true
      }
    },
  }
}
