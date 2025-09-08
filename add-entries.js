const ProtomuxRpcClient = require('protomux-rpc-client')
const Client = require('./client')
const IdEnc = require('hypercore-id-encoding')
const HyperDHT = require('hyperdht')
const b4a = require('b4a')

async function main () {
  const rpcKeys = [
    // 'rq4uuk9juws3gigjec7agitdsg1o9b7aj7bhcokod6qythcjgpay',
    // 'pe1ngmbo4fddhbb6r53qpijrz6w45iqozwfeguy6fybs37x5afco',
    // 'd9e6akzso16ncgo6ex5m318xemhj6t86fpjids17a7t1dihi8eao'
  ].map(IdEnc.decode)

  const rpcKey = rpcKeys[Math.floor(Math.random() * rpcKeys.length)]

  const dht = new HyperDHT()
  const rpcClient = new ProtomuxRpcClient(dht)
  const client = new Client(rpcKey, rpcClient)

  console.log(`Adding entry through RPC server at ${IdEnc.normalize(rpcKey)}`)
  await client.putEntry({
    name: 'e4',
    driveKey: b4a.from('a'.repeat(64), 'hex'),
    type: 'type1',
    owner: 'someone',
    description: 'a model'
  })

  console.log('Successfully added entry')

  await rpcClient.close()
  await dht.destroy()
}

main()
