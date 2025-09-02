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

We will then simulate all of the above scenarios, to illustrate concretely how autobase solves them.

In the process, you will get to know the patterns we use to create autobase+hyperdb services.
