const Autobase = require('autobase')
const ReadyResource = require('ready-resource')

const Db = require('./lib/db')

class RegistryService extends ReadyResource {
  constructor (store, swarm, { ackInterval, autobaseBootstrap = null } = {}) {
    super()

    this.store = store
    this.swarm = swarm

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

    // To connect to other indexers
    this.swarm.join(this.base.discoveryKey, { server: true, client: true })

    if (this.base.isIndexer) {
      // Hack to ensure our db key does not update after the first
      // entry is added (since we update the autobase ourselves)
      if (!this.view.db.core.length) await this.base.append(null)
    }

    // Ensure each writer has the full view
    // Note: assumes the view does not rotate
    this.view.db.core.download({ start: 0, end: -1 })
  }

  async _close () {
    this.swarm.leave(this.base.discoveryKey)
    await this.base.close()
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
      console.log(node)
      // TODO: process operations
    }
  }
}

module.exports = RegistryService
