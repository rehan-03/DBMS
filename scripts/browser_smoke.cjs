/* Optional browser QA: NODE_PATH must expose Playwright. Uses installed Chrome. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const failures = [];
  page.on('pageerror', error=>failures.push(error.message));
  const base = process.env.LEDGERLITE_URL || 'http://127.0.0.1:5000';
  try {
    await page.goto(base); await page.locator('#connection.online').waitFor();
    const prefix = 'ui' + Date.now().toString(36);
    for (const [suffix,balance] of [['source','500.00'],['dest','100.00']]) {
      await page.locator('#open-account').click();
      await page.locator('#account-name').fill(suffix==='source'?'Browser proof source':'Browser proof destination');
      await page.locator('#account-handle').fill(prefix+suffix+'@upi');
      await page.locator('#opening-amount').fill(balance);
      await page.locator('#account-form button[type=submit]').click();
      await page.locator('#account-dialog').waitFor({state:'hidden'});
      await page.waitForFunction(handle=>Array.from(document.querySelector('#from-account').options).some(o=>o.value===handle),prefix+suffix+'@upi');
    }
    await page.locator('#from-account').selectOption(prefix+'source@upi');
    await page.locator('#to-account').selectOption(prefix+'dest@upi');
    await page.locator('#transfer-amount').fill('12.34');
    const requestKey = await page.locator('#transfer-key').inputValue();
    const committed = page.waitForResponse(r=>r.url().endsWith('/api/transfers')&&r.request().method()==='POST');
    await page.locator('#submit-transfer').click();
    const transfer = await (await committed).json();
    await page.waitForFunction(()=>document.querySelector('#transfer-result').textContent.includes('Transfer committed.'));
    await page.locator('#reuse-key').check();
    assert(await page.locator('#transfer-amount').isDisabled());
    const replayed = page.waitForResponse(r=>r.url().endsWith('/api/transfers')&&r.request().method()==='POST');
    await page.locator('#submit-transfer').click();
    const replay = await replayed;
    assert.equal(replay.headers()['idempotency-replayed'],'true');
    assert.equal((await replay.json()).transaction_id,transfer.transaction_id);
    const history = await (await page.request.get(base+'/api/transactions?idempotency_key='+requestKey)).json();
    assert.equal(history.items.length,1);
    await page.locator('#run-reconciliation').click();
    await page.waitForFunction(()=>document.querySelector('#book-status').textContent==='Books balanced'&&!document.querySelector('#run-reconciliation').disabled);
    await page.locator('#reverse-selected').click();
    await page.locator('#confirm-reversal').click();
    await page.locator('#reversal-dialog').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelector('#ledger-content').textContent.includes('Movement: reversal'));
    await page.locator('#run-reconciliation').click();
    await page.waitForFunction(()=>document.querySelector('#book-status').textContent==='Books balanced'&&!document.querySelector('#run-reconciliation').disabled);
    const accountData = await (await page.request.get(base+'/api/accounts?limit=100')).json();
    assert.equal(accountData.items.find(a=>a.handle===prefix+'source@upi').balance,50000);
    assert.equal(accountData.items.find(a=>a.handle===prefix+'dest@upi').balance,10000);
    const out = path.join(process.cwd(),'docs','evidence','generated'); fs.mkdirSync(out,{recursive:true});
    for(const width of [1440,768,390]) {
      await page.setViewportSize({width,height:width===390?844:1000});
      await page.screenshot({path:path.join(out,`dashboard-${width}.png`),fullPage:true});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Page overflows at ${width}px`);
    }
    assert.deepEqual(failures,[]);
    console.log('PASS: create accounts, transfer, exact replay, two entries, reversal, reconciliation and 3 responsive widths.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
