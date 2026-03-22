const jwt = require('jsonwebtoken');

const secret = 'c46a11f0d4dd4c43910710666b702234c46a11f0d4dd4c43910710666b702234';

const anonPayload = {
    role: 'anon',
    iss: 'supabase',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 10) // 10 years
};

const servicePayload = {
    role: 'service_role',
    iss: 'supabase',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 10) // 10 years
};

const anonKey = jwt.sign(anonPayload, secret);
const serviceKey = jwt.sign(servicePayload, secret);

console.log('--- NEW KEYS ---');
console.log('ANON_KEY=' + anonKey);
console.log('SERVICE_ROLE_KEY=' + serviceKey);
