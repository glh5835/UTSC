import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseOutputArgument, reserveReportOutput } from './report-output.mjs'

const temporary: string[] = []
function workspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utsc-report-output-'))
  temporary.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('acceptance report output protection', () => {
  it('creates different default directories even with the same timestamp', () => {
    const root = workspace()
    const now = new Date('2026-10-29T00:00:00Z')
    const first = reserveReportOutput([], { root, now })
    const second = reserveReportOutput([], { root, now })
    first.write({ passed: 49 })
    second.write({ failed: 1 })
    expect(first.file).not.toBe(second.file)
    expect(path.dirname(first.file)).not.toBe(path.dirname(second.file))
    expect(JSON.parse(fs.readFileSync(first.file, 'utf8'))).toEqual({ passed: 49 })
  })

  it('honors an explicit path and refuses a second writer before the first finishes', () => {
    const file = path.join(workspace(), 'chosen', 'report.json')
    const output = reserveReportOutput(['--out', file])
    expect(output.file).toBe(file)
    expect(() => reserveReportOutput(['--out', file])).toThrow('Refusing to overwrite')
    output.write({ status: 'failed', exitCode: 3 })
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ status: 'failed', exitCode: 3 })
  })

  it('preserves a historical report for both success and failure attempts', () => {
    const file = path.join(workspace(), 'history.json')
    const original = '{"historical":true}\n'
    fs.writeFileSync(file, original)
    for (const result of [{ passed: 49 }, { failed: 1 }]) {
      expect(() => reserveReportOutput(['--out', file]).write(result)).toThrow('Refusing to overwrite')
      expect(fs.readFileSync(file, 'utf8')).toBe(original)
    }
  })

  it('rejects invalid or duplicate options rather than choosing the first path', () => {
    for (const args of [['--out'], ['--out='], ['--out', '--other'], ['--out', 'a', '--out', 'b'], ['--out=a', '--out=b'], ['--other', 'a']]) {
      expect(() => parseOutputArgument(args)).toThrow()
    }
    expect(() => parseOutputArgument([], { required: true })).toThrow('explicit --out')
    expect(parseOutputArgument(['--out=chosen.json'])).toBe(path.resolve('chosen.json'))
  })

  it('allows only one completed report per reserved writer', () => {
    const output = reserveReportOutput([], { root: workspace() })
    output.write({ first: true })
    expect(() => output.write({ first: false })).toThrow('already been written')
    expect(JSON.parse(fs.readFileSync(output.file, 'utf8'))).toEqual({ first: true })
  })
})
