import React from 'react';
import Serialize from './serialize';

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
};

export type RichTextType = RichTextNode[];

export const RichText: React.FC<{
  content: RichTextType;
}> = (props) => {
  const { content } = props;

  if (content) {
    return <Serialize content={content} />;
  }

  return null;
};
