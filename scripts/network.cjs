const os = require('node:os')
const original = os.networkInterfaces
os.networkInterfaces = () => {
  try { return original() } catch (error) {
    if (error.syscall !== 'uv_interface_addresses') throw error
    return { lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] }
  }
}
