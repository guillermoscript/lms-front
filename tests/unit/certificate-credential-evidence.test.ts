import { describe, expect, it } from 'vitest'

import {
    generateAchievementCredential,
    type AchievementCredentialInput,
    type CompletionData,
} from '@/lib/certificates/open-badges'

const APP_URL = 'https://school.example.com'

function buildInput(completion: Partial<CompletionData>): AchievementCredentialInput {
    return {
        certificateId: 'cert-1',
        userId: 'user-1',
        userEmail: 'student@example.com',
        userName: 'Ada Lovelace',
        courseId: 1002,
        courseTitle: 'Web Development Basics',
        courseDescription: 'The basics',
        verificationCode: 'CODE123',
        issuedAt: new Date('2026-09-11T00:00:00Z'),
        template: {
            name: 'Web Development Basics Certificate',
            achievement_type: 'Certificate',
            min_lesson_completion_pct: 100,
            min_exam_pass_score: 70,
            requires_all_exams: true,
        },
        completionData: {
            totalLessons: 1,
            completedLessons: 1,
            completionPercentage: 100,
            totalExams: 0,
            submittedExams: 0,
            averageExamScore: 0,
            allExamsPassed: true,
            completedAt: '2026-09-11T00:00:00Z',
            ...completion,
        },
    } as AchievementCredentialInput
}

describe('certificate credential evidence (#696)', () => {
    it('omits the exam clause for a course with no exams', () => {
        const credential = generateAchievementCredential(buildInput({}), APP_URL, 'Example School')

        const description = credential.evidence?.[0]?.description ?? ''
        expect(description).toBe('Completed 1 of 1 lessons (100%)')
        expect(description).not.toContain('exams')
    })

    it('keeps the exam clause when the course actually has exams', () => {
        const credential = generateAchievementCredential(
            buildInput({
                totalLessons: 4,
                completedLessons: 4,
                totalExams: 2,
                submittedExams: 2,
                averageExamScore: 88,
            }),
            APP_URL,
            'Example School'
        )

        expect(credential.evidence?.[0]?.description).toBe(
            'Completed 4 of 4 lessons (100%) and achieved 88% average on 2 exams'
        )
    })
})
