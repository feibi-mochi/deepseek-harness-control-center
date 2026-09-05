import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'

// Mirrors DSH STORE's runtime file selection and byte bounds. This is a size
// gate only, not a replacement for its independent source/permission review.
const source = /\.(?:[cm]?[jt]sx?|json|ya?ml|sh|py|rb|go|rs)$/i
const excluded = /(?:^|\/)(?:node_modules|vendor|test|tests|docs?|examples?|fixtures?|benchmarks?|coverage|\.github)(?:\/|$)/i
const metadata = /(?:^|\/)(?:brief\.json|catalog-entry(?:\.draft)?\.json)$/i
const paths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))]
const files = paths.filter(path => source.test(path) && !excluded.test(path) && !metadata.test(path)).map(path => ({ path, bytes: statSync(path).size }))
const total = files.reduce((sum, file) => sum + file.bytes, 0)
const tooBig = files.filter(file => file.bytes > 262144)
if (files.length > 240 || total > 2097152 || tooBig.length > 0) throw Error('DSH STORE source-size gate failed: ' + JSON.stringify({ count: files.length, total, tooBig }))
console.log(JSON.stringify({ files: files.length, totalBytes: total, largest: files.sort((a, b) => b.bytes - a.bytes)[0], limits: { count: 240, total: 2097152, file: 262144 } }))
