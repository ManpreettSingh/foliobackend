const WebSocket = require('ws');
const protobuf = require('protobufjs');
const PROTO_SCHEMA = `
syntax = "proto3";
message PricingData {
  string id = 1;
  float price = 2;
  sint64 time = 3;
  string currency = 4;
  string exchange = 5;
  int32 quoteType = 6;
  int32 marketHours = 7;
  float changePercent = 8;
  sint64 dayVolume = 9;
  float dayHigh = 10;
  float dayLow = 11;
  float change = 12;
  string shortName = 13;
}
`;
const root = protobuf.parse(PROTO_SCHEMA).root;
const PricingData = root.lookupType('PricingData');

const ws = new WebSocket('wss://streamer.finance.yahoo.com/');
ws.on('open', () => {
  console.log('Connected');
  ws.send(JSON.stringify({ subscribe: ['RELIANCE.NS', 'AAPL'] }));
});
ws.on('message', (data) => {
  const decoded = PricingData.decode(Buffer.from(data.toString(), 'base64'));
  console.log(decoded.id, decoded.price);
});
setTimeout(() => process.exit(0), 5000);
