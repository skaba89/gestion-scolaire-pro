
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'http://localhost:8000'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzcwODMyOTAxLCJleHAiOjIwODYxOTI5MDF9.emNDsrdHPUd_GBkk96Cz2M1Fzh3PV5fc6FX0_4w3Jdc'

const supabase = createClient(supabaseUrl, supabaseKey)

async function debugChangePassword() {
    const email = 'parent@example.fr'
    const currentPassword = 'Password'
    const newPassword = 'NewPassword123!'

    console.log(`1. Logging in as ${email}...`)
    const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
    })

    if (loginError) {
        console.error('Login failed:', loginError.message)
        return
    }
    console.log('Login successful. User ID:', session.user.id)

    console.log('2. Updating password...')
    const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        password: newPassword
    })

    if (updateError) {
        console.error('Update User failed:', updateError.message)
        return
    }
    console.log('Password updated successfully.')

    console.log('3. Updating profile must_change_password...')
    const { error: profileError } = await supabase
        .from('profiles')
        .update({ must_change_password: false })
        .eq('id', session.user.id)

    if (profileError) {
        console.error('Profile update failed:', profileError.message)
        return
    }
    console.log('Profile updated successfully.')

    console.log('4. Reverting password to default...')
    const { error: revertError } = await supabase.auth.updateUser({
        password: currentPassword
    })

    if (revertError) {
        console.error('Revert password failed:', revertError.message)
    } else {
        console.log('Password reverted successfully.')
    }

    // Revert must_change_password too for testing UI later if needed? 
    // Maybe better to leave it false to see if it fixes the user's issue?
    // I will revert it to true to be safe for reproduction.
    await supabase.from('profiles').update({ must_change_password: true }).eq('id', session.user.id)
    console.log('Profile reverted to must_change_password=true')
}

debugChangePassword()
