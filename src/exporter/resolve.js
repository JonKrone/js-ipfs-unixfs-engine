'use strict'

const UnixFS = require('ipfs-unixfs')
const pull = require('pull-stream')
const paramap = require('pull-paramap')
const CID = require('cids')

const resolvers = {
  directory: require('./dir-flat'),
  'hamt-sharded-directory': require('./dir-hamt-sharded'),
  file: require('./file'),
  object: require('./object')
}

module.exports = Object.assign({
  createResolver: createResolver,
  typeOf: typeOf
}, resolvers)

function createResolver (dag, options, depth, parent) {
  if (!depth) {
    depth = 0
  }

  if (depth > options.maxDepth) {
    return pull.map(identity)
  }

  return pull(
    paramap((item, cb) => {
      if ((typeof item.depth) !== 'number') {
        return pull.error(new Error('no depth'))
      }
      if (item.object) {
        return cb(null, resolveItem(item.object, item))
      }
      dag.get(new CID(item.multihash), (err, node) => {
        if (err) {
          return cb(err)
        }
        // const name = item.fromPathRest ? item.name : item.path
        cb(null, resolveItem(node.value, item))
      })
    }),
    pull.flatten(),
    pull.filter(Boolean),
    pull.filter((node) => node.depth <= options.maxDepth)
  )

  function resolveItem (node, item) {
    return resolve(node, item.name, item.path, item.pathRest, item.size, dag, item.parent || parent, item.depth)
  }

  function resolve (node, name, path, pathRest, size, dag, parentNode, depth) {
    const type = typeOf(node)
    const nodeResolver = resolvers[type]
    if (!nodeResolver) {
      return pull.error(new Error('Unkown node type ' + type))
    }
    const resolveDeep = createResolver(dag, options, depth, node)
    return nodeResolver(node, name, path, pathRest, resolveDeep, size, dag, parentNode, depth)
  }
}

function typeOf (node) {
  if (Buffer.isBuffer(node.data)) {
    return UnixFS.unmarshal(node.data).type
  } else {
    return 'object'
  }
}

function identity (o) {
  return o
}
