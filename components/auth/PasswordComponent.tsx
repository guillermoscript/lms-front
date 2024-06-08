'use client'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { useState } from 'react'

export default function PasswordComponent () {
    const [showPassword, setShowPassword] = useState(false)

    return (
        <div className="rounded-md px-4 py-2 w-full bg-inherit border mb-6 gap-4 flex items-center justify-between">
            <input
                className="border-none w-full"
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="••••••••"
                required
            />
            <button
                type='button'
                onClick={() => setShowPassword(!showPassword)}
            >
                {!showPassword ? (
                    <EyeIcon />
                ) : (
                    <EyeOffIcon />
                )}
            </button>
        </div>
    )
}
