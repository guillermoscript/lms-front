/** Isolated browser component QA. Prepared props/mocked API only; no DB/chain.
 * Run after npm run build so the harness can reuse compiled Tailwind CSS. */
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const work = await mkdtemp(path.join(tmpdir(), 'solana-component-qa-'))
await build({ entryPoints:[path.join(root,'tests/fixtures/solana-billing.tsx')],outfile:path.join(work,'app.js'),bundle:true,format:'esm',platform:'browser',jsx:'automatic',tsconfig:path.join(root,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'} })
const chunks=path.join(root,'.next/static/chunks')
const cssFiles=(await readdir(chunks)).filter(name=>name.endsWith('.css'))
const css=(await Promise.all(cssFiles.map(name=>readFile(path.join(chunks,name),'utf8')))).join('\n')
await writeFile(path.join(work,'style.css'),css+'\n:root { --font-noto-sans: system-ui; }\n')
await writeFile(path.join(work,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
const server=createServer(async(req,res)=>{
  const requested=new URL(req.url,'http://127.0.0.1').pathname
  const name=requested==='/'?'index.html':requested.slice(1)
  if(!['index.html','app.js','style.css'].includes(name)){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html')
  res.end(await readFile(path.join(work,name)))
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const port=server.address().port
const config=path.join(work,'playwright.config.mjs')
await writeFile(config,`import {defineConfig} from ${JSON.stringify(path.join(root,'node_modules/@playwright/test/index.mjs'))};\nexport default defineConfig({testDir:${JSON.stringify(path.join(root,'tests/playwright'))},testMatch:'solana-billing-components.spec.ts',workers:1,timeout:20000,retries:0,reporter:'list',use:{browserName:'chromium',headless:true},outputDir:${JSON.stringify(path.join(work,'results'))}});`)
try {
  const child=spawn(process.execPath,[path.join(root,'node_modules/@playwright/test/cli.js'),'test','--config',config],{cwd:root,env:{...process.env,SOLANA_COMPONENT_QA:'1',SOLANA_COMPONENT_QA_URL:`http://127.0.0.1:${port}`},stdio:'inherit'})
  process.exitCode=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)))
} finally { await new Promise(resolve=>server.close(resolve)) }
