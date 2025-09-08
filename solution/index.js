const Autobase = require('autobase')
const ReadyResource = require('ready-resource')
const IdEnc = require('hypercore-id-encoding')
const ProtomuxRPC = require('protomux-rpc')
const cenc = require('compact-encoding')

const Db = require('./lib/db')
const { Router, encode: dispatch } = require('./spec/hyperdispatch')
const { resolveStruct } = require('./spec/hyperschema')
const EntryEnc = resolveStruct('@registry/entry')

class RegistryService extends ReadyResource {
  constructor (store, swarm, { ackInterval, autobaseBootstrap = null } = {}) {
    super()

    this.store = store
    this.swarm = swarm

    this.applyRouter = new Router()
    this.applyRouter.add(
      '@registry/add-writer',
      async (data, context) => {
        await context.base.addWriter(data.key, { indexer: true })
      }
    )
    this.applyRouter.add(
      '@registry/put-entry',
      async (entry, context) => {
        await context.view.put(entry)
      }
    )

    this.base = new Autobase(this.store, autobaseBootstrap, {
      open: this._openAutobase.bind(this),
      apply: this._apply.bind(this),
      close: this._closeAutobase.bind(this),
      ackInterval
    })
  }

  get view () {
    return this.base.view
  }

  get serverPublicKey () {
    return this.swarm.keyPair.publicKey
  }

  async _open () {
    await this.store.ready()
    await this.base.ready()
    await this.view.ready()

    this.swarm.on('connection', conn => {
      this._setupRpc(conn)
    })
    // To connect to other indexers
    this.swarm.join(this.base.discoveryKey, { server: true, client: true })

    if (this.base.isIndexer) {
      // Hack to ensure our db key does not update after the first
      // entry is added (since we update the autobase ourselves)
      if (!this.view.db.core.length) await this.base.append(null)
    }

    // TODO: also set this download if the view rotates (consider also joining the swarm there)
    // Ensure each writer has the full view
    this.view.db.core.download({ start: 0, end: -1 })
  }

  async _close () {
    this.swarm.leave(this.base.discoveryKey)
    await this.base.close()
  }

  _setupRpc (conn) {
    const rpc = new ProtomuxRPC(conn, {
      id: this.swarm.keyPair.publicKey,
      valueEncoding: cenc.none
    })
    rpc.respond(
      'put-entry',
      { requestEncoding: EntryEnc, responseEncoding: cenc.none },
      async (entry) => {
        if (!this.opened) await this.ready()
        await this.putEntry(entry)
      }
    )
  }

  _openAutobase (store) {
    const dbCore = store.get('db-view')
    return new Db(dbCore, { extension: false })
  }

  async _closeAutobase (view) {
    await view.close()
  }

  // Must not be called directly, only from the autobase apply
  async _apply (nodes, view, base) {
    if (!view.opened) await view.ready()

    for (const node of nodes) {
      await this.applyRouter.dispatch(node.value, { view, base })
    }
  }

  async addWriter (key) {
    key = IdEnc.decode(key) // so we can pass in buffer, hex and z32 keys
    if (!this.opened) await this.ready()

    await this.base.append(
      dispatch('@registry/add-writer', { key })
    )
  }

  async putEntry (entry) {
    await this.base.append(
      dispatch('@registry/put-entry', entry)
    )
  }
}

module.exports = RegistryService
