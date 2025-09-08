const ProtomuxRpcClient = require('protomux-rpc-client')
const Client = require('./client')
const IdEnc = require('hypercore-id-encoding')
const HyperDHT = require('hyperdht')
const b4a = require('b4a')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const Registry = require('./lib/db')

async function main () {
  const rpcKeys = [
    // '3p1jtyn9spb47gk97qsa11dzdd5atcggjp77nso59uy8a53pn17o',
    // 'qqw68q3bmoik53kje56docyx8aspmhsfx7wchrzmn37cxes9bwgo',
    // '9gnbxinnrfduj74c6scekitkqws6zgjg1egugmea8d7hgatsc8sy'
  ].map(IdEnc.decode)

  const viewKey = IdEnc.decode('') // g6suzs6919czs1ywpaptigmmfn9ntncswnkyss38rnfktuduf5io

  const rpcKey = rpcKeys[Math.floor(Math.random() * rpcKeys.length)]

  const dht = new HyperDHT()
  const rpcClient = new ProtomuxRpcClient(dht)
  const client = new Client(rpcKey, rpcClient)

  console.log(`Adding entry through RPC server at ${IdEnc.normalize(rpcKey)}`)
  const entry = {
    name: 'e1',
    driveKey: b4a.from('a'.repeat(64), 'hex'),
    type: 'type1',
    owner: 'someone',
    description: 'a model'
  }
  await client.putEntry(entry)

  console.log('Successfully added entry')

  // Let indexers sync
  await new Promise(resolve => setTimeout(resolve, 500))

  const swarm = new Hyperswarm({ dht })
  const store = new Corestore('client-corestore')
  swarm.on('connection', c => {
    console.log('lookup client opened connection')
    store.replicate(c)
  })
  const core = store.get(viewKey)
  const registry = new Registry(core)
  await registry.ready()
  console.log(`swarming on registry discovery key ${IdEnc.normalize(registry.discoveryKey)}`)
  swarm.join(registry.discoveryKey, { client: true, server: false })

  // Some time to discover peers
  await new Promise(resolve => setTimeout(resolve, 2000))

  console.log('Looking up entry from the db...', await registry.get(entry.name))

  await rpcClient.close()
  await swarm.destroy()
  await registry.close()
  await store.close()
}

main()
