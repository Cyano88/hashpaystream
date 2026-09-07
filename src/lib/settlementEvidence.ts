export type SettlementCheckpoint = {
  chainId: 5042002
  router: `0x${string}`
  agreementHash: `0x${string}`
  nextBlock: string
}
export type SettlementEvidence = {
  chainId: 5042002
  router: `0x${string}`
  agreementHash: `0x${string}`
  transactionHash: `0x${string}`
  blockNumber: string
  blockHash: `0x${string}`
  logIndex: number
  timestamp: number
  funderAmount: string
  providerAmount: string
  treasuryAmount: string
}
export function settlementTransactionUrl(evidence?: SettlementEvidence) {
  return evidence?.chainId === 5042002 && /^0x[0-9a-fA-F]{64}$/.test(evidence.transactionHash)
    ? `https://testnet.arcscan.app/tx/${evidence.transactionHash}` : ''
}
