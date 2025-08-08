import { http, createConfig } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'
import { defineChain } from 'viem'

export const somniaTestnet = defineChain({
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'SOM',
    symbol: 'SOM',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.somnia.network/'],
    },
  },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.testnet.somnia.network' },
  },
  testnet: true,
})

export const config = createConfig({
  chains: [somniaTestnet, mainnet, sepolia],
  transports: {
    [somniaTestnet.id]: http(),
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
})