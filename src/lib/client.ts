import * as grpc from '@grpc/grpc-js'
import { stubToType, CallType } from './call-types'
import { TypedOnData } from './type-helpers'

type InterceptorContext<Req> = {
  request: Req
  metadata: grpc.Metadata
  options: Partial<grpc.CallOptions>
}
type Interceptor<Req> = (ctx: InterceptorContext<Req>) => any

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
    // @ts-ignore
    const RequestType = rpc.requestType
    if (type === CallType.UNARY) {
      resClient[rpcName] = async (interceptor: any) => {
        let metadata
        let status
        const ctx = {
          request: new RequestType(),
          metadata: new grpc.Metadata(),
          options: {},
        }
        await interceptor(ctx)
        const response = await new Promise((resolve, reject) => {
          const call = rpc.bind(grpcClient)(
            ctx.request,
            ctx.metadata,
            ctx.options,
            (err: Error, res: any) => (err ? reject(err) : resolve(res))
          )
          metadata = new Promise(resolve => call.on('metadata', resolve))
          status = new Promise(resolve => call.on('status', resolve))
        })
        return { response, metadata: await metadata, status: await status }
      }
    }
    if (type === CallType.SERVER_STREAM) {
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
    }
  }
  return resClient as {
    [K in keyof S]: S[K] extends (
      request: infer Req,
      metadata?: grpc.Metadata,
      options?: Partial<grpc.CallOptions>
    ) => grpc.ClientReadableStream<infer Res>
      ? (
          interceptor?: Interceptor<Req>
        ) => Promise<{
          call: TypedOnData<grpc.ClientReadableStream<Res>, Res>
          metadata: Promise<grpc.Metadata>
          status: Promise<grpc.StatusObject>
        }>
      : S[K] extends (
          request: infer Req,
          metadata: grpc.Metadata,
          options: Partial<grpc.CallOptions>,
          callback: (
            error: grpc.ServiceError | null,
            response: infer Res
          ) => void
        ) => grpc.ClientUnaryCall
      ? (
          interceptor?: Interceptor<Req>
        ) => Promise<{
          response: Res
          metadata: grpc.Metadata
          status: grpc.StatusObject
        }>
      : never
  }
}
