import React, { Fragment } from 'react';
import escapeHTML from 'escape-html';
import { Text } from 'slate';
import { RichTextNode, UploadRichText } from '.';
import Image from 'next/image';

export type Props = {
  content?: RichTextNode[];
};

const Serialize: React.FC<Props> = (props) => {
  const { content } = props;

  // console.log(content)

  if (content) {
    return (
      <Fragment>
        {content.map((incomingNode, i) => {
          const isTextNode = Text.isText(incomingNode);

          const node = {
            ...incomingNode,
          };

          const { text, bold, code, italic, underline, strikethrough, small, newTab } = node;

          if (isTextNode) {
            // convert straight single quotations to curly
            // "\u201C" is starting double curly
            // "\u201D" is ending double curly
            let sanitizedText = text?.replace(/'/g, '\u2019'); // single quotes

            // do not render empty nodes.
            const shouldRender = sanitizedText?.trim();

            if (shouldRender) {
              let Text = <span key={i} dangerouslySetInnerHTML={{ __html: escapeHTML(sanitizedText) }} />;

              if (bold) {
                Text = <strong key={i}>{sanitizedText}</strong>;
              }

              if (code) {
                Text = <code key={i}>{sanitizedText}</code>;
              }

              if (italic) {
                Text = <em key={i}>{sanitizedText}</em>;
              }

              if (underline) {
                Text = (
                  <span style={{ textDecoration: 'underline' }} key={i}>
                    {sanitizedText}
                  </span>
                );
              }

              if (strikethrough) {
                Text = (
                  <span style={{ textDecoration: 'line-through' }} key={i}>
                    {sanitizedText}
                  </span>
                );
              }

              if (small) {
                Text = <small key={i}>{sanitizedText}</small>;
              }

              return Text;
            }

            return null;
          }

          if (node) {
            switch (node.type) {
              case 'h1':
                return (
                  <h1 key={i}>
                    <Serialize content={node.children} />
                  </h1>
                );

              case 'h2':
                return (
                  <h2 key={i}>
                    <Serialize content={node.children} />
                  </h2>
                );

              case 'h3':
                return (
                  <h3 key={i}>
                    <Serialize content={node.children} />
                  </h3>
                );

              case 'h4':
                return (
                  <h4 key={i}>
                    <Serialize content={node.children} />
                  </h4>
                );

              case 'h5':
                return (
                  <h5 key={i}>
                    <Serialize content={node.children} />
                  </h5>
                );

              case 'h6':
                return (
                  <h6 key={i}>
                    <Serialize content={node.children} />
                  </h6>
                );

              case 'quote':
                return (
                  <blockquote key={i}>
                    <Serialize content={node.children} />
                  </blockquote>
                );

              case 'ul':
                return (
                  <ul key={i}>
                    <Serialize content={node.children} />
                  </ul>
                );

              case 'ol':
                return (
                  <ol key={i}>
                    <Serialize content={node.children} />
                  </ol>
                );

              case 'li':
                const hasListChildren = node.children
                  ? node.children.find((child) => child?.type && ['ul', 'ol'].includes(child.type))
                  : false;
                return (
                  <li key={i} style={{ listStyle: hasListChildren ? 'none' : undefined }}>
                    <Serialize content={node.children} />
                  </li>
                );

              case 'indent':
                return (
                  <div key={i}>
                    <Serialize content={node.children} />
                  </div>
                );

              case 'hr':
                return <hr />;

              case 'link':
                return (
                  // eslint-disable-next-line react/jsx-no-target-blank
                  <a target={newTab ? '_blank' : undefined} href={escapeHTML(node.url)} key={i}>
                    <Serialize content={node.children} />
                  </a>
                );

              case 'span':
                return (
                  <span key={i}>
                    <Serialize content={node.children} />
                  </span>
                );

              case 'upload':

                const imageValue = node.value as UploadRichText['value']
                return (
                  <span key={i}>
                    <Image
                      src={imageValue.url || ''}
                      alt={imageValue.altText}
                      width={imageValue.width}
                      height={imageValue.height}
                    />
                    {/* <img src={imageValue.value.url || ''} alt={imageValue.value.altText} /> */}
                  </span>
                );
              default:
                return (
                  <p key={i}>
                    <Serialize content={node.children} />
                  </p>
                );
            }
          }

          return null;
        })}
      </Fragment>
    );
  }

  return null;
};

export default Serialize;
