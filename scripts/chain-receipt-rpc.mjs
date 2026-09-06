export async function loadTransactionReceipt(client, hash, alternatives = []) {
  for (const provider of [client, ...alternatives]) {
    try {
      const receipt = await provider.getTransactionReceipt({ hash })
      if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error('TRANSACTION_HASH_MISMATCH')
      return receipt
    } catch (reason) {
      if (reason.message === 'TRANSACTION_HASH_MISMATCH') throw reason
    }
  }
  throw new Error('TRANSACTION_RECEIPT_UNAVAILABLE_ALL_PROVIDERS')
}
export async function firstMatchingBlock(matches, low, high) {
  if (low > high || !await matches(high)) throw new Error('HISTORICAL_POSITION_STATE_UNAVAILABLE')
  let left = low, right = high
  while (left < right) {
    const middle = (left + right) / 2n
    if (await matches(middle)) right = middle
    else left = middle + 1n
  }
  return left
}
// An empty eth_getLogs response is not a transport error, so viem's transport
// fallback does not consult another provider. Try each configured provider;
// callers still verify the selected log against its receipt and canonical block.
export async function loadExactLog(client, input, alternatives = [], onFallback = () => {}) {
  let hadEmpty = false
  for (const [index, provider] of [client, ...alternatives].entries()) {
    let logs
    try {
      try { logs = await provider.getLogs(input) }
      catch {
        logs = []
        const started = Date.now()
        for (let start = input.fromBlock; start <= input.toBlock; start += 9_999n) {
          if (Date.now() - started > 60_000) throw Error('HISTORICAL_LOG_SCAN_TIMEOUT')
          const toBlock = start + 9_998n < input.toBlock ? start + 9_998n : input.toBlock
          logs.push(...await provider.getLogs({ ...input, fromBlock: start, toBlock }))
        }
      }
    } catch { continue }
    if (logs.length === 0) { hadEmpty = true; continue }
    if (logs.length !== 1 || !logs[0].transactionHash) throw Error('CONTRACT_EVENT_AMBIGUOUS')
    if (index > 0) onFallback()
    return logs[0]
  }
  throw Error(hadEmpty ? 'CONTRACT_EVENT_MISSING' : 'CONTRACT_LOGS_UNAVAILABLE_ALL_PROVIDERS')
}
