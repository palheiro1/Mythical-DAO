import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const origin='https://dao.mythicalbeings.io',dir='docs/evidence/integration-2026-10-07';
const report={at:new Date().toISOString(),origin,artifacts:[],pages:[],api:[]};
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const path of ['config','health','proposals?kind=executable','treasury']){
 const r=await fetch(origin+'/api/'+path),v=await r.json();
 report.api.push({path,status:r.status,integrations:v.integrations,read:v.read,items:v.items?.length,accounts:v.accounts?.length,operationVerification:v.operationVerification,error:v.error});
 if(r.status!==200)throw Error('API '+path+' '+r.status);
}
expect(report.api[0].integrations.telegram.channelUrl).toBe('https://t.me/+yod9k6rLKOo5YjQ8');
expect(report.api[0].integrations.discord.channelId).toBe('1195328129435177041');
expect(report.api[1].read.source).toBe('The Graph');
for(const path of ['index.html','community/telegram.svg','community/discord.svg',...fs.readdirSync('dist/assets').map(f=>'assets/'+f)]){
 const r=await fetch(origin+'/'+(path==='index.html'?'':path)),data=Buffer.from(await r.arrayBuffer());
 const matches=hash(data)===hash(fs.readFileSync('dist/'+path));
 report.artifacts.push({path,status:r.status,matches});expect(matches).toBe(true);
}
const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});
try{
for(const theme of ['light','dark'])for(const width of [390,768,1440]){
 const context=await browser.newContext({colorScheme:theme,viewport:{width,height:1000},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);let widgetRequests=0;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().startsWith('https://emerald.widgetbot.io/'))widgetRequests++;});
 for(const [route,title] of [['overview','The Seekers’ Camp'],['governance','Governance'],['treasury','Treasury'],['delegation','Delegation'],['history','Governance history'],['create','Create a proposal'],['ragequit','Exit DAO'],['guide','How governance works']]){
  await page.goto(origin+'/#'+route);
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await expect.poll(()=>page.locator('main img:not([loading="lazy"])').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0)),{timeout:15000}).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(['overview','governance','treasury'].includes(route))await page.screenshot({path:`${dir}/${route}-${theme}-${width}.png`});
  if(route==='overview'){
   const section=page.locator('.stay-connected');await section.scrollIntoViewIfNeeded();
   await expect(page.getByRole('link',{name:'Get governance alerts'})).toHaveAttribute('href','https://t.me/+yod9k6rLKOo5YjQ8');
   await section.screenshot({path:`${dir}/community-${theme}-${width}.png`});
   expect(widgetRequests).toBe(0);
   await page.getByRole('button',{name:'Buy / Sell MANA'}).click();
   await page.getByRole('dialog').getByRole('textbox').fill('1.123456');
   const trade=await page.getByRole('link',{name:'Continue on Uniswap'}).getAttribute('href');
   expect(trade).toContain('1.123456');
   await page.keyboard.press('Escape');
  }
  if(route==='governance'){
   await expect(page.getByRole('button',{name:'Open DAO chat'})).toBeVisible();
   await expect(page.locator('.decision-results').first()).toBeVisible();
   await expect(page.locator('.result-freshness').first()).toContainText('Indexed by The Graph');
  }
  if(route==='delegation')await expect(page.getByRole('button',{name:'Buy / Sell MANA'})).toBeVisible();
 }
 await page.goto(origin+'/#overview');
 await page.getByRole('button',{name:'Open DAO chat'}).click();
 await expect(page.locator('iframe')).toHaveAttribute('src','https://emerald.widgetbot.io/channels/809857155401646151/1195328129435177041');
 await expect(page.getByRole('dialog').getByRole('link',{name:'Open in Discord'})).toHaveAttribute('href','https://discord.com/channels/809857155401646151/1195328129435177041');
 await page.getByRole('button',{name:'Close Campfire'}).click();
 await expect(page.locator('iframe')).toHaveCount(0);
 expect(errors).toEqual([]);report.pages.push({theme,width,routes:8,widgetRequests,errors});
 await context.close();
}
}finally{await browser.close();fs.writeFileSync(dir+'/public-verification.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({pages:report.pages,api:report.api}));
