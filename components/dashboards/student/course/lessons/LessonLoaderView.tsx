'use client'
import { Loader } from 'lucide-react'
import { useEffect, useState } from 'react'

import { createClient } from '@/utils/supabase/client'

// Function to log a lesson view
async function logLessonView(userId: string, lessonId: number) {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('lesson_views')
        .insert([{ user_id: userId, lesson_id: lessonId }])

    if (error) {
        console.error('Error logging lesson view:', error)
    } else {
        console.log('Lesson view logged:', data)
    }
}

const LessonLoaderView = ({ userId, lessonId }) => {
    const [Loading, setLoading] = useState(true)
    useEffect(() => {
        try {
            logLessonView(userId, lessonId)
        } catch (error) {
            console.error('Error logging lesson view', error)
        } finally {
            setLoading(false)
        }
    }, [userId, lessonId])

    // The rest of your lesson page component code
    return Loading ? (
        <Loader
            size={32}
            className='h-12 w-12 animate-spin'
        />
    )
        : null
}

export default LessonLoaderView
