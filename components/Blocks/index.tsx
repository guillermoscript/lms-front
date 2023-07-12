

import { toKebabCase } from '../../utils/toKebabCase';
import { VerticalPadding } from '../VerticalPadding';
import { FormBlock } from './Form'

const blockComponents = {
  formBlock: FormBlock,
}

export type FormExamn = {
  form:      Form;
  id:        string;
  blockName: string;
  blockType: string;
}

export type Form = {
  id:                  string;
  title:               string;
  fields:              Field[];
  submitButtonLabel:   string;
  confirmationType:    string;
  confirmationMessage: Content[];
  redirect:            any;
  emails:              Email[];
  createdAt:           Date;
  updatedAt:           Date;
}


export type Field = {
  name:      string;
  label:     string;
  required:  boolean;
  id:        string;
  blockName: string;
  blockType: string;
  options?:  Option[];
}

export type Content = {
  children: Child[];
}

export type Child = {
  text: string;
}

export type Option = {
  label: string;
  value: string;
  id:    string;
}

type Email = {
  subject: string;
  id:      string;
}

const BlocksComponent: React.FC<{
  blocks: FormExamn
  callback: (data: any, {
    onSuccess,
    onError,
  }: {
    onSuccess: (data:any) => void
    onError: (data:any) => void
  }) => void
}> = (props) => {
  const {
    blocks,
    callback
  } = props;

  const hasBlocks = blocks && Array.isArray(blocks) && blocks.length > 0;

  if (!hasBlocks) {
    return null;
  }

  return (
    <>
      {blocks.map((block: FormExamn, index: number) => {
        const {
          blockName,
          blockType,
          form
        } = block;

        const isFormBlock = blockType === 'formBlock'
        {/*@ts-ignore*/ }
        const formID: string = isFormBlock && form && form.id

        if (blockType && blockType in blockComponents) {
          const Block = blockComponents[blockType as keyof typeof blockComponents];

          return (
            <VerticalPadding
              key={isFormBlock ? formID : index}
              top='small'
              bottom='small'
            >
              {/*@ts-ignore*/}
              <Block
                {...block}
                id={toKebabCase(blockName)}
                callback={callback}
              />
            </VerticalPadding>
          );

        }
        return null;
      })}
    </>
  );

};

export default BlocksComponent;
