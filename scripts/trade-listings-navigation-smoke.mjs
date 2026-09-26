import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import * as icons from '@heroicons/react/24/outline';
import * as preview from '../src/lib/tradePreview.ts';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync('src/components/StreamPayTrade.tsx','utf8').replace(/^import[\s\S]*?from\s+["'][^"']+["'];\s*/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
let search='?view=my-listings';
const item={...preview.sampleTradeListings[0],id:'owned-item',title:'Owned item',status:'active',photos:[]};
const draft={...item,id:'draft-item',title:'Saved draft'};
const token=async()=> 'synthetic-test-token';
const context={exports:{},React,...React,...icons,...preview,URL,URLSearchParams,crypto:webcrypto,
 window:{location:{origin:'https://hashpaystream.app'},setTimeout,clearTimeout},
 document:{addEventListener(){},removeEventListener(){}},
 usePrivy:()=>({ready:true,authenticated:true,user:{id:'test-owner'},login(){},getAccessToken:token}),
 useLocation:()=>({search}),useNavigate:()=>url=>{search=new URL(url,'https://hashpaystream.app').search;},useStreamPayPath:path=>path,
 useStreamConfirm:()=>({confirmation:null,confirm:async()=>false}),
 cachedTradePage:()=>({enabled:true,listings:[item]}),publicTradePage:async()=>({enabled:true,listings:[item]}),
 tradeRequest:async()=>({listings:[item]}),readTradePocket:async()=>({saved:[],drafts:[draft]}),
 Link:({children,to,...props})=>React.createElement('a',{...props,href:to},children),
 StreamSelect:()=>null,StreamPayTradeEnquiries:()=>React.createElement('div',null,'Enquiries'),TradeItemActions:()=>null,
};
vm.runInNewContext(compiled,context);
const drain=async()=>{for(let i=0;i<5;i++) await new Promise(r=>setImmediate(r));};
let renderer;const render=async()=>act(async()=>{const element=React.createElement(context.exports.default);if(renderer)renderer.update(element);else renderer=TestRenderer.create(element);await drain();});
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');
const button=label=>renderer.root.findAllByType('button').find(node=>text(node)===label);
const click=async label=>{const target=button(label);assert.ok(target,label);await act(async()=>target.props.onClick());await render();};
await render();
assert.equal(renderer.root.findAllByType('summary').length,0,'My listings is a folder list');
await click('ListingsPublished and sold items1');
assert.equal(search,'?view=my-listings&section=listings');
assert.ok(button('Edit'));assert.ok(button('Mark as sold'));assert.ok(button('Remove'));
assert.equal(renderer.root.findAllByProps({'aria-label':'Manage draft Saved draft'}).length,0);
await click('My listings');await click('DraftsContinue a saved listing1');
assert.equal(search,'?view=my-listings&section=drafts');assert.ok(button('Edit draft'));assert.ok(button('Delete draft'));assert.equal(button('Mark as sold'),undefined);
search='?view=my-listings&section=listings';await render();assert.ok(button('Mark as sold'),'restoring the URL restores the folder');
search='?view=my-listings&section=unknown';await render();assert.equal(renderer.root.findAllByType('summary').length,0,'unknown folders return to the index');
for(const view of ['browse','sell','saved','enquiries','my-listings']){search='?view='+view;await render();assert.equal(renderer.root.findAllByProps({'aria-label':'Trade sections'}).length,1);assert.equal(renderer.root.findAllByProps({className:'stream-trade-navigation space-y-4'}).length,1);}
await act(async()=>renderer.unmount());
console.log('Trade navigation passed: folder isolation, URL/back restoration, invalid sections, labeled actions and a shared header across all tabs.');
