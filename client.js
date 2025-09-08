const { resolveStruct } = require('./spec/hyperschema')
const EntryEnc = resolveStruct('@registry/entry')
const cenc = require('compact-encoding')

class RegistryClient {
  constructor (registryKey, rpcClient) {
    this.registryKey = registryKey
    this.rpcClient = rpcClient
  }

  async putEntry (entry) {
    return await this.rpcClient.makeRequest(
      this.registryKey,
      'put-entry',
      entry,
      { requestEncoding: EntryEnc, responseEncoding: cenc.none }
    )
  }
}

module.exports = RegistryClient
