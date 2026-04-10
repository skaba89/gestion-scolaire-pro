const crypto = require('crypto');

function base64url(buf) {
    return buf.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function sign(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
    const encodedPayload = base64url(Buffer.from(JSON.stringify(payload)));
    const signature = crypto.createHmac('sha256', secret)
        .update(encodedHeader + '.' + encodedPayload)
        .digest();
    return encodedHeader + '.' + encodedPayload + '.' + base64url(signature);
}

const secret = 'c46a11f0d4dd4c43910710666b702234c46a11f0d4dd4c43910710666b702234';

const anonPayload = {
    role: 'anon',
    iss: 'supabase',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 10)
};

const servicePayload = {
    role: 'service_role',
    iss: 'supabase',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 10)
};

console.log('--- NEW KEYS ---');
console.log('ANON_KEY=' + sign(anonPayload, secret));
console.log('SERVICE_ROLE_KEY=' + sign(servicePayload, secret));
