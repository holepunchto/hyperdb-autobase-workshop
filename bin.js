const path = require('path')
const Corestore = require('corestore')
const IdEnc = require('hypercore-id-encoding')
const Hyperswarm = require('hyperswarm')
const goodbye = require('graceful-goodbye')
const { command, flag, arg } = require('paparam')
const pino = require('pino')

const Registry = require('.')

const DEFAULT_STORAGE = 'hyperdb-autobase-workshop-corestore'
const NAMESPACE = 'registry'

const runCmd = command('run',
  flag('--storage|-s [path]', `storage path, defaults to ${DEFAULT_STORAGE}`),
  flag('--bootstrap|-b [bootstrap]', 'Bootstrap key, to join an existing autobase'),
  async function ({ flags }) {
    const storage = path.resolve(flags.storage || DEFAULT_STORAGE)
    const autobaseBootstrap = flags.bootstrap ? IdEnc.decode(flags.bootstrap) : null
    const logger = pino({
      transport: {
        target: 'pino-pretty'
      }
    })

    const store = new Corestore(storage)
    await store.ready()

    const swarm = new Hyperswarm({
      keyPair: await store.createKeyPair('public-key') // same keypair across restarts
    })
    swarm.on('connection', (conn, peerInfo) => {
      store.replicate(conn)
      const key = IdEnc.normalize(peerInfo.publicKey)
      logger.info(`Opened connection to ${key}`)
      conn.on('close', () => logger.info(`Closed connection to ${key}`))
    })

    if (autobaseBootstrap) logger.info(`using bootstrap ${IdEnc.normalize(autobaseBootstrap)}`)
    const service = new Registry(
      store.namespace(NAMESPACE), swarm, { autobaseBootstrap, ackInterval: 10 }
    )

    logger.info('Starting registry service...')
    logger.info(`Using storage: ${storage}`)
    await service.ready()

    // So other peers can look up entries
    swarm.join(service.view.discoveryKey)

    if (service.base.isIndexer) {
      logger.info('I am an indexer in the autobase.')
    } else {
      logger.warn('I am not yet an indexer in the autobase. Add my local key as a writer.')
      service.base.once('is-indexer', () => {
        logger.info('I have become an indexer to the autobase')
      })
    }
    logger.info(`Local key: ${IdEnc.normalize(service.base.local.key)}`)
    logger.info(`Autobase key: ${IdEnc.normalize(service.base.key)}`)
    logger.info(`Database view key: ${IdEnc.normalize(service.view.publicKey)}`)
    logger.info(`RPC server public key: ${IdEnc.normalize(service.serverPublicKey)}`)
  }
)

const adminAddWriter = command('admin-add-writer',
  arg('<key>', 'key of the writer to add'),
  flag('--storage|-s [path]', `storage path, defaults to ${DEFAULT_STORAGE}`),
  async function ({ flags, args }) {
    const storage = path.resolve(flags.storage || DEFAULT_STORAGE)
    const key = IdEnc.decode(args.key)
    const logger = pino({
      transport: {
        target: 'pino-pretty'
      }
    })

    const store = new Corestore(storage)
    await store.ready()

    const swarm = new Hyperswarm()
    swarm.on('connection', (conn, peerInfo) => {
      store.replicate(conn)
      const key = IdEnc.normalize(peerInfo.publicKey)
      logger.info(`Opened connection to ${key}`)
      conn.on('close', () => logger.info(`Closed connection to ${key}`))
    })

    const service = new Registry(
      store.namespace(NAMESPACE), swarm, { ackInterval: 10 }
    )

    goodbye(async () => {
      logger.info('Shutting down')
      await swarm.destroy()
      await service.close()
    })

    logger.info(`Using storage: ${storage}`)
    await service.ready()

    logger.info(`Autobase key: ${IdEnc.normalize(service.base.key)}`)
    logger.info(`Name-service database key: ${IdEnc.normalize(service.view.publicKey)}`)

    logger.info(`Adding writer ${IdEnc.normalize(key)}`)
    await service.addWriter(key)

    logger.info('Successfully added the new writer. Wait for them to sync, then ctrl-c')
  }
)

const cmd = command('registry', runCmd, adminAddWriter)
cmd.parse()
