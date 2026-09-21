import assert from 'node:assert/strict'
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import StockMarketStatus from '../src/components/StockMarketStatus.tsx'

const closed={status:'indicative',acceptanceAvailable:false,assetSymbol:'wSPYx',tokenAmount:'1000000000000000000',amountOutUsdcUnits:'770125000',observedAt:1000,expiresAt:1015,issuerOpen:false}
let renderer
await act(async()=>{renderer=TestRenderer.create(React.createElement(StockMarketStatus,{value:closed}))})
const visible=()=>renderer.root.findAllByType('p').map(node=>node.children.join(' ')).join(' ').replace(/\s+/g,' ')
assert.match(visible(),/Indicative X Layer quote/)
assert.match(visible(),/1 wSPYx currently quotes at 770.125 USDC/)
assert.match(visible(),/US stock market is closed/)
assert.match(visible(),/cannot be accepted/)
await act(async()=>renderer.update(React.createElement(StockMarketStatus,{value:{...closed,issuerOpen:true}})))
assert.match(visible(),/cannot be accepted by itself/)
await act(async()=>renderer.update(React.createElement(StockMarketStatus,{value:{status:'unavailable',acceptanceAvailable:false}})))
assert.equal(renderer.toJSON(),null)
await act(async()=>renderer.unmount())
console.log('Weekend market UX passed: indicative quote labeling, snapshot time, closed-session acceptance block and unavailable-state omission.')
