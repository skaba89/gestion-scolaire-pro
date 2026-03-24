
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://localhost:8000';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzA1NDg3MTcsImV4cCI6MjA4NTkwODcxN30.-HQgvm6RkjFdZ3i93wFnZ287hOKqhysZoP46Cv-1PBs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testTerms() {
    try {
        console.log('--- Phase 4: Academic Terms (Periods) CRUD Test ---');

        const tenantId = 'aeb13a4f-45c1-40fb-8db8-b7b7160298ed';
        console.log(`Using Tenant ID: ${tenantId}`);

        // 1. Create an Academic Year first (dependency)
        console.log('Creating parent academic year...');
        const yearName = `Year for Terms Test ${Date.now()}`;
        const { data: yearData, error: yearError } = await supabase
            .from('academic_years')
            .insert([{
                name: yearName,
                tenant_id: tenantId,
                start_date: '2024-09-01',
                end_date: '2025-06-30'
            }])
            .select()
            .single();

        if (yearError) throw yearError;
        const yearId = yearData.id;
        console.log(`Created year: ${yearData.name} (${yearId})`);

        // 2. Create a Term
        console.log('Creating term...');
        const termName = `Semester 1 ${Date.now()}`;
        const { data: createData, error: createError } = await supabase
            .from('terms')
            .insert([{
                name: termName,
                tenant_id: tenantId,
                academic_year_id: yearId,
                start_date: '2024-09-01',
                end_date: '2025-01-31'
            }])
            .select()
            .single();

        if (createError) throw createError;
        console.log('Create SUCCESS:', createData.name);
        const termId = createData.id;

        // 3. Read Term
        console.log('Reading term...');
        const { data: readData, error: readError } = await supabase
            .from('terms')
            .select('*, academic_years(name)')
            .eq('id', termId)
            .single();

        if (readError) throw readError;
        console.log('Read SUCCESS:', readData.name, 'for year', readData.academic_years?.name);

        // 4. Update Term
        console.log('Updating term...');
        const updatedName = `${termName} (Modified)`;
        const { data: updateData, error: updateError } = await supabase
            .from('terms')
            .update({ name: updatedName })
            .eq('id', termId)
            .select()
            .single();

        if (updateError) throw updateError;
        console.log('Update SUCCESS:', updateData.name);

        // 5. List Terms
        console.log('Listing terms...');
        const { data: listData, error: listError } = await supabase
            .from('terms')
            .select('*')
            .eq('academic_year_id', yearId);

        if (listError) throw listError;
        console.log(`List SUCCESS: Found ${listData.length} terms for this year.`);

        // 6. Delete Term & Year
        console.log('Deleting term...');
        const { error: termDeleteError } = await supabase.from('terms').delete().eq('id', termId);
        if (termDeleteError) throw termDeleteError;

        console.log('Deleting year...');
        const { error: yearDeleteError } = await supabase.from('academic_years').delete().eq('id', yearId);
        if (yearDeleteError) throw yearDeleteError;

        console.log('Delete SUCCESS');

        console.log('--- All Academic Term Tests PASSED ---');
    } catch (err) {
        console.error('Test FAILED:', err.message);
        console.error('Full error:', err);
        process.exit(1);
    }
}

testTerms();
