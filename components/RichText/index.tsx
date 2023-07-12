import React from 'react';
import Serialize from './serialize';
import styles from './RichText.module.css';
import { Media } from '../../payload-types';

export type UploadRichText =  {
  type: string;
  relationTo: string;
  children: RichTextNode[];
  value: Media
}

export type RichTextNode = {
  text?: string;
  type?: string;
  bold?: boolean;
  code?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  small?: boolean;
  indent?: boolean;
  url?: string;
  newTab?: boolean;
  children?: RichTextNode[];
  value?: Location | unknown;
  upload?: UploadRichText;
};

export type RichTextType = RichTextNode[];

export const RichText: React.FC<{
  content: RichTextType;
}> = (props) => {
  const { content } = props;

  // console.log(content);
  if (content) {
    return <div className={styles["rich-text"]}><Serialize content={content} /></div>;
  }

  return null;
};
