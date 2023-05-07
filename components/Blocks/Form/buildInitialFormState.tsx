// import { FormFieldBlock } from "payload-plugin-form-builder/dist/types"

import { Form } from "~/types/payload"

export const buildInitialFormState = (fields: Form['fields']) => {
  return fields.reduce((initialSchema, field) => {
    if (field.blockType === 'checkbox') {
      return {
        ...initialSchema,
        [field.blockName]: false,
      }
    }
    if (field.blockType === 'email') {
      return {
        ...initialSchema,
        [field.blockName]: '',
      }
    }
    if (field.blockType === 'text') {
      return {
        ...initialSchema,
        [field.blockName]: '',
      }
    }
    if (field.blockType === 'select') {
      return {
        ...initialSchema,
        [field.blockName]: '',
      }
    }
  }, {})
}
