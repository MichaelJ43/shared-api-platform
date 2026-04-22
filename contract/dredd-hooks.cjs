/**
 * Dredd hook file (Node). Dredd injects the runtime `Hooks` instance as `require('hooks')`.
 * Sets a CORS-allowed browser Origin, ?v=1, JSON body, and a distinct invalid body for 400.
 */
// eslint-disable-next-line import/no-extraneous-dependencies, import/no-unresolved
const hooks = require('hooks')
const { URL } = require('node:url')

const ORIGIN = process.env.DREDD_ORIGIN || 'https://michaelj43.dev'
const INGEST = JSON.stringify({
  event: {
    appId: 'dredd-contract',
    sessionId: 'dredd',
    eventType: 'pageview',
    path: '/',
    clientTimestamp: new Date().toISOString(),
  },
})

const INVALID = '{}'

hooks.beforeEach((transaction) => {
  if (!transaction.request) {
    return
  }
  if (!transaction.request.headers) {
    transaction.request.headers = {}
  }
  const name = (transaction.name || transaction.request.uri || transaction.id || '').toString()
  const isIngest = name.includes('analytics') || name.includes('events') || (transaction.request.uri || '').includes('analytics')
  if (isIngest) {
    let u
    try {
      u = new URL(transaction.request.uri, 'https://dredd.local')
    } catch {
      return
    }
    u.searchParams.set('v', '1')
    if (u.hostname === 'dredd.local') {
      transaction.request.uri = `${u.pathname}${u.search}`
    } else {
      transaction.request.uri = u.toString()
    }
    if (name.includes(' > 400 ')) {
      transaction.request.body = INVALID
    } else {
      transaction.request.body = INGEST
    }
    if (!transaction.request.headers['Content-Type'] && !transaction.request.headers['content-type']) {
      transaction.request.headers['Content-Type'] = 'application/json'
    }
  }
  transaction.request.headers.Origin = ORIGIN
})

hooks.afterEach((transaction) => {
  if (process.env.DREDD_DEBUG && transaction) {
    process.stderr.write(`Dredd after ${transaction.name || ''} status ${transaction?.real}\n`)
  }
})
