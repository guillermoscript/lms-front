import { User } from "@/payload-types"
import { apiUrl } from "@/utils/env"

export const rest = async (
  url: string,
  args?: any, 
  options?: RequestInit,
) => {
  const method = options?.method || 'POST'

  try {
    console.log(url, '<----------- url')
    const res = await fetch(url, {
      method,
      ...(method === 'POST' ? { body: JSON.stringify(args) } : {}),
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    })

    console.log(options?.headers, '<----------- options?.headers')

    const data = await res.json()
    console.log(data, '<----------- data')
    const { errors, user, exp } = data

    // check if token is about to expire
    if (exp) {
      const now = Date.now() / 1000
      const timeLeft = exp - now
      // if less than 10 minutes left, refresh token

      if (timeLeft < 600) {
        // refresh token
        const res = await fetch(`${apiUrl}/api/users/refresh-token`, {
          method: 'POST',
          credentials: 'include',
        })

        const data = await res.json()
        console.log(data, '<----------- data')
        const { errors, user } = data

        if (errors) {
          throw new Error(errors[0].message)
        }

        if (res.ok) {
          return user
        }
      }
    }
    

    if (errors) {
      throw new Error(errors[0].message)
    }

    if (res.ok) {
      return user
    }
  } catch (e: unknown) {
    console.log(e)
    throw new Error(e as string)
  }
}