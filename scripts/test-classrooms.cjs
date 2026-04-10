
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://localhost:8000';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzA1NDg3MTcsImV4cCI6MjA4NTkwODcxN30.-HQgvm6RkjFdZ3i93wFnZ287hOKqhysZoP46Cv-1PBs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testClassrooms() {
    try {
        console.log('--- Phase 4: Classrooms CRUD Test ---');

        const tenantId = 'aeb13a4f-45c1-40fb-8db8-b7b7160298ed';
        console.log(`Using Tenant ID: ${tenantId}`);

        // 1. Dependencies: Level and Campus
        console.log('Creating dependencies (Level and Campus)...');
        const { data: levelData, error: levelError } = await supabase
            .from('levels')
            .insert([{ name: `Level for Class Test ${Date.now()}`, tenant_id: tenantId }])
            .select()
            .single();
        if (levelError) throw levelError;

        const { data: campusData, error: campusError } = await supabase
            .from('campuses')
            .insert([{ name: `Main Campus ${Date.now()}`, tenant_id: tenantId }])
            .select()
            .single();
        if (campusError) throw campusError;

        console.log(`Dependencies created: Level ${levelData.id}, Campus ${campusData.id}`);

        // 2. Create a Classroom
        console.log('Creating classroom...');
        const className = `Grade 10-A ${Date.now()}`;
        const { data: createData, error: createError } = await supabase
            .from('classrooms')
            .insert([{
                name: className,
                tenant_id: tenantId,
                level_id: levelData.id,
                campus_id: campusData.id,
                capacity: 30
            }])
            .select()
            .single();

        if (createError) throw createError;
        console.log('Create SUCCESS:', createData.name);
        const classId = createData.id;

        // 3. Read Classroom
        console.log('Reading classroom...');
        const { data: readData, error: readError } = await supabase
            .from('classrooms')
            .select('*, levels(name), campuses(name)')
            .eq('id', classId)
            .single();

        if (readError) throw readError;
        console.log('Read SUCCESS:', readData.name, 'Level:', readData.levels?.name, 'Campus:', readData.campuses?.name);

        // 4. Update Classroom
        console.log('Updating classroom...');
        const updatedName = `${className} (Updated)`;
        const { data: updateData, error: updateError } = await supabase
            .from('classrooms')
            .update({ name: updatedName, capacity: 35 })
            .eq('id', classId)
            .select()
            .single();

        if (updateError) throw updateError;
        console.log('Update SUCCESS:', updateData.name, 'Capacity:', updateData.capacity);

        // 5. List Classrooms
        console.log('Listing classrooms...');
        const { data: listData, error: listError } = await supabase
            .from('classrooms')
            .select('*')
            .eq('tenant_id', tenantId);

        if (listError) throw listError;
        console.log(`List SUCCESS: Found ${listData.length} classes.`);

        // 6. Delete Classroom & Dependencies
        console.log('Cleaning up...');
        await supabase.from('classrooms').delete().eq('id', classId);
        await supabase.from('levels').delete().eq('id', levelData.id);
        await supabase.from('campuses').delete().eq('id', campusData.id);

        console.log('Cleanup SUCCESS');

        console.log('--- All Classroom Tests PASSED ---');
    } catch (err) {
        console.error('Test FAILED:', err.message);
        console.error('Full error:', err);
        process.exit(1);
    }
}

testClassrooms();
