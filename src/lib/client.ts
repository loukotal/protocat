import * as grpc from '@grpc/grpc-js'
import { stubToType, CallType } from './call-types'
import { TypedOnData } from './misc/type-helpers'

type InterceptorContext<Req> = {
  request: Req
  metadata: grpc.Metadata
  options: Partial<grpc.CallOptions>
}
type Interceptor<Req> = (ctx: InterceptorContext<Req>) => any
type ServerStreamCall<Req, Res> = (
  interceptor?: Interceptor<Req>
) => Promise<{
  call: TypedOnData<grpc.ClientReadableStream<Res>, Res>
  metadata: Promise<grpc.Metadata>
  status: Promise<grpc.StatusObject>
}>
type ClientStreamCall<Req, Res> = (
  interceptor?: Interceptor<Req>
) => Promise<{
  response: Promise<Res>
  call: grpc.ClientWritableStream<Req>
  metadata: Promise<grpc.Metadata>
  status: Promise<grpc.StatusObject>
}>
type UnaryCall<Req, Res> = (
  interceptor?: Interceptor<Req>
) => Promise<{
  response: Res
  call: grpc.ClientUnaryCall
  metadata: grpc.Metadata
  status: grpc.StatusObject
}>
export const createClient = <S extends grpc.Client>(
  Client: new (...args: any[]) => S,
  address: string
) => {
  const grpcClient = new Client(
    address,
    grpc.ChannelCredentials.createInsecure()
  )
  const resClient: any = {}
  for (const rpcName in grpcClient) {
    const rpc: any = grpcClient[rpcName]
    const type = stubToType(rpc)
    const RequestType = rpc.requestType
    if (type === CallType.Unary) {
      resClient[rpcName] = async (interceptor: any) => {
        let metadata
        let status
        let call: any
        const ctx = {
          request: new RequestType(),
          metadata: new grpc.Metadata(),
          options: {},
        }
        await interceptor(ctx)
        const response = await new Promise((resolve, reject) => {
          call = rpc.bind(grpcClient)(
            ctx.request,
            ctx.metadata,
            ctx.options,
            (err: Error, res: any) => (err ? reject(err) : resolve(res))
          )
          metadata = new Promise(resolve => call.on('metadata', resolve))
          status = new Promise(resolve => call.on('status', resolve))
        })
        return { call, response, metadata: await metadata, status: await status }
      }
    } else if (type === CallType.ServerStream) {
      resClient[rpcName] = async (interceptor: any) => {
        const ctx = {
          request: new RequestType(),
          metadata: new grpc.Metadata(),
          options: {},
        }
        await interceptor(ctx)
        const call = rpc.bind(grpcClient)(
          ctx.request,
          ctx.metadata,
          ctx.options
        )
        const metadata = new Promise(resolve => call.on('metadata', resolve))
        const status = new Promise(resolve => call.on('status', resolve))
        return { call, metadata, status }
      }
    } else if (type === CallType.ClientStream) {
      let metadata
      let status
      let call
      resClient[rpcName] = async (interceptor: any) => {
        const ctx = {
          metadata: new grpc.Metadata(),
          options: {},
        }
        await interceptor(ctx)
        // const call = rpc.bind(grpcClient)(
        //   ctx.metadata,
        //   ctx.options
        // )
        // const metadata = new Promise(resolve => call.on('metadata', resolve))
        // const status = new Promise(resolve => call.on('status', resolve))
        const response = await new Promise((resolve, reject) => {
          call = rpc.bind(grpcClient)(
            ctx.metadata,
            ctx.options,
            (err: Error, res: any) => (err ? reject(err) : resolve(res))
          )
          metadata = new Promise(resolve => call.on('metadata', resolve))
          status = new Promise(resolve => call.on('status', resolve))
        })
        return { call, response, metadata, status }
      }
    }
  }
  return resClient as {
    [K in keyof S]: S[K] extends (
      request: infer Req,
      metadata?: grpc.Metadata,
      options?: Partial<grpc.CallOptions>
    ) => grpc.ClientReadableStream<infer Res>
      ? ServerStreamCall<Req, Res>
      : S[K] extends (
          request: infer Req,
          metadata: grpc.Metadata,
          options: Partial<grpc.CallOptions>,
          callback: (
            error: grpc.ServiceError | null,
            response: infer Res
          ) => void
        ) => grpc.ClientUnaryCall
      ? UnaryCall<Req, Res>
      : S[K] extends (
          metadata: grpc.Metadata,
          options: Partial<grpc.CallOptions>,
          callback: (
            error: grpc.ServiceError | null,
            response: infer Res
          ) => void
        ) => grpc.ClientWritableStream<infer Req>
      ? ClientStreamCall<Req, Res>
      : never
  }
}
