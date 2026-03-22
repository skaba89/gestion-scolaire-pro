const wp = require('web-push');
const fs = require('fs');
const keys = wp.generateVAPIDKeys();
fs.writeFileSync('vapid_clean.json', JSON.stringify(keys, null, 2));
console.log('Keys generated in vapid_clean.json');
