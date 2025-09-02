const test = require('brittle')
const Corestore = require('corestore')
const setupTestnet = require('hyperdht/testnet')
const Hyperswarm = require('hyperswarm')

const RegistryService = require('../solution')

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

async function setupFirstIndexer (t, bootstrap) {
  const storage = await t.tmp()
  const store = new Corestore(storage)
  const swarm = new Hyperswarm({ bootstrap })
  swarm.on('connection', conn => {
    store.replicate(conn)
  })

  const service = new RegistryService(store.namespace('registry'), swarm, {
    ackInterval: 10
  })

  t.teardown(async () => {
    await service.close()
    await swarm.destroy()
    await store.close()
  }, { order: 10000 })

  return { service, bootstrap, swarm }
}

async function getTestnet (t) {
  const testnet = await setupTestnet()
  t.teardown(async () => {
    await testnet.destroy()
  }, { order: 10000000 })

  return testnet
}
