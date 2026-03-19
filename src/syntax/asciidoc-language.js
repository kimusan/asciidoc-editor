import { StreamLanguage } from "@codemirror/language";

function isLineStart(stream) {
  return stream.sol();
}

function matchInlineMarkup(stream) {
  if (stream.match(/https?:\/\/\S+/)) {
    return "url";
  }

  if (stream.match(/\*[^*\s][^*]*\*/)) {
    return "strong";
  }

  if (stream.match(/_[^_\s][^_]*_/)) {
    return "emphasis";
  }

  if (stream.match(/`[^`]+`/)) {
    return "quote";
  }

  return null;
}

export function asciidocLanguage() {
  return StreamLanguage.define({
    startState() {
      return {
        inBlock: false
      };
    },
    token(stream, state) {
      if (isLineStart(stream)) {
        if (stream.match(/^\/\/.*$/)) {
          return "comment";
        }

        if (stream.match(/^={1,6}\s+/)) {
          stream.skipToEnd();
          return "heading";
        }

        if (stream.match(/^\[[^\]]+\]/)) {
          return "attributeName";
        }

        if (stream.match(/^[*.-]+\s+/)) {
          return "keyword";
        }

        if (stream.match(/^:[\w-]+:/)) {
          stream.skipToEnd();
          return "attributeName";
        }

        if (stream.match(/^(include|ifdef|ifndef|ifeval)::/)) {
          stream.skipToEnd();
          return "keyword";
        }

        if (stream.match(/^(----|====|\+\+\+\+|____|\.\.\.\.)/)) {
          state.inBlock = !state.inBlock;
          return "modifier";
        }
      }

      if (state.inBlock && stream.match(/^[^\n]+/)) {
        return "string";
      }

      const inlineToken = matchInlineMarkup(stream);
      if (inlineToken) {
        return inlineToken;
      }

      stream.next();
      return null;
    }
  });
}
