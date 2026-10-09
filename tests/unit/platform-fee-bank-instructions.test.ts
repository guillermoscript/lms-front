import { describe, it, expect } from 'vitest'
import { feeTransferReference, getPlatformFeeBankInstructions } from '@/lib/billing/platform-fee-bank-instructions'

describe('getPlatformFeeBankInstructions', () => {
  it('is null when unset or blank', () => {
    expect(getPlatformFeeBankInstructions({})).toBeNull()
    expect(getPlatformFeeBankInstructions({ PLATFORM_FEE_BANK_INSTRUCTIONS: '  \n ' })).toBeNull()
  })

  it('keeps line breaks, trims and normalises CRLF and literal \\n', () => {
    expect(getPlatformFeeBankInstructions({ PLATFORM_FEE_BANK_INSTRUCTIONS: ' Bank: X\r\nIBAN: 1 ' })).toBe('Bank: X\nIBAN: 1')
    expect(getPlatformFeeBankInstructions({ PLATFORM_FEE_BANK_INSTRUCTIONS: 'Bank: X\\nIBAN: 1' })).toBe('Bank: X\nIBAN: 1')
  })

  it('caps the length', () => {
    expect(getPlatformFeeBankInstructions({ PLATFORM_FEE_BANK_INSTRUCTIONS: 'a'.repeat(5000) })).toHaveLength(2000)
  })

  it('does not read a NEXT_PUBLIC twin', () => {
    expect(getPlatformFeeBankInstructions({ NEXT_PUBLIC_PLATFORM_FEE_BANK_INSTRUCTIONS: 'x' })).toBeNull()
  })
})

describe('feeTransferReference', () => {
  it('is tenant based, and gains the request suffix once known', () => {
    expect(feeTransferReference('qa-fee-blocked')).toBe('FEES-QA-FEE-BLOCKED')
    expect(feeTransferReference('acme', '3f2a9c10-aaaa-bbbb-cccc-111122223333')).toBe('FEES-ACME-3F2A9C10')
  })
})
