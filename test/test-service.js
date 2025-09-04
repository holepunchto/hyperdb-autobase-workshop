const { once } = require('events')
const test = require('brittle')
const Corestore = require('corestore')
const setupTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')
const b4a = require('b4a')
const RegistryClient = require('../solution/client')
const RegistryService = require('../solution')
const ProtomuxRpcClient = require('protomux-rpc-client')
const Registry = require('../solution/lib/db')

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

test('Can put an entry over RPC and access externally', async (t) => {
  t.plan(2)

  const testnet = await getTestnet(t)
  const { bootstrap } = testnet
  const { service } = await setupFirstIndexer(t, bootstrap)

  await service.ready()

  // To connect to people accessing the registry
  // Note: needs to be after we stabilise the view key
  // (all writers added and confirmed by appending something)
  service.swarm.join(service.view.discoveryKey, { server: true, client: true })

  await new Promise(resolve => setTimeout(resolve, 100)) // swarm flush

  {
    const { registry, swarm } = await getReader(t, bootstrap, service.view.publicKey)
    swarm.join(registry.discoveryKey)
    await swarm.flush()
    if (DEBUG) console.log('reader POV init length', registry.db.core.length)
    console.log('reader POV core disc key', registry.db.core.discoveryKey)
    registry.db.core.on('append', async () => {
      const res = await registry.get('e1')
      t.alike(res, inputEntry)
    })
  }

  const { client } = await setupRpcClient(t, service.serverPublicKey, bootstrap)
  const inputEntry = {
    name: 'e1',
    driveKey: b4a.from('a'.repeat(64), 'hex'),
    type: 'type1',
    owner: 'someone',
    description: 'a model'
  }
  await client.putEntry(inputEntry)

  {
    const res = await service.view.get('e1')
    t.alike(res, inputEntry, 'sanity check: processed by indexer')
  }
})

test.solo('3 indexers put entry happy path', async (t) => {
  t.plan(7)

  const { bootstrap, writer1, writer2, writer3 } = await setup3IndexerService(t)

  t.is(writer2.base.isIndexer, true, 'sanity check')
  t.is(writer3.base.isIndexer, true, 'sanity check')

  t.alike(writer2.view.publicKey, writer1.view.publicKey, 'sanity check: consistent views')
  t.alike(writer3.view.publicKey, writer1.view.publicKey, 'sanity check: consistent views')

  const viewDiscKey = writer1.view.discoveryKey
  {
    const { registry, swarm } = await getReader(t, bootstrap, writer1.view.publicKey)
    swarm.join(viewDiscKey)
    await swarm.flush()
    if (DEBUG) console.log('reader POV init length', registry.db.core.length)
    console.log('reader POV core disc key', registry.db.core.discoveryKey)
    registry.db.core.on('append', async () => {
      const res = await registry.get('e1')
      t.alike(res, inputEntry)
    })
  }

  const { client } = await setupRpcClient(t, writer1.serverPublicKey, bootstrap)
  const inputEntry = {
    name: 'e1',
    driveKey: b4a.from('a'.repeat(64), 'hex'),
    type: 'type1',
    owner: 'someone',
    description: 'a model'
  }
  console.log('disc key pre put', writer1.view.discoveryKey)

  await client.putEntry(inputEntry)

  {
    const res = await writer1.view.get('e1')
    t.alike(res, inputEntry, 'sanity check: processed by indexer')
    t.alike(viewDiscKey, writer1.view.discoveryKey, 'sanity check: view did not rotate')
    console.log('now disc key', writer1.view.discoveryKey)
  }
})

async function getReader (t, bootstrap, registryKey) {
  const { swarm, store } = await getStoreAndSwarm(t, bootstrap)
  const core = store.get(registryKey)
  const registry = new Registry(core)
  return { registry, swarm, store }
}

const swarmNr = 0
async function getStoreAndSwarm (t, bootstrap) {
  const storage = await t.tmp()
  const store = new Corestore(storage)
  const swarm = new Hyperswarm({ bootstrap })
  swarm.on('connection', conn => {
    store.replicate(conn)
    if (DEBUG) console.log('opened connection')
    store.replicate(conn)
    if (DEBUG) conn.on('close', () => { console.log('closed connection') })
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
    ackInterval: 0
  })

  t.teardown(async () => {
    await service.close()
  }, { order: 1000 })

  return { service, bootstrap, swarm }
}

async function setupWriter (t, bootstrap, originalIndexer) {
  const { store, swarm } = await getStoreAndSwarm(t, bootstrap)

  const writer = new RegistryService(store.namespace('registry'), swarm, {
    ackInterval: 10,
    autobaseBootstrap: originalIndexer.base.local.key
  })

  t.teardown(async () => {
    await writer.close()
  }, { order: 1000 })

  await writer.ready()
  await Promise.all([
    once(writer.base, 'writable'),
    originalIndexer.addWriter(writer.base.local.key)
  ])

  return { writer, bootstrap, swarm }
}

async function setup3IndexerService (t) {
  const testnet = await getTestnet(t)
  const { bootstrap } = testnet
  const { service } = await setupFirstIndexer(t, bootstrap)
  await service.ready()
  await new Promise(resolve => setTimeout(resolve, 100)) // swarm flush

  const { writer: writer2 } = await setupWriter(t, bootstrap, service)
  const { writer: writer3 } = await setupWriter(t, bootstrap, service)

  console.log('writer pre disc key', service.view.discoveryKey)
  // Rotate view
  await writer2.base.append(null)
  await writer3.base.append(null)
  await service.base.append(null)
  await new Promise(resolve => setTimeout(resolve, 100)) // swarm flush
  await writer2.base.append(null)
  await writer3.base.append(null)
  await service.base.append(null)
  await new Promise(resolve => setTimeout(resolve, 100)) // swarm flush
  console.log('writer post disc key', service.view.discoveryKey)

  const viewDiscKey = service.view.discoveryKey
  service.swarm.join(viewDiscKey)
  writer2.swarm.join(viewDiscKey)
  writer3.swarm.join(viewDiscKey)
  await new Promise(resolve => setTimeout(resolve, 100)) // swarm flush

  return { writer1: service, writer2, writer3, bootstrap }
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
