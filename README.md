# HyperDB Autobase Workshop

Builds on the [HyperDB Workshop](https://github.com/holepunchto/hyperdb-workshop), adding [autobase](https://github.com/holepunchto/autobase) to make it a multi-writer service.

This workshop assumes you already have workign knowledge of autobase.

## Description

The solution of the original HyperDB workshop was ported to this repository, so we can build on it:
- ./lib/db.js contains its index.js file, with the db operations.
  - It now exposes an `extension` option, which we will set to false (autobase does not work with the hyperbee extension).
- ./build.js is a direct copy

The tests are also ported to ./test/test-db.js, so we can be sure the db logic is still valid.

## Goal

The previous service was not production-ready:
- No high availability: there is only one instance, so if it goes down, the service is down
- No (sane) backups possible. Note: do NOT use the strategy of taking backups of a corestore folder, since this can completely corrupt your hypercore

Using autobase solves both problems. For example, with 3 writer instances for the same service:
  - 1 instance can go down and you will still process requests
  - 2 instances can go down and you will still accept requests (they will be processed when at least 1 of the other instances comes back)
  - 1 instance can be irrecoverably lost (for example due to a hard disk crash), and you can use the other 2 to rotate it out and rotate in a new instance

In today's workshop, we will extend our AI-model registry of the previous workshop to use autobase.

New tooling introduced includes:
- Hyperdispatch
- protomux-rpc and protomux-rpc-client

The steps are:

1) Create an autobase service with an add-writer operation
2) Create an RPC layer, so records can be added remotely
3) Create a CLI to run the service
4) Deploy a 3-writer setup

## Demo

### 1. Create an autobase service with an add-writer operation

The autobase will have the database defined in the previous workshop as view. Note how it is opened in `_openAutobase` and closed in `_closeAutobase`.

We will use [hyperdispatch](https://github.com/holepunchto/hyperdispatch) for the autobase operations. Hyperdispatch makes it easier to define and maintain them.

Hyperdispatch uses schemas, so we will extend our build.js file.

Note: the schema will need a new definition for the `add-writer` operation, as well as a method to define the hyperdispatch schemas.

### 2. Create an RPC layer

This lets records be added remotely.

The server side uses [Protomux RPC](https://github.com/holepunchto/protomux-rpc) to define the endpoints. The client side uses [Protomux-RPC Client](https://github.com/holepunchto/protomux-rpc-client) to access them.

### 3. Run the services over a CLI

The CLI is already made for you, at bin.js. It includes 2 methods:
- run
- admin-add-writer

To start the service, open 3 terminal windows.

- Window 1: `node bin.js run`
- Window 2: `node bin.js run --storage store2 --bootstrap <autobase key>`
- Window 3: `node bin.js run --storage store3 --bootstrap <autobase key>`

End the Window-1 process, and run:
- Window 1: `node bin.js admin-add-writer <Window-2 Local key>`

Wait until Window-2 reports it has become an indexer. Then end the Window-1 process and run:
- Window 1: `node bin.js admin-add-writer <Window-3 Local key>`

Wait until Window-3 reports it has become an indexer. Then end all 3 processes, and:

- Window 1: `node bin.js run`
- Window 2: `node bin.js run --storage store2 --bootstrap <autobase key>`
- Window 3: `node bin.js run --storage store3 --bootstrap <autobase key>`

You now have a 3-writer service with a stable view key.

Use the [add-entries.js](add-entries.js) script to add a few entries, and note how it contacts a random RPC server each run.

## Assignment

After the demo, you should have sufficient knowledge to do the following on your own:

- Add the ability to remove writers
- Add aditional db operations and endpoints
