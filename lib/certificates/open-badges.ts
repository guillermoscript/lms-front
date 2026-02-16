/**
 * Open Badges 3.0 Credential Generation
 * Generates verifiable credentials compliant with Open Badges 3.0 specification
 */

// crypto is dynamically imported to avoid build errors when @noble/curves is not installed

// =====================================================
// Types
// =====================================================

export interface AchievementCredentialInput {
    certificateId: string;
    userId: string;
    userEmail: string;
    userName: string;
    courseId: number;
    courseTitle: string;
    courseDescription: string;
    completionData: CompletionData;
    verificationCode: string;
    issuedAt: Date;
    expiresAt?: Date | null;
    template: CertificateTemplate;
}

export interface CompletionData {
    totalLessons: number;
    completedLessons: number;
    completionPercentage: number;
    totalExams: number;
    submittedExams: number;
    averageExamScore: number;
    allExamsPassed: boolean;
    completedAt: string;
}

export interface CertificateTemplate {
    name: string;
    description?: string;
    achievement_type: string;
    achievement_criteria_narrative?: string;
    tags?: string[];
    alignment_targets?: any;
    min_lesson_completion_pct: number;
    min_exam_pass_score: number;
    requires_all_exams: boolean;
}

export interface OpenBadgeCredential {
    '@context': string[];
    id: string;
    type: string[];
    issuer: Issuer;
    issuanceDate: string;
    expirationDate?: string;
    credentialSubject: CredentialSubject;
    evidence?: Evidence[];
}

export interface Issuer {
    id: string;
    type: string;
    name: string;
    url: string;
    image?: string;
    email?: string;
}

export interface CredentialSubject {
    id: string;
    type: string;
    achievement: Achievement;
}

export interface Achievement {
    id: string;
    type: string;
    name: string;
    description: string;
    criteria: Criteria;
    image?: string;
    tags?: string[];
    alignment?: any[];
}

export interface Criteria {
    narrative: string;
}

export interface Evidence {
    id: string;
    type: string[];
    name: string;
    description: string;
    genre?: string;
}

// =====================================================
// Credential Generation
// =====================================================

/**
 * Generate Open Badges 3.0 AchievementCredential
 */
export function generateAchievementCredential(
    input: AchievementCredentialInput,
    appUrl: string,
    issuerName: string
): OpenBadgeCredential {
    const {
        certificateId,
        userId,
        userEmail,
        userName,
        courseId,
        courseTitle,
        courseDescription,
        completionData,
        verificationCode,
        issuedAt,
        expiresAt,
        template,
    } = input;

    // Build credential ID
    const credentialId = `${appUrl}/credentials/${certificateId}`;

    // Build issuer profile
    const issuer: Issuer = {
        id: `${appUrl}/issuers/main`,
        type: 'Profile',
        name: issuerName,
        url: appUrl,
        image: `${appUrl}/logo.png`,
    };

    // Build achievement
    const achievement: Achievement = {
        id: `${appUrl}/achievements/${courseId}`,
        type: 'Achievement',
        name: template.name || `${courseTitle} Certificate`,
        description: template.description || courseDescription || `Demonstrates successful completion of ${courseTitle}`,
        criteria: {
            narrative: template.achievement_criteria_narrative ||
                `Complete ${template.min_lesson_completion_pct}% of lessons and achieve ${template.min_exam_pass_score}% or higher on ${template.requires_all_exams ? 'all exams' : 'average exam score'}`,
        },
        image: `${appUrl}/api/certificates/badge/${certificateId}`,
        tags: template.tags,
        alignment: template.alignment_targets,
    };

    // Build credential subject
    const credentialSubject: CredentialSubject = {
        id: `did:web:${new URL(appUrl).hostname}:users:${userId}`,
        type: 'AchievementSubject',
        achievement,
    };

    // Build evidence
    const evidence: Evidence[] = [
        {
            id: `${appUrl}/verify/${verificationCode}`,
            type: ['Evidence'],
            name: 'Course Completion Evidence',
            description: `Completed ${completionData.completedLessons} of ${completionData.totalLessons} lessons (${completionData.completionPercentage}%) and achieved ${completionData.averageExamScore}% average on ${completionData.submittedExams} exams`,
            genre: 'Certificate',
        },
    ];

    // Build credential
    const credential: OpenBadgeCredential = {
        '@context': [
            'https://www.w3.org/2018/credentials/v1',
            'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
        ],
        id: credentialId,
        type: ['VerifiableCredential', 'OpenBadgeCredential'],
        issuer,
        issuanceDate: issuedAt.toISOString(),
        credentialSubject,
        evidence,
    };

    // Add expiration date if provided
    if (expiresAt) {
        credential.expirationDate = expiresAt.toISOString();
    }

    return credential;
}

/**
 * Sign credential with cryptographic proof
 */
export async function signCredential(
    credential: OpenBadgeCredential,
    privateKeyHex: string,
    keyUrl: string
): Promise<any> {
    const { addProofToCredential } = await import('./crypto');
    return addProofToCredential(credential, privateKeyHex, keyUrl);
}

/**
 * Validate credential structure against Open Badges 3.0 spec
 */
export function validateCredentialStructure(credential: any): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    // Check required @context
    if (!credential['@context']) {
        errors.push('Missing @context');
    } else if (!Array.isArray(credential['@context'])) {
        errors.push('@context must be an array');
    } else {
        const requiredContexts = [
            'https://www.w3.org/2018/credentials/v1',
            'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
        ];
        for (const ctx of requiredContexts) {
            if (!credential['@context'].includes(ctx)) {
                errors.push(`Missing required context: ${ctx}`);
            }
        }
    }

    // Check required type
    if (!credential.type) {
        errors.push('Missing type');
    } else if (!Array.isArray(credential.type)) {
        errors.push('type must be an array');
    } else {
        const requiredTypes = ['VerifiableCredential', 'OpenBadgeCredential'];
        for (const type of requiredTypes) {
            if (!credential.type.includes(type)) {
                errors.push(`Missing required type: ${type}`);
            }
        }
    }

    // Check issuer
    if (!credential.issuer) {
        errors.push('Missing issuer');
    } else {
        if (!credential.issuer.id) {
            errors.push('Missing issuer.id');
        }
        if (!credential.issuer.type) {
            errors.push('Missing issuer.type');
        }
        if (!credential.issuer.name) {
            errors.push('Missing issuer.name');
        }
    }

    // Check issuanceDate
    if (!credential.issuanceDate) {
        errors.push('Missing issuanceDate');
    } else {
        try {
            new Date(credential.issuanceDate);
        } catch {
            errors.push('Invalid issuanceDate format');
        }
    }

    // Check credentialSubject
    if (!credential.credentialSubject) {
        errors.push('Missing credentialSubject');
    } else {
        if (!credential.credentialSubject.type) {
            errors.push('Missing credentialSubject.type');
        }
        if (!credential.credentialSubject.achievement) {
            errors.push('Missing credentialSubject.achievement');
        } else {
            const achievement = credential.credentialSubject.achievement;
            if (!achievement.type) {
                errors.push('Missing achievement.type');
            }
            if (!achievement.name) {
                errors.push('Missing achievement.name');
            }
            if (!achievement.criteria) {
                errors.push('Missing achievement.criteria');
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Generate DID (Decentralized Identifier) for user
 */
export function generateUserDID(userId: string, appUrl: string): string {
    const hostname = new URL(appUrl).hostname;
    return `did:web:${hostname}:users:${userId}`;
}

/**
 * Generate achievement ID
 */
export function generateAchievementId(courseId: number, appUrl: string): string {
    return `${appUrl}/achievements/${courseId}`;
}
