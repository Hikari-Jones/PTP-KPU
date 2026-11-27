import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const directory = await mkdtemp(join(tmpdir(), 'ptp-tests-'))
try {
  const target = join(directory, 'tests.cjs')
  await build({entryPoints:['tests/all.test.ts'], bundle:true, platform:'node', outfile:target, define:{'import.meta.env':'{}'}})
  const result = spawnSync(process.execPath, ['--test', target], {stdio:'inherit'})
  process.exitCode = result.status ?? 1
} finally { await rm(directory, {recursive:true, force:true}) }
