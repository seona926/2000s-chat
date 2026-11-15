import { spawn } from 'node:child_process'
const args = process.argv.slice(2)
const portIndex = args.indexOf('--port')
const port = portIndex >= 0 ? args[portIndex + 1] : '8787'
const child = spawn('node', ['node_modules/wrangler/bin/wrangler.js', 'dev', '--ip', '127.0.0.1', '--port', port], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: '--require=' + new URL('./network.cjs', import.meta.url).pathname },
})
process.on('SIGTERM', () => child.kill('SIGTERM'))
child.on('exit', code => process.exit(code ?? 0))
