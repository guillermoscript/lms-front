import { NextResponse } from 'next/server'
import { EVAL_LIMITS } from './schema'

/** The response for a case insert that did not land (see insertExamCase). */
export function savedCaseError(error: 'case_limit' | 'save_failed') {
  return error === 'case_limit'
    ? NextResponse.json({ error: 'case_limit', limit: EVAL_LIMITS.maxCasesPerTarget }, { status: 409 })
    : NextResponse.json({ error: 'Could not save the case' }, { status: 500 })
}
