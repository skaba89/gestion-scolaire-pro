
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://localhost:8000';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzcwNTQ4NzE3LCJleHAiOjIwODU5MDg3MTd9.LTbBpcaG1AT29PKGXB3NkiO8WMBOJ3XM9tTxyjvAJXg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDepartments() {
    try {
        console.log('--- Phase 3: Departments CRUD Test ---');

        // 1. Login as Admin
        console.log('Logging in as admin...');
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: 'admin@schoolflow.pro',
            password: 'SuperAdmin123456',
        });

        if (authError) throw authError;
        const tenantId = authData.user.app_metadata.tenant_id || authData.user.user_metadata.tenant_id;
        console.log(`Logged in. Tenant ID: ${tenantId}`);

        // Set up client with auth header implicitly handled by supabase-js

        // 2. Create a Department
        console.log('Creating department...');
        const deptName = `Science Dept ${Date.now()}`;
        const deptCode = `SCI-${Date.now()}`;
        const { data: createData, error: createError } = await supabase
            .from('departments')
            .insert([{ name: deptName, code: deptCode, tenant_id: tenantId, description: 'Test Description' }])
            .select()
            .single();

        if (createError) throw createError;
        console.log('Create SUCCESS:', createData.name);
        const deptId = createData.id;

        // 3. Read Department
        console.log('Reading department...');
        const { data: readData, error: readError } = await supabase
            .from('departments')
            .select('*')
            .eq('id', deptId)
            .single();

        if (readError) throw readError;
        console.log('Read SUCCESS:', readData.name);

        // 4. Update Department
        console.log('Updating department...');
        const updatedName = `${deptName} (Updated)`;
        const { data: updateData, error: updateError } = await supabase
            .from('departments')
            .update({ name: updatedName })
            .eq('id', deptId)
            .select()
            .single();

        if (updateError) throw updateError;
        console.log('Update SUCCESS:', updateData.name);

        // 5. List Departments
        console.log('Listing departments...');
        const { data: listData, error: listError } = await supabase
            .from('departments')
            .select('*');

        if (listError) throw listError;
        console.log(`List SUCCESS: Found ${listData.length} departments.`);

        // 6. Delete Department
        console.log('Deleting department...');
        const { error: deleteError } = await supabase
            .from('departments')
            .delete()
            .eq('id', deptId);

        if (deleteError) throw deleteError;
        console.log('Delete SUCCESS');

        console.log('--- All Department Tests PASSED ---');
    } catch (err) {
        console.error('Test FAILED:', err.message);
        console.error('Full error:', err);
        process.exit(1);
    }
}

testDepartments();
