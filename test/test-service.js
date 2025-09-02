const test = require('brittle')
const Corestore = require('corestore')
const setupTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')
const RegistryClient = require('../solution/client')
const RegistryService = require('../solution')
const ProtomuxRpcClient = require('protomux-rpc-client')

const DEBUG = false

test('Can add an additional indexer', async (t) => {
  t.plan(3)

  const testnet = await getTestnet(t)
  const { bootstrap } = testnet
  const { service } = await setupFirstIndexer(t, bootstrap)

  await service.ready()
  await new Promise(resolve => setTimeout(resolve, 250)) // Give time for the autobase announce to flush

  const store = new Corestore(await t.tmp())
  const swarm = new Hyperswarm({ bootstrap })

  swarm.on('connection', async conn => {
    if (DEBUG) console.log('New writer has a connection')
    store.replicate(conn)
    if (DEBUG) conn.on('close', () => { console.log('new writer closed connection') })
  })

  const service2 = new RegistryService(
    store,
    swarm,
    {
      bootstrap: service.base.key
    }
  )
  t.teardown(async () => {
    await service2.close()
    await swarm.destroy()
    await store.close()
  })

  service2.base.once('is-indexer', () => {
    t.pass('writer detected it is an indexer')
  })
  service2.base.on('update', async () => {
    if (service2.base.linearizer.indexers.length === 2) {
      t.pass('2 indexers from the POV of the new indexer')
    }
  })
  service.base.on('update', async () => {
    if (service.base.linearizer.indexers.length === 2) {
      t.pass('2 indexers from the POV of the old indexer')
    }
  })

  await service2.ready()
  await service.addWriter(service2.base.local.key)
})

test('Can put an entry', async (t) => {
  const testnet = await getTestnet(t)
  const { bootstrap } = testnet
  const { service } = await setupFirstIndexer(t, bootstrap)

  await service.ready()
  await new Promise(resolve => setTimeout(resolve, 100)) // swarm flush

  const { client } = await setupRpcClient(t, service.serverPublicKey, bootstrap)

  const inputEntry = {
    name: 'e1',
    driveKey: b4a.from('a'.repeat(64), 'hex'),
    type: 'type1',
    owner: 'someone',
    description: 'a model'
  }
  await client.putEntry(inputEntry)

  const res = await service.view.get('e1')
  t.alike(res, inputEntry)
})

const swarmNr = 0
async function getStoreAndSwarm (t, bootstrap) {
  const storage = await t.tmp()
  const store = new Corestore(storage)
  const swarm = new Hyperswarm({ bootstrap })
  swarm.on('connection', conn => {
    store.replicate(conn)
  })

  t.teardown(async () => {
    await swarm.destroy()
    await store.close()
  }, { order: 10000 + swarmNr })

  return { store, swarm }
}

async function setupFirstIndexer (t, bootstrap) {
  const { store, swarm } = await getStoreAndSwarm(t, bootstrap)

  const service = new RegistryService(store.namespace('registry'), swarm, {
    ackInterval: 10
  })

  t.teardown(async () => {
    await service.close()
  }, { order: 1000 })

  return { service, bootstrap, swarm }
}

async function setupRpcClient (t, serverPublicKey, bootstrap) {
  const { swarm } = await getStoreAndSwarm(t, bootstrap)
  const rpcClient = new ProtomuxRpcClient(swarm.dht)
  const client = new RegistryClient(serverPublicKey, rpcClient)

  t.teardown(async () => {
    await rpcClient.close()
  })
  return { client }
}

async function getTestnet (t) {
  const testnet = await setupTestnet()
  t.teardown(async () => {
    await testnet.destroy()
  }, { order: 10000000 })

  return testnet
}
