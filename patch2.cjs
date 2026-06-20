const fs = require('fs');
const path = './src/services/market-data.service.ts';
let code = fs.readFileSync(path, 'utf8');

// remove suppressNotices
code = code.replace('yahooFinance.suppressNotices(["yahooSurvey"]);', '');

// cast as any
code = code.replace('const data = await yahooFinance.quote(yahooSymbol);', 'const data = await yahooFinance.quote(yahooSymbol) as any;');
code = code.replace('const data = await yahooFinance.search(query, { quotesCount: 15, newsCount: 0 });', 'const data = await yahooFinance.search(query, { quotesCount: 15, newsCount: 0 }) as any;');
code = code.replace('const data = await yahooFinance.historical(upper, { period1, period2, interval });', 'const data = await yahooFinance.historical(upper, { period1, period2, interval }) as any;');

fs.writeFileSync(path, code);
console.log("Fixed types.");
