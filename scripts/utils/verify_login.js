
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:8000'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzcwODMyOTAxLCJleHAiOjIwODYxOTI5MDF9.emNDsrdHPUd_GBkk96Cz2M1Fzh3PV5fc6FX0_4w3Jdc'

const supabase = createClient(supabaseUrl, supabaseKey)

const emails = [
    'admin@example.fr',
    'secretariat@example.fr',
    'compta@example.fr',
    'chefdepinfo@example.fr',
    'directeur@example.fr',
    'teacher@example.fr',
    'student@example.fr',
    'parent@example.fr'
]
const password = 'Password'

async function testLogin() {
    console.log("Starting batch login test...")
    for (const email of emails) {
        process.stdout.write(`Testing ${email} ... `)
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            console.log(`[FAIL] ${error.message}`)
        } else {
            console.log(`[SUCCESS] OK`)
        }
    }
}

testLogin()
