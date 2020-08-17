import { ProtoCat } from '../..'
import {
  GreetingService,
  GreetingClient,
} from '../../../dist/test/api/v1/hello_grpc_pb'
import {
  ServerCredentials,
  ChannelCredentials,
  Metadata,
  StatusObject,
} from '@grpc/grpc-js'
import { Hello } from '../../../dist/test/api/v1/hello_pb'
import { performance } from 'perf_hooks'
import { createClient } from '../../lib/client'

const ADDR = '0.0.0.0:3000'
describe('HelloService (boring, predictable and exhaustive)', () => {
  let app: ProtoCat
  test('createServer', () => {
    app = new ProtoCat()
  })
  test('use', () => {
    app.use(async (call, next) => {
      const start = performance.now()
      await next()
      const ms = performance.now() - start
      call.initialMetadata.set('response-time', ms.toString())
    })
  })
  test('addService', () => {
    app.addService(GreetingService, {
      unary: [
        call => {
          call.initialMetadata.set('type', 'initialUnary')
          call.initialMetadata.set('client', call.metadata.getMap().client)
          call.trailingMetadata.set('type', 'trailingUnary')
        },
        call => {
          call.response.setName(call.request?.getName() ?? '')
        },
      ],
      serverStream: call => {
        call.initialMetadata.set('type', 'initialServerStream')
        call.initialMetadata.set('client', call.metadata.getMap().client)
        call.trailingMetadata.set('type', 'trailingServerStream')
        call.flushInitialMetadata()
        for (let i = 0; i < 5; i++) {
          call.write(new Hello().setName('World'))
        }
        call.end()
      },
      clientStream: async call => {
        call.initialMetadata.set('type', 'initialClientStream')
        call.initialMetadata.set('client', call.metadata.getMap().client)
        call.trailingMetadata.set('type', 'trailingClientStream')
        let acc = ''
        call.on('data', req => {
          acc += req.getName()
        })
        await new Promise(resolve =>
          call.on('end', () => {
            call.response = new Hello().setName(acc)
            resolve()
          })
        )
      },
      bidi: call => {
        call.initialMetadata.set('type', 'initialBidi')
        call.initialMetadata.set('client', call.metadata.getMap().client)
        call.trailingMetadata.set('type', 'trailingBidi')
        call.flushInitialMetadata()
        call.on('data', req => {
          call.write(new Hello().setName(req.getName().toUpperCase()))
        })
        call.on('end', () => {
          call.end()
        })
      },
    })
  })
  test('start', async () => {
    await app.start(ADDR, ServerCredentials.createInsecure())
  })
  const responseTimeSet = (m: Metadata) =>
    expect(Number(m.getMap()['response-time'])).toBeGreaterThan(0)

  describe('Unary', () => {
    const client = new GreetingClient(ADDR, ChannelCredentials.createInsecure())
    let metadata: Promise<Metadata> = null as any
    let status: Promise<StatusObject> = null as any
    const clientMeta = new Metadata()
    clientMeta.set('client', 'unaryClientMeta')
    test('Reqest & response', async () => {
      const hello = await new Promise<Hello>((resolve, reject) => {
        const call = client.unary(
          new Hello().setName('X'),
          clientMeta,
          (err, res) => (err ? reject(err) : resolve(res))
        )
        metadata = new Promise(resolve => call.on('metadata', resolve))
        status = new Promise(resolve => call.on('status', resolve))
      })
      expect(hello.getName()).toBe('X')
    })
    test('Initial metadata', async () => {
      expect((await metadata).getMap().type).toEqual('initialUnary')
    })
    test('Middleware ran', async () => {
      responseTimeSet(await metadata)
    })
    test('Client metadata', async () => {
      expect((await metadata).getMap().client).toEqual('unaryClientMeta')
    })
    test('Trailing metadata', async () => {
      expect((await status).metadata.getMap().type).toEqual('trailingUnary')
    })
  })
  describe('Unary: Custom client', () => {
    const client = createClient(GreetingClient, ADDR)
    test('Reqest & response', async () => {
      const { response, metadata, status } = await client.unary(ctx => {
        ctx.request.setName('X')
        ctx.metadata.set('client', 'unaryClientMeta')
      })
      expect(response.getName()).toBe('X')
      // Initial metadata
      expect(metadata.getMap().type).toEqual('initialUnary')
      // Middleware ran
      responseTimeSet(metadata)
      // Client metadata
      expect(metadata.getMap().client).toEqual('unaryClientMeta')
      // Trailing metadata
      expect(status.metadata.getMap().type).toEqual('trailingUnary')
    })
  })
  describe('ServerStream', () => {
    const client = new GreetingClient(ADDR, ChannelCredentials.createInsecure())
    let metadata: Promise<Metadata> = null as any
    let status: Promise<StatusObject> = null as any
    const clientMeta = new Metadata()
    clientMeta.set('client', 'serverStreamClientMeta')
    test('Response stream', async () => {
      let acc = ''
      await new Promise<Hello>((resolve, reject) => {
        const call = client.serverStream(new Hello(), clientMeta)
        metadata = new Promise(resolve => call.on('metadata', resolve))
        status = new Promise(resolve => call.on('status', resolve))
        call.on('data', (hello: Hello) => {
          acc = `${acc}${hello.getName()}`
        })
        call.on('end', () => resolve())
        call.on('error', (e: any) => (e.code === 1 ? resolve() : reject(e)))
      })
      expect(acc).toMatchInlineSnapshot('"WorldWorldWorldWorldWorld"')
    })
    test('Initial metadata', async () => {
      expect((await metadata).getMap().type).toEqual('initialServerStream')
    })
    test('Middleware ran', async () => {
      responseTimeSet(await metadata)
    })
    test('Client metadata', async () => {
      expect((await metadata).getMap().client).toEqual('serverStreamClientMeta')
    })
    test('Trailing metadata', async () => {
      expect((await status).metadata.getMap().type).toEqual(
        'trailingServerStream'
      )
    })
  })
  describe('ServerStream: Custom client', () => {
    const client = createClient(GreetingClient, ADDR)
    test('Response stream', async () => {
      let acc = ''
      const { call, metadata, status } = await client.serverStream(ctx =>
        ctx.metadata.set('client', 'serverStreamClientMeta')
      )
      call.on('data', hello => {
        acc = `${acc}${hello.getName()}`
      })
      await new Promise(resolve => call.on('end', resolve))
      expect(acc).toMatchInlineSnapshot('"WorldWorldWorldWorldWorld"')
      // Initial metadata
      expect((await metadata).getMap().type).toEqual('initialServerStream')
      // Middleware ran
      responseTimeSet(await metadata)
      // Client metadata
      expect((await metadata).getMap().client).toEqual('serverStreamClientMeta')
      // Trailing metadata
      expect((await status).metadata.getMap().type).toEqual(
        'trailingServerStream'
      )
    })
  })
  describe('ClientStream', () => {
    const client = new GreetingClient(ADDR, ChannelCredentials.createInsecure())
    let metadata: Promise<Metadata> = null as any
    let status: Promise<StatusObject> = null as any
    const clientMeta = new Metadata()
    clientMeta.set('client', 'clientStreamClientMeta')
    test('Client stream', async () => {
      const res = await new Promise<Hello>((resolve, reject) => {
        const call = client.clientStream(clientMeta, (err, res) =>
          err ? reject(err) : resolve(res)
        )
        metadata = new Promise(resolve => call.on('metadata', resolve))
        status = new Promise(resolve => call.on('status', resolve))
        for (let i = 0; i < 10; ++i) {
          call.write(new Hello().setName(String(i)))
        }
        call.end()
      })
      expect(res.getName()).toMatchInlineSnapshot('"0123456789"')
    })
    test('Initial metadata', async () => {
      expect((await metadata).getMap().type).toEqual('initialClientStream')
    })
    test('Middleware ran', async () => {
      responseTimeSet(await metadata)
    })
    test('Client metadata', async () => {
      expect((await metadata).getMap().client).toEqual('clientStreamClientMeta')
    })
    test('Trailing metadata', async () => {
      expect((await status).metadata.getMap().type).toEqual(
        'trailingClientStream'
      )
    })
  })
  describe('Bidi', () => {
    const client = new GreetingClient(ADDR, ChannelCredentials.createInsecure())
    let metadata: Promise<Metadata> = null as any
    let status: Promise<StatusObject> = null as any
    const clientMeta = new Metadata()
    clientMeta.set('client', 'bidiClientMeta')
    test('Bidi stream', async () => {
      await new Promise<Hello>((resolve, reject) => {
        const call = client.bidi(clientMeta)
        let cnt = 0
        call.write(new Hello().setName('foo'))
        metadata = new Promise(resolve => call.on('metadata', resolve))
        status = new Promise(resolve => call.on('status', resolve))
        call.on('end', resolve)
        call.on('data', res => {
          if (cnt++ < 3) {
            call.write(new Hello().setName('foo'))
          } else {
            call.end()
          }
        })
      })
    })
    test('Initial metadata', async () => {
      expect((await metadata).getMap().type).toEqual('initialBidi')
    })
    test('Middleware ran', async () => {
      responseTimeSet(await metadata)
    })
    test('Client metadata', async () => {
      expect((await metadata).getMap().client).toEqual('bidiClientMeta')
    })
    test('Trailing metadata', async () => {
      expect((await status).metadata.getMap().type).toEqual('trailingBidi')
    })
  })
  test('stop', async () => {
    await app.stop()
  })
})
