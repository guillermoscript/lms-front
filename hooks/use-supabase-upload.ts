import { useCallback, useMemo, useState } from 'react'
import { useDropzone, type FileError, type FileRejection } from 'react-dropzone'

import { nanoid } from 'nanoid'

import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

interface FileWithPreview extends File {
  preview?: string
  errors: readonly FileError[]
}

type UseSupabaseUploadOptions = {
  /**
   * Name of bucket to upload files to in your Supabase project
   */
  bucketName: string
  /**
   * Folder to upload files to in the specified bucket within your Supabase project.
   *
   * Defaults to uploading files to the root of the bucket
   *
   * e.g If specified path is `test`, your file will be uploaded as `test/file_name`
   */
  path?: string
  /**
   * Allowed MIME types for each file upload (e.g `image/png`, `text/html`, etc). Wildcards are also supported (e.g `image/*`).
   *
   * Defaults to allowing uploading of all MIME types.
   */
  allowedMimeTypes?: string[]
  /**
   * Maximum upload size of each file allowed in bytes. (e.g 1000 bytes = 1 KB)
   */
  maxFileSize?: number
  /**
   * Maximum number of files allowed per upload.
   */
  maxFiles?: number
  /**
   * The number of seconds the asset is cached in the browser and in the Supabase CDN.
   *
   * This is set in the Cache-Control: max-age=<seconds> header. Defaults to 3600 seconds.
   */
  cacheControl?: number
  /**
   * When set to true, the file is overwritten if it exists.
   *
   * When set to false, an error is thrown if the object already exists. Defaults to `false`
   */
  upsert?: boolean
  /**
   * Called with the storage paths that were uploaded after each upload round.
   */
  onUploaded?: (paths: string[]) => void
}

type UseSupabaseUploadReturn = ReturnType<typeof useSupabaseUpload>

const useSupabaseUpload = (options: UseSupabaseUploadOptions) => {
  const {
    bucketName,
    path,
    allowedMimeTypes = [],
    maxFileSize = Number.POSITIVE_INFINITY,
    maxFiles = 1,
    cacheControl = 3600,
    upsert = false,
    onUploaded,
  } = options

  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([])
  const [successes, setSuccesses] = useState<string[]>([])

  const isSuccess = useMemo(() => {
    if (errors.length === 0 && successes.length === 0) {
      return false
    }
    if (errors.length === 0 && successes.length === files.length) {
      return true
    }
    return false
  }, [errors.length, successes.length, files.length])

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      const validFiles = acceptedFiles
        .filter((file) => !files.find((x) => x.name === file.name))
        .map((file) => {
          ;(file as FileWithPreview).preview = URL.createObjectURL(file)
          ;(file as FileWithPreview).errors = []
          return file as FileWithPreview
        })

      const invalidFiles = fileRejections.map(({ file, errors }) => {
        const rejected = file as unknown as FileWithPreview
        rejected.preview = URL.createObjectURL(file)
        rejected.errors = errors
        return rejected
      })

      const newFiles = [...files, ...validFiles, ...invalidFiles]

      setFiles(newFiles)
    },
    [files, setFiles]
  )

  const dropzoneProps = useDropzone({
    onDrop,
    noClick: true,
    accept: allowedMimeTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxFileSize,
    maxFiles: maxFiles,
    multiple: maxFiles !== 1,
  })

  const onUpload = useCallback(async () => {
    setLoading(true)

    // [Joshen] This is to support handling partial successes
    // If any files didn't upload for any reason, hitting "Upload" again will only upload the files that had errors
    const filesWithErrors = errors.map((x) => x.name)
    const filesToUpload =
      filesWithErrors.length > 0
        ? [
            ...files.filter((f) => filesWithErrors.includes(f.name)),
            ...files.filter((f) => !successes.includes(f.name)),
          ]
        : files

    const responses = await Promise.all(
      filesToUpload.map(async (file) => {
        // Unique, URL-safe object name: the display name may collide or carry
        // characters storage rejects.
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const objectName = upsert ? safeName : `${nanoid(8)}-${safeName}`
        const objectPath = !!path ? `${path}/${objectName}` : objectName
        const { error } = await supabase.storage.from(bucketName).upload(objectPath, file, {
          cacheControl: cacheControl.toString(),
          upsert,
        })
        if (error) {
          return { name: file.name, message: error.message, path: objectPath }
        } else {
          return { name: file.name, message: undefined, path: objectPath }
        }
      })
    )

    const responseErrors = responses.filter((x) => x.message !== undefined)
    // if there were errors previously, this function tried to upload the files again so we should clear/overwrite the existing errors.
    setErrors(responseErrors)

    const responseSuccesses = responses.filter((x) => x.message === undefined)
    const newSuccesses = Array.from(
      new Set([...successes, ...responseSuccesses.map((x) => x.name)])
    )
    setSuccesses(newSuccesses)
    if (responseSuccesses.length > 0) onUploaded?.(responseSuccesses.map((x) => x.path))

    setLoading(false)
  }, [files, path, bucketName, errors, successes, onUploaded])

  // Once the batch fits maxFiles again, the 'too many files' rejection no longer applies.
  const visibleFiles = useMemo(
    () =>
      files.length > maxFiles
        ? files
        : files.map((file) =>
            file.errors.some((e) => e.code === 'too-many-files')
              ? Object.assign(file, { errors: file.errors.filter((e) => e.code !== 'too-many-files') })
              : file
          ),
    [files, maxFiles]
  )


  const reset = useCallback(() => {
    setFiles([])
    setSuccesses([])
    setErrors([])
  }, [])

  return {
    files: visibleFiles,
    setFiles,
    reset,
    successes,
    isSuccess,
    loading,
    // No files means no upload errors to show.
    errors: files.length === 0 ? [] : errors,
    setErrors,
    onUpload,
    maxFileSize: maxFileSize,
    maxFiles: maxFiles,
    allowedMimeTypes,
    ...dropzoneProps,
  }
}

export { useSupabaseUpload, type UseSupabaseUploadOptions, type UseSupabaseUploadReturn }
