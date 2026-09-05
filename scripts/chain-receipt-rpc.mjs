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