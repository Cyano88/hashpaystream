export type TradeCategory = 'Clothing' | 'Shoes' | 'Bags' | 'Home'
export type TradeListing = {
  id: string; title: string; price: string; currency: 'NGN' | 'USD' | 'USDC'; city: string
  category: TradeCategory; condition: string; size: string; description: string
  delivery: 'Pickup' | 'Delivery' | 'Either'; photos: string[]; createdAt: number
}
export type TradePocket = { saved: string[]; drafts: TradeListing[] }
export const tradeCategories: TradeCategory[] = ['Clothing', 'Shoes', 'Bags', 'Home']
export const sampleTradeListings: TradeListing[] = [
  {id:'sample-linen',title:'Relaxed linen shirt',price:'12500',city:'Lagos',category:'Clothing',size:'M',condition:'Like new',description:'Sample listing. A lightweight linen shirt with a relaxed fit. Chest: 104 cm. Length: 72 cm.',delivery:'Either'},
  {id:'sample-tote',title:'Everyday canvas tote',price:'8000',city:'Abuja',category:'Bags',size:'One size',condition:'Good',description:'Sample listing. A roomy canvas bag. Light wear on the handles; no tears. 38 x 34 cm.',delivery:'Delivery'},
  {id:'sample-trainers',title:'Low-top trainers',price:'18000',city:'Lagos',category:'Shoes',size:'EU 40',condition:'Good',description:'Sample listing. Low-top trainers with light marks on the soles. Insole: 25.5 cm.',delivery:'Pickup'},
  {id:'sample-jacket',title:'The weekend jacket',price:'24000',city:'Ibadan',category:'Clothing',size:'L',condition:'Like new',description:'Sample listing. A casual jacket with roomy pockets. Chest: 116 cm. Length: 68 cm.',delivery:'Either'},
  {id:'sample-lamp',title:'A little reading light',price:'15000',city:'Abuja',category:'Home',size:'32 cm tall',condition:'Good',description:'Sample listing. A compact reading lamp. Small mark on the base; working switch.',delivery:'Pickup'},
  {id:'sample-dress',title:'Easy Sunday dress',price:'16000',city:'Lagos',category:'Clothing',size:'S',condition:'Like new',description:'Sample listing. A soft everyday dress. Bust: 86 cm. Waist: 70 cm. Length: 110 cm.',delivery:'Either'},
].map(item => ({...item, currency:'NGN',photos:[],createdAt:0})) as TradeListing[]

export function filterTradeListings(items: TradeListing[], query: string, category: string, city: string) {
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(item => (category === 'All' || item.category === category)
    && (!city.trim() || item.city.toLowerCase().includes(city.trim().toLowerCase()))
    && terms.every(term => [item.title,item.category,item.size,item.condition,item.city].join(' ').toLowerCase().includes(term)))
}
export function validateTradeDraft(item: TradeListing) {
  if (item.title.trim().length < 4 || item.title.length > 80) return 'Use a title between 4 and 80 characters.'
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(item.price) || Number(item.price) <= 0) return 'Enter a price greater than zero, with up to two decimal places.'
  if (!['NGN','USD','USDC'].includes(item.currency)) return 'Choose a supported currency.'
  if (!['Like new','Good','Fair'].includes(item.condition) || !['Pickup','Delivery','Either'].includes(item.delivery)) return 'Choose a condition and handover option.'
  if (!tradeCategories.includes(item.category)) return 'Choose a category.'
  if (item.city.trim().length < 2 || item.city.length > 80) return 'Enter a city or area.'
  if (item.description.trim().length < 20 || item.description.length > 1500) return 'Describe the condition and any defects in at least 20 characters.'
  if (!item.photos.length) return 'Add at least one photo of your item.'
  if (item.photos.length > 4 || item.photos.some(p => !p.startsWith('data:image/jpeg;base64,') || p.length > 2_000_000)) return 'Use up to four supported photos.'
  return ''
}
export function tradePrice(item: TradeListing) {
  return item.currency === 'USDC' ? `${Number(item.price).toLocaleString('en-US')} USDC` : new Intl.NumberFormat('en-NG',{style:'currency',currency:item.currency,maximumFractionDigits:2}).format(Number(item.price))
}
async function database() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request=indexedDB.open('hashpaystream-trade-preview',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('pockets')
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(new Error('Device storage is unavailable. Please try again.'))
    request.onblocked=()=>reject(new Error('Close other app tabs and try again.'))
  })
}
export async function readTradePocket(owner: string): Promise<TradePocket> {
  const db=await database()
  try { return await new Promise((resolve,reject) => {
    const tx=db.transaction('pockets','readonly'),request=tx.objectStore('pockets').get(owner)
    tx.oncomplete=()=>resolve(request.result ?? {saved:[],drafts:[]})
    tx.onerror=()=>reject(new Error('Your saved items could not be loaded.'))
    tx.onabort=()=>reject(new Error('Your saved items could not be loaded.'))
  }) } finally { db.close() }
}
export async function writeTradePocket(owner: string, pocket: TradePocket) {
  if (!owner) throw new Error('Sign in to save your items.')
  const db=await database()
  try { await new Promise<void>((resolve,reject) => {
    const tx=db.transaction('pockets','readwrite');tx.objectStore('pockets').put(pocket,owner)
    tx.oncomplete=()=>resolve()
    tx.onerror=()=>reject(new Error('Not enough device storage. Remove an old draft or try fewer photos.'))
    tx.onabort=()=>reject(new Error('Changes were not saved. Please try again.'))
  }) } finally { db.close() }
}
export async function tradePhoto(file: File) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10_000_000) throw new Error('Choose a JPG, PNG or WebP photo under 10 MB.')
  const url=URL.createObjectURL(file)
  try {
    const img=new Image();img.src=url;await img.decode()
    const ratio=Math.min(1,1200/Math.max(img.width,img.height)),canvas=document.createElement('canvas')
    canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio)
    const ctx=canvas.getContext('2d');if(!ctx) throw new Error('Photo could not be prepared.')
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height)
    const photo=canvas.toDataURL('image/jpeg',.8)
    if(photo.length>2_000_000) throw new Error('This photo is too large. Try a smaller image.')
    return photo
  } finally { URL.revokeObjectURL(url) }
}
