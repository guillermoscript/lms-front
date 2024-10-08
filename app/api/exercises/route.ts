import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { getServerUserRole } from '@/utils/supabase/getUserRole'
import { createClient } from '@/utils/supabase/server'

// Zod schema to validate the exercise data
const ExerciseSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    instructions: z.string().min(1, 'Instructions are required'),
    systemPrompt: z.string().min(1, 'System Prompt is required'),
    exerciseType: z.enum(['quiz', 'coding_challenge', 'essay', 'multiple_choice', 'true_false', 'fill_in_the_blank', 'discussion']),
    difficultyLevel: z.enum(['easy', 'medium', 'hard']),
    timeLimit: z.number().int().positive().optional(),
    lesson_id: z.number().int().optional(),
    course_id: z.number().int().optional()
})

// Helper function to check authentication
async function getAuthenticatedUser(supabase: any) {
    const { data, error } = await supabase.auth.getUser()
    if (error) throw new Error('User not authenticated')
    return data.user
}

// Main handler for the route
export async function POST(req: NextRequest) {
    try {
        const supabase = createClient()
        const user = await getAuthenticatedUser(supabase)
        const body = await req.json()

        const userRole = await getServerUserRole()

        if (userRole !== 'teacher') {
            return NextResponse.json(
                { status: 'error', message: 'Unauthorized access' },
                { status: 403 }
            )
        }

        console.log(body)

        // Validate request body using zod
        const data = ExerciseSchema.parse(body)

        const { error } = await supabase
            .from('exercises')
            .insert({
                difficulty_level: data.difficultyLevel,
                exercise_type: data.exerciseType,
                created_by: user.id,
                created_at: new Date().toISOString(),
                title: data.title,
                description: data.description,
                instructions: data.instructions,
                system_prompt: data.systemPrompt,
                time_limit: data.timeLimit,
                lesson_id: data.lesson_id,
                course_id: data.course_id // Assuming course_id is part of the data
            })

        if (error) {
            return NextResponse.json(
                { status: 'error', message: 'Error inserting data', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json(
            { status: 'success', message: 'Exercise created successfully' },
            { status: 201 }
        )
    } catch (error) {
        return NextResponse.json(
            { status: 'error', message: 'Invalid input data', details: error.message },
            { status: 400 }
        )
    }
}

export async function PUT(req: NextRequest) {
    try {
        const supabase = createClient()
        const user = await getAuthenticatedUser(supabase)
        const body = await req.json()

        const userRole = await getServerUserRole()

        if (userRole !== 'teacher') {
            return NextResponse.json(
                { status: 'error', message: 'Unauthorized access' },
                { status: 403 }
            )
        }

        // Validate request body using zod
        const data = ExerciseSchema.pick({
            title: true,
            description: true,
            instructions: true,
            systemPrompt: true,
            exerciseType: true,
            difficultyLevel: true,
            timeLimit: true,
            lesson_id: true,
            course_id: true
        }).parse(body)

        console.log(data)

        const { exerciseId } = body
        const { error } = await supabase
            .from('exercises')
            .update({
                difficulty_level: data.difficultyLevel,
                exercise_type: data.exerciseType,
                title: data.title,
                description: data.description,
                instructions: data.instructions,
                system_prompt: data.systemPrompt,
                time_limit: data.timeLimit,
                course_id: data.course_id,
                ...(
                    data.lesson_id ? { lesson_id: data.lesson_id } : {}
                )
            })
            .eq('id', exerciseId)
            .eq('created_by', user.id)

        if (error) {
            return NextResponse.json(
                { status: 'error', message: 'Error updating record', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json(
            { status: 'success', message: 'Exercise updated successfully' },
            { status: 200 }
        )
    } catch (error) {
        return NextResponse.json(
            { status: 'error', message: 'Invalid input data', details: error.message },
            { status: 400 }
        )
    }
}
