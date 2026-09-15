// The task declaration as text, published for other packs: the reader that lifts fields
// out of a declaration, and the agentic defaults the loader fills — without a Node
// built-in, so a browser bundle can load it.
export {
  parseTaskDeclaration,
} from '../src/contract/task-declaration-text.mjs';
export {
  applyTaskDefaults,
} from '../src/contract/task-defaults.mjs';
