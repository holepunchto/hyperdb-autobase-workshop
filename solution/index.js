const Autobase = require('autobase')
const ReadyResource = require('ready-resource')
const IdEnc = require('hypercore-id-encoding')

const { Router, encode: dispatch } = require('./spec/hyperdispatch')
const Db = require('./lib/db')

class RegistryService extends ReadyResource {
  constructor (store, swarm, { ackInterval, bootstrap } = {}) {
    super()

    this.store = store
    this.swarm = swarm

    this.applyRouter = new Router()
    this.applyRouter.add(
      '@registry/add-writer',
      async (data, context) => {
        await context.base.addWriter(data.key)
      }
    )

    this.base = new Autobase(this.store, bootstrap, {
      open: this._openAutobase.bind(this),
      apply: this._apply.bind(this),
      close: this._closeAutobase.bind(this),
      ackInterval
    })
  }

  get view () {
    return this.base.view
  }

  async _open () {
    await this.store.ready()
    await this.base.ready()
    await this.view.ready()

    // To connect to other indexers
    this.swarm.join(this.base.discoveryKey, { server: true, client: true })
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
}

module.exports = RegistryService
