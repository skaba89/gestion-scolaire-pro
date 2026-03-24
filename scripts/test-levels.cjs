
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://localhost:8000';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzcwNTQ4NzE3LCJleHAiOjIwODU5MDg3MTd9.LTbBpcaG1AT29PKGXB3NkiO8WMBOJ3XM9tTxyjvAJXg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLevels() {
    try {
        console.log('--- Phase 3: Levels CRUD Test ---');

        // 1. Login as Admin
        console.log('Logging in as admin...');
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: 'admin@schoolflow.pro',
            password: 'SuperAdmin123456',
        });

        if (authError) throw authError;
        const tenantId = authData.user.app_metadata.tenant_id || authData.user.user_metadata.tenant_id;
        console.log(`Logged in. Tenant ID: ${tenantId}`);

        // 2. Create a Level
        console.log('Creating level...');
        const levelName = `Grade 10 ${Date.now()}`;
        const { data: createData, error: createError } = await supabase
            .from('levels')
            .insert([{
                name: levelName,
                tenant_id: tenantId,
                order_index: 10,
                label: '10th Grade'
            }])
            .select()
            .single();

        if (createError) throw createError;
        console.log('Create SUCCESS:', createData.name);
        const levelId = createData.id;

        // 3. Read Level
        console.log('Reading level...');
        const { data: readData, error: readError } = await supabase
            .from('levels')
            .select('*')
            .eq('id', levelId)
            .single();

        if (readError) throw readError;
        console.log('Read SUCCESS:', readData.name);

        // 4. Update Level
        console.log('Updating level...');
        const updatedName = `${levelName} (Senior)`;
        const { data: updateData, error: updateError } = await supabase
            .from('levels')
            .update({ name: updatedName })
            .eq('id', levelId)
            .select()
            .single();

        if (updateError) throw updateError;
        console.log('Update SUCCESS:', updateData.name);

        // 5. List Levels
        console.log('Listing levels...');
        const { data: listData, error: listError } = await supabase
            .from('levels')
            .select('*');

        if (listError) throw listError;
        console.log(`List SUCCESS: Found ${listData.length} levels.`);

        // 6. Delete Level
        console.log('Deleting level...');
        const { error: deleteError } = await supabase
            .from('levels')
            .delete()
            .eq('id', levelId);

        if (deleteError) throw deleteError;
        console.log('Delete SUCCESS');

        console.log('--- All Level Tests PASSED ---');
    } catch (err) {
        console.error('Test FAILED:', err.message);
        console.error('Full error:', err);
        process.exit(1);
    }
}

testLevels();
