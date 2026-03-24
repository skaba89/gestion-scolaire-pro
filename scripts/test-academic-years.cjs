
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://localhost:8000';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzA1NDg3MTcsImV4cCI6MjA4NTkwODcxN30.-HQgvm6RkjFdZ3i93wFnZ287hOKqhysZoP46Cv-1PBs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAcademicYears() {
    try {
        console.log('--- Phase 4: Academic Years CRUD Test ---');

        const tenantId = 'aeb13a4f-45c1-40fb-8db8-b7b7160298ed';
        console.log(`Using Tenant ID: ${tenantId}`);

        // 2. Create an Academic Year
        console.log('Creating academic year...');
        const yearName = `Academic Year 2024-2025 ${Date.now()}`;
        const { data: createData, error: createError } = await supabase
            .from('academic_years')
            .insert([{
                name: yearName,
                tenant_id: tenantId,
                start_date: '2024-09-01',
                end_date: '2025-06-30',
                is_current: true
            }])
            .select()
            .single();

        if (createError) throw createError;
        console.log('Create SUCCESS:', createData.name);
        const yearId = createData.id;

        // 3. Read Academic Year
        console.log('Reading academic year...');
        const { data: readData, error: readError } = await supabase
            .from('academic_years')
            .select('*')
            .eq('id', yearId)
            .single();

        if (readError) throw readError;
        console.log('Read SUCCESS:', readData.name);

        // 4. Update Academic Year
        console.log('Updating academic year...');
        const { data: updateData, error: updateError } = await supabase
            .from('academic_years')
            .update({ is_current: false })
            .eq('id', yearId)
            .select()
            .single();

        if (updateError) throw updateError;
        console.log('Update SUCCESS: is_current now', updateData.is_current);

        // 5. List Academic Years
        console.log('Listing academic years...');
        const { data: listData, error: listError } = await supabase
            .from('academic_years')
            .select('*');

        if (listError) throw listError;
        console.log(`List SUCCESS: Found ${listData.length} years.`);

        // 6. Delete Academic Year
        console.log('Deleting academic year...');
        const { error: deleteError } = await supabase
            .from('academic_years')
            .delete()
            .eq('id', yearId);

        if (deleteError) throw deleteError;
        console.log('Delete SUCCESS');

        console.log('--- All Academic Year Tests PASSED ---');
    } catch (err) {
        console.error('Test FAILED:', err.message);
        console.error('Full error:', err);
        process.exit(1);
    }
}

testAcademicYears();
