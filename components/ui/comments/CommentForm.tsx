'use client'
import React, { useEffect, useState } from 'react'
import { Button } from '../button'

import { writeComment } from '@/actions/actions'
import { useFormState, useFormStatus } from 'react-dom'
import { useForm } from 'react-hook-form'
import { ForwardRefEditor } from '../markdown/ForwardRefEditor'
import { Card, CardContent } from '@/components/ui/card'

interface CommentsProps {
  entityId: number
  entityType: string
  urlToRefresh: string
}

const CommentForm = ({ entityId, entityType, urlToRefresh }: CommentsProps) => {
  const [state, action] = useFormState(writeComment, {
    status: 'idle',
    message: '',
    error: null
  })
  const [comment, setComment] = useState('')
  const form = useForm({
    defaultValues: {
      comment: ''
    }
  })

  useEffect(() => {
    console.log(state)
    if (state.status === 'success') {
      setComment('')
    }
  }, [state.status])

  return (
    <form className="w-full p-3 flex flex-col gap-4" action={action}>
      <Card>
        <CardContent>
          <ForwardRefEditor
            markdown={comment}
            className="markdown-body"
            onChange={(value) => setComment(value)}
          />
        </CardContent>
      </Card>

      <input type="hidden" name="entity_id" value={entityId} />
      <input type="hidden" name="entity_type" value={entityType} />
      <input type="hidden" name="content" value={comment} />
      <input type="hidden" name="content_type" value="markdown" />
      <input type="hidden" name="refresh_url" value={urlToRefresh} />

      <SubmitButton />

      {state.error && <div className="text-red-600">{state.error}</div>}
    </form>
  )
}

function SubmitButton () {
  const { pending } = useFormStatus()
  return (
    <>
      <Button
        type="submit"
        className="disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed w-full"
        disabled={pending}
      >
        {pending ? 'Submitting...' : 'Submit'}
      </Button>
    </>
  )
}

export default CommentForm
