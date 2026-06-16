/**
 * Proves why extension connect failed: apex hyred.in 307-redirects to www and
 * fetch() drops Authorization on cross-origin redirect → verify always 401.
 */
const apex = 'https://hyred.in/api/extension/verify';
const www = 'https://www.hyred.in/api/extension/verify';
const fake = 'Bearer eyJ.fake';

async function probe(url, label) {
  const res = await fetch(url, { headers: { authorization: fake } });
  console.log(`${label}: status=${res.status} finalUrl=${res.url}`);
  return res;
}

const apexRes = await probe(apex, 'apex fetch');
const wwwRes = await probe(www, 'www fetch');

if (apexRes.url.includes('www.hyred.in') && apexRes.status === 401) {
  console.log('CONFIRMED: apex verify redirects to www; auth header stripped → 401');
}
if (wwwRes.url === www && wwwRes.status === 401) {
  console.log('OK: www verify hits endpoint directly (401 = invalid token, not redirect bug)');
}
