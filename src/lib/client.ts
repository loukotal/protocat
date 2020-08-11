import * as grpc from '@grpc/grpc-js'

export const createClient = <T extends grpc.Client>(client: T) => {
  return (null as any) as {
    [K in keyof T]: T[K] extends (
      request: infer Req,
      metadata?: grpc.Metadata,
      options?: Partial<grpc.CallOptions>
    ) => grpc.ClientReadableStream<infer Res>
      ? [Req, Res, 'ss']
      : T[K] extends (
          request: infer Req,
          metadata: grpc.Metadata,
          options: Partial<grpc.CallOptions>,
          callback: (
            error: grpc.ServiceError | null,
            response: infer Res
          ) => void
        ) => grpc.ClientUnaryCall
      ? [Req, Res, 'u']
      : never
  }
}
