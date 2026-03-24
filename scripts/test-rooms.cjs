
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://localhost:8000';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzA1NDg3MTcsImV4cCI6MjA4NTkwODcxN30.-HQgvm6RkjFdZ3i93wFnZ287hOKqhysZoP46Cv-1PBs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRooms() {
    try {
        console.log('--- Phase 3: Rooms CRUD Test ---');

        const tenantId = 'aeb13a4f-45c1-40fb-8db8-b7b7160298ed';
        console.log(`Using Tenant ID: ${tenantId}`);

        // 2. Create a Room
        console.log('Creating room...');
        const roomName = `Room 101 ${Date.now()}`;
        const { data: createData, error: createError } = await supabase
            .from('rooms')
            .insert([{
                name: roomName,
                tenant_id: tenantId,
                capacity: 35,
                type: 'classroom'
            }])
            .select()
            .single();

        if (createError) throw createError;
        console.log('Create SUCCESS:', createData.name);
        const roomId = createData.id;

        // 3. Read Room
        console.log('Reading room...');
        const { data: readData, error: readError } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();

        if (readError) throw readError;
        console.log('Read SUCCESS:', readData.name);

        // 4. Update Room
        console.log('Updating room...');
        const updatedCapacity = 40;
        const { data: updateData, error: updateError } = await supabase
            .from('rooms')
            .update({ capacity: updatedCapacity })
            .eq('id', roomId)
            .select()
            .single();

        if (updateError) throw updateError;
        console.log('Update SUCCESS: Capacity now', updateData.capacity);

        // 5. List Rooms
        console.log('Listing rooms...');
        const { data: listData, error: listError } = await supabase
            .from('rooms')
            .select('*');

        if (listError) throw listError;
        console.log(`List SUCCESS: Found ${listData.length} rooms.`);

        // 6. Delete Room
        console.log('Deleting room...');
        const { error: deleteError } = await supabase
            .from('rooms')
            .delete()
            .eq('id', roomId);

        if (deleteError) throw deleteError;
        console.log('Delete SUCCESS');

        console.log('--- All Room Tests PASSED ---');
    } catch (err) {
        console.error('Test FAILED:', err.message);
        console.error('Full error:', err);
        process.exit(1);
    }
}

testRooms();
