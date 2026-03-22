const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://localhost:8000';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzA1NDg3MTcsImV4cCI6MjA4NTkwODcxN30.-HQgvm6RkjFdZ3i93wFnZ287hOKqhysZoP46Cv-1PBs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testClassCreation() {
    console.log('Testing class creation with exact payload from frontend...\n');

    const testClass = {
        tenant_id: '24733a4c-1fde-4a09-a002-bb4d7c634f4f',
        name: 'Test Class ' + Date.now(),
        academic_year_id: 'd1c1c4c1-4b24-4c01-9a17-bb38570234d2',
        capacity: 30
    };

    console.log('Payload:', JSON.stringify(testClass, null, 2));

    const { data, error } = await supabase
        .from('classes')
        .insert(testClass)
        .select('*, levels(name), campuses(name)');

    if (error) {
        console.log('\n❌ ERROR DETAILS:');
        console.log('Code:', error.code);
        console.log('Message:', error.message);
        console.log('Details:', error.details);
        console.log('Hint:', error.hint);
        console.log('\nFull error object:', JSON.stringify(error, null, 2));
    } else {
        console.log('\n✅ Success:', data);
    }
}

testClassCreation();
