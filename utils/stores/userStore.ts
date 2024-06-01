// @ts-nocheck
import { atom } from 'jotai'

import { Database } from '../supabase/supabase'
type languageAtom = Database['public']['Enums']['language_code']

export const languageAtom = atom('en')
