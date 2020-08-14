import { createClient } from '../lib/client'
import { GreetingClient } from '../../dist/test/api/v1/hello_grpc_pb'

const ADDR = '0.0.0.0:3000'
describe('Client', () => {
  const client = createClient(GreetingClient, ADDR)
  test('', jest.fn())
})
