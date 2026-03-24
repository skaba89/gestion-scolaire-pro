const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://localhost:8000';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzA1NDg3MTcsImV4cCI6MjA4NTkwODcxN30.-HQgvm6RkjFdZ3i93wFnZ287hOKqhysZoP46Cv-1PBs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testClassCreation() {
    console.log('Testing class creation with academic_year_id...\n');

    // First, get a tenant
    const { data: tenants, error: tenantError } = await supabase
        .from('tenants')
        .select('id')
        .limit(1);

    if (tenantError || !tenants || tenants.length === 0) {
        console.error('Error fetching tenant:', tenantError);
        return;
    }

    const tenantId = tenants[0].id;
    console.log('Using tenant:', tenantId);

    // Get an academic year
    const { data: academicYears, error: yearError } = await supabase
        .from('academic_years')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .limit(1);

    if (yearError || !academicYears || academicYears.length === 0) {
        console.error('Error fetching academic year:', yearError);
        return;
    }

    const academicYearId = academicYears[0].id;
    console.log('Using academic year:', academicYears[0].name, academicYearId);

    // Try to insert a class
    const testClass = {
        tenant_id: tenantId,
        name: 'Test Class ' + Date.now(),
        academic_year_id: academicYearId,
        capacity: 30
    };

    console.log('\nAttempting to insert:', JSON.stringify(testClass, null, 2));

    const { data, error } = await supabase
        .from('classes')
        .insert(testClass)
        .select();

    if (error) {
        console.error('\n❌ Error inserting class:', error);
    } else {
        console.log('\n✅ Successfully created class:', data);
    }
}

testClassCreation();
