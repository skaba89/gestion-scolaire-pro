const fetch = require('node-fetch');

async function testFunction(name, payload) {
    console.log(`--- Testing ${name} ---`);
    try {
        const response = await fetch(`http://localhost:8000/functions/v1/${name}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': 'YOUR_ANON_KEY', // This will be passed as env in the run command if possible or mocked
                'Authorization': 'Bearer YOUR_ANON_KEY'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log(`Status: ${response.status}`);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error testing ${name}:`, error.message);
    }
}

// Just checking if they are reachable and return expected errors/success
async function runTests() {
    await testFunction('create-user-account', { email: 'test@example.com' });
    await testFunction('delete-user-account', { userId: 'non-existent-id' });
    await testFunction('reset-user-password', { userId: 'non-existent-id' });
}

runTests();
