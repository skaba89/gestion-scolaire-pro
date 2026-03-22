
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'http://localhost:8000';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzcwNTQ4NzE3LCJleHAiOjIwODU5MDg3MTd9.LTbBpcaG1AT29PKGXB3NkiO8WMBOJ3XM9tTxyjvAJXg';

console.log('Using hardcoded Supabase credentials for testing.');

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLogin() {
    try {
        const args = process.argv.slice(2);
        const email = args[0] || 'admin@schoolflow.pro';
        const password = args[1] || 'SuperAdmin123456';

        console.log(`Testing Login for ${email}...`);

        console.log('Calling signInWithPassword...');
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            console.log('Login Result: FAILED (Expected if testing error handling)');
            console.log('Error Message:', error.message);
            // Don't exit 1 if we are testing invalid credentials
            if (args.length > 0 && args[1] !== 'SuperAdmin123456') {
                return;
            }
            process.exit(1);
        }

        console.log('Login Successful!');
        console.log('User ID:', data.user.id);
        console.log('Email:', data.user.email);

        // Check Tenant ID in metadata
        const appMetadata = data.user.app_metadata;
        const userMetadata = data.user.user_metadata;

        console.log('App Metadata:', appMetadata);
        console.log('User Metadata:', userMetadata);

        if (appMetadata.tenant_id || userMetadata.tenant_id) {
            console.log('Tenant ID found:', appMetadata.tenant_id || userMetadata.tenant_id);
        } else {
            console.error('WARNING: No tenant_id found in metadata!');
        }

        // Verify Token validity (basic check)
        if (data.session && data.session.access_token) {
            console.log('Session Token present.');
        } else {
            console.error('Missing Session Token.');
        }
    } catch (err) {
        console.error('Unexpected error:', err);
        process.exit(1);
    }
}

testLogin();
