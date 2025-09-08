const ProtomuxRpcClient = require('protomux-rpc-client')
const Client = require('./client')
const IdEnc = require('hypercore-id-encoding')
const HyperDHT = require('hyperdht')
const b4a = require('b4a')

async function main () {
  const rpcKeys = [
    // '1wi8s17kquj51jqxw9p148xnk564u9modyfhexu8m15oc3x7ceiy',
    // '7tqc7i69mitjghbh81r1tkc3g9zhkmwepw4i1xa78etyzpttzy7o',
    // 'i3qhxbq196jkmysngz3usk8ngjd5d6q4hphtif8665sygmqkwc5y'
  ].map(IdEnc.decode)

  const dht = new HyperDHT()
  const rpcClient = new ProtomuxRpcClient(dht)
  const client = new Client(rpcKeys[0], rpcClient)

  await client.putEntry({
    name: 'e2',
    driveKey: b4a.from('a'.repeat(64), 'hex'),
    type: 'type1',
    owner: 'someone',
    description: 'a model'
  })

  await rpcClient.close()
  await dht.destroy()
}

main()
